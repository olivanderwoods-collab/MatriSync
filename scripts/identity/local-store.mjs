// Hard-coded local emulator adapter. No configurable live endpoint or credentials.
const database = "projects/demo-matrisync/databases/(default)";
const root = `http://127.0.0.1:8087/v1/${database}/documents`;
const pathPattern = /^(?:[A-Za-z0-9_-]+\/)+[A-Za-z0-9_-]+$/;
function name(path) {
  if (!pathPattern.test(path) || path.split("/").length % 2) throw Error("Invalid identity storage path.");
  return `${database}/documents/${path}`;
}
function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
}
function decode(value) {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([k,v]) => [k,decode(v)]));
}
async function rpc(method, body) {
  const response = await fetch(`${root}:${method}`, { method: "POST",
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const result = await response.json();
  // Streaming batchGet may report a gRPC failure inside a successful HTTP response.
  const failure = result.error || (Array.isArray(result) ? result.find(entry => entry.error)?.error : undefined);
  if (!response.ok || failure) {
    const error = new Error("Local identity storage operation failed.");
    error.status = response.status;
    error.retryable = response.status === 409 || failure?.status === "ABORTED" || [10, 409].includes(failure?.code);
    throw error;
  }
  return result;
}
export async function identityTransaction(work) {
  let retryTransaction;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { transaction } = await rpc("beginTransaction", { options: { readWrite: retryTransaction ? { retryTransaction } : {} } });
    const writes = [];
    try {
      const result = await work({
        async get(path) {
          if (writes.length) throw Error("Read identity authority before preparing writes.");
          const entries = await rpc("batchGet", { documents: [name(path)], transaction });
          const entry = entries[0];
          if (entry?.missing) return undefined;
          if (!entry?.found) throw Error("Invalid local identity read.");
          return decode({ mapValue: { fields: entry.found.fields } });
        },
        put(path, value, createOnly = false) {
          writes.push({ update: { name: name(path), fields: encode(value).mapValue.fields },
            ...(createOnly ? { currentDocument: { exists: false } } : {}) });
        },
      });
      await rpc("commit", { transaction, writes });
      return result;
    } catch (error) {
      await rpc("rollback", { transaction }).catch(() => {});
      if (!error.retryable || attempt === 4) throw error;
      retryTransaction = transaction;
      await new Promise(resolve => setTimeout(resolve, 25 + Math.floor(Math.random() * 75)));
    }
  }
  throw Error("Identity operation could not be committed.");
}
