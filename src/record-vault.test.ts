import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { RecordVault } from "./record-vault";
import { cloudRecords, patientInput, validatedDocument } from "./records-model";
import {
  readVault,
  commitVault,
  VAULT_DB,
  readDeviceKey,
} from "./vault-storage";
import { deriveVaultKey, newSalt, seal, unseal } from "./vault-crypto";
const pass = "a separate test vault phrase";
const authorize = async () => {};

describe("encrypted device records", () => {
  it("isolates unlinked family records and preserves them when clinicians save", async () => {
    const uid = crypto.randomUUID();
    const mother = new RecordVault(uid, authorize, "mother");
    await mother.openOnDevice();
    await mother.savePatient(
      { name: "Private Mother", birthDate: "", history: "" },
      "self",
    );
    const child = await mother.savePatient({
      name: "Private Child",
      birthDate: "2024-01-01",
      history: "Keep notes",
      kind: "child",
      child: { sex: "", bloodGroup: "B+", allergies: "" },
    });
    const original = new File(
      ["%PDF-1.7\nPrivate child original"],
      "child.pdf",
      { type: "application/pdf" },
    );
    await mother.addDocument(
      child,
      "reports",
      original,
      "Original source",
      "2026-10-20",
    );
    const document = mother.data!.documents[0].id;
    const envelope = await readVault(uid);
    mother.lock();
    const professional = new RecordVault(uid, authorize, "professional");
    await professional.openOnDevice();
    expect(professional.data!.patients).toEqual([]);
    expect(professional.data!.documents).toEqual([]);
    expect(await professional.ownCompanionProfile()).toBeUndefined();
    await expect(professional.document(document)).rejects.toThrow(
      "not available",
    );
    await expect(
      professional.addDocument(child, "reports", original, "", ""),
    ).rejects.toThrow("not available");
    await expect(
      professional.savePatient(
        { name: "Reclassified", birthDate: "", history: "", kind: "mother" },
        child,
      ),
    ).rejects.toThrow("not available");
    await expect(
      professional.savePatient(
        { name: "Mother overwrite", birthDate: "", history: "" },
        "self",
      ),
    ).rejects.toThrow("not available");
    expect(await readVault(uid)).toEqual(envelope);
    const clinical = await professional.savePatient({
      name: "Clinician-created patient",
      birthDate: "",
      history: "",
    });
    expect(professional.data!.patients.map((p) => p.id)).toEqual([clinical]);
    professional.lock();
    await mother.openOnDevice();
    expect(mother.data!.patients.map((p) => p.id)).toEqual(["self", child]);
    expect(mother.data!.patients.find((p) => p.id === child)?.history).toBe(
      "Keep notes",
    );
    expect(
      new TextDecoder().decode((await mother.document(document)).bytes),
    ).toBe(await original.text());
    await expect(
      mother.savePatient(
        { name: "Not owned", birthDate: "", history: "" },
        clinical,
      ),
    ).rejects.toThrow("not available");
    await mother.savePatient(
      { name: "Updated Mother", birthDate: "", history: "" },
      "self",
    );
    await professional.openOnDevice();
    expect(professional.data!.patients.map((p) => p.id)).toEqual([clinical]);
    const organization = new RecordVault(uid, authorize, "organization");
    await organization.openOnDevice();
    expect(organization.data!.patients).toEqual([]);
    await expect(organization.document(document)).rejects.toThrow(
      "not available",
    );
  });
  it("preserves encrypted professional/facility details and credential bytes without granting verification", async () => {
    const uid = crypto.randomUUID();
    const vault = new RecordVault(uid, authorize);
    await vault.openOnDevice();
    const bytes = "%PDF-1.7\nSynthetic credential";
    await vault.saveAccountProfile(
      "professional",
      {
        name: "Private clinician",
        profession: "Doctor",
        registrationNumber: "SYNTHETIC-001",
        verified: "true",
      },
      new File([bytes], "credential.pdf", { type: "application/pdf" }),
    );
    await vault.saveAccountProfile("organization", {
      name: "Private facility",
      phone: "TEST-PHONE",
    });
    expect(
      vault.data?.accountProfiles?.professional?.fields.verified,
    ).toBeUndefined();
    expect(JSON.stringify(await readVault(uid))).not.toContain(
      "Private clinician",
    );
    const code = vault.data!.accountProfiles!.professional!.code;
    vault.lock();
    await vault.openOnDevice();
    expect(vault.data?.accountProfiles?.professional?.code).toBe(code);
    expect(
      new TextDecoder().decode(
        (await vault.accountCredential("professional")).bytes,
      ),
    ).toBe(bytes);
    const other = new RecordVault(crypto.randomUUID(), authorize);
    await other.openOnDevice();
    await expect(other.accountCredential("professional")).rejects.toThrow(
      "No saved",
    );
  });
  it("keeps children separate and preserves document/profile details through edits", async () => {
    const vault = new RecordVault(crypto.randomUUID(), authorize, "mother");
    await vault.openOnDevice();
    const one = await vault.savePatient({
      name: "First Child",
      birthDate: "2024-01-01",
      history: "",
      kind: "child",
      child: { sex: "", bloodGroup: "B+", allergies: "" },
    });
    const two = await vault.savePatient({
      name: "Second Child",
      birthDate: "2025-01-01",
      history: "",
      kind: "child",
      child: { sex: "", bloodGroup: "", allergies: "" },
    });
    expect(one).not.toBe(two);
    await vault.addDocument(
      one,
      "reports",
      new File(["%PDF-1.7\nChild one"], "child-one.pdf", {
        type: "application/pdf",
      }),
      "",
      "",
    );
    vault.lock();
    await vault.openOnDevice();
    expect(vault.data?.patients.find((p) => p.id === one)?.parentId).toBe(
      "self",
    );
    expect(vault.data?.documents.filter((d) => d.patientId === two)).toEqual(
      [],
    );
    expect(await vault.ownCompanionProfile()).toBeUndefined();
  });
  it("opens new device records automatically and isolates account keys", async () => {
    const uid = crypto.randomUUID();
    const first = new RecordVault(uid, authorize);
    expect(await first.openOnDevice()).toBe(true);
    await first.savePatient({
      name: "Automatic private record",
      birthDate: "",
      history: "",
    });
    const key = (await readDeviceKey(uid))!;
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
    first.lock();
    const second = new RecordVault(uid, authorize);
    expect(await second.openOnDevice()).toBe(true);
    expect(second.data?.patients[0].name).toBe("Automatic private record");
    const other = new RecordVault(crypto.randomUUID(), authorize);
    await other.openOnDevice();
    expect(other.data?.patients).toEqual([]);
  });
  it("migrates legacy access without changing ciphertext or original file bytes", async () => {
    const uid = crypto.randomUUID();
    const legacy = new RecordVault(uid, authorize);
    await legacy.unlock(pass, true);
    const id = await legacy.savePatient({
      name: "Legacy",
      birthDate: "",
      history: "Preserve",
    });
    await legacy.addDocument(
      id,
      "reports",
      new File(["%PDF-1.7\nKeep original"], "original.pdf", {
        type: "application/pdf",
      }),
      "",
      "",
    );
    const documentId = legacy.data!.documents[0].id;
    const envelope = await readVault(uid);
    const bytes = (await legacy.document(documentId)).bytes;
    legacy.lock();
    const next = new RecordVault(uid, authorize);
    expect(await next.openOnDevice()).toBe(false);
    expect(await readVault(uid)).toEqual(envelope);
    await expect(
      next.unlock("incorrect legacy passphrase", false),
    ).rejects.toThrow();
    expect(await readDeviceKey(uid)).toBeUndefined();
    await next.unlock(pass, false);
    await next.enableDeviceAccess();
    expect(await readVault(uid)).toEqual(envelope);
    next.lock();
    expect(await next.openOnDevice()).toBe(true);
    expect((await next.document(documentId)).bytes).toEqual(bytes);
  });
  it("rejects an automatic open after account change and concurrent initialization", async () => {
    const uid = crypto.randomUUID();
    const first = new RecordVault(uid, authorize);
    const opening = first.openOnDevice();
    first.lock();
    await expect(opening).rejects.toThrow("Account changed");
    expect(first.data).toBeUndefined();
    const a = new RecordVault(uid, authorize),
      b = new RecordVault(uid, authorize);
    const results = await Promise.allSettled([
      a.openOnDevice(),
      b.openOnDevice(),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const reopened = new RecordVault(uid, authorize);
    await expect(reopened.openOnDevice()).resolves.toBe(true);
    expect(reopened.data?.patients).toEqual([]);
  });
  it("persists patients and original documents encrypted and survives reopening", async () => {
    const uid = crypto.randomUUID();
    const vault = new RecordVault(uid, authorize);
    await vault.unlock(pass, true);
    const id = await vault.savePatient({
      name: "Private Patient",
      birthDate: "2000-02-29",
      history: "Confidential history",
    });
    const file = new File(
      ["%PDF-1.7\nPrivate report contents"],
      "Secret report.pdf",
      { type: "application/pdf" },
    );
    await vault.addDocument(
      id,
      "reports",
      file,
      "Private Facility",
      "2026-10-20",
    );
    const doc = vault.data!.documents[0];
    const before = await vault.document(doc.id);
    expect(new TextDecoder().decode(before.bytes)).toBe(await file.text());
    const storage = await new Promise<unknown[]>((resolve) => {
      const request = indexedDB.open(VAULT_DB);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(["files", "vaults"], "readonly");
        const a = tx.objectStore("files").getAll();
        const b = tx.objectStore("vaults").getAll();
        tx.oncomplete = () => {
          db.close();
          resolve([a.result, b.result]);
        };
      };
    });
    for (const plaintext of [
      "Private Patient",
      "Private Facility",
      "Secret report.pdf",
      "Confidential history",
      "Private report contents",
      pass,
    ])
      expect(JSON.stringify(storage)).not.toContain(plaintext);
    const cloud = JSON.stringify(cloudRecords(vault.data!));
    expect(cloud).toContain("Private Patient");
    expect(cloud).not.toContain("Secret report.pdf");
    expect(cloud).not.toContain("documents");
    expect(cloud).not.toContain(doc.id);
    vault.lock();
    expect(vault.data).toBeUndefined();
    await expect(vault.document(doc.id)).rejects.toThrow("Unlock");
    await expect(vault.unlock("wrong vault passphrase", false)).rejects.toThrow(
      "Unable to unlock",
    );
    expect(vault.data).toBeUndefined();
    await vault.unlock(pass, false);
    expect(vault.data!.patients[0].name).toBe("Private Patient");
    expect((await vault.document(doc.id)).bytes).toEqual(before.bytes);
  });
  it("rejects account substitution, tampering and exporting the encryption key", async () => {
    const key = await deriveVaultKey(pass, newSalt());
    await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
    const bytes = new TextEncoder().encode("private");
    const a = await seal(key, bytes, "owner:file:1");
    const b = await seal(key, bytes, "owner:file:1");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    await expect(unseal(key, a, "stranger:file:1")).rejects.toThrow();
    await expect(
      unseal(
        key,
        {
          ...a,
          ciphertext: `${a.ciphertext[0] === "A" ? "B" : "A"}${a.ciphertext.slice(1)}`,
        },
        "owner:file:1",
      ),
    ).rejects.toThrow();
  });
  it("does not overwrite concurrent changes or partially commit files", async () => {
    const uid = crypto.randomUUID();
    const one = new RecordVault(uid, authorize);
    const two = new RecordVault(uid, authorize);
    await one.unlock(pass, true);
    await two.unlock(pass, false);
    await one.savePatient({ name: "First change", birthDate: "", history: "" });
    await expect(
      two.savePatient({ name: "Stale change", birthDate: "", history: "" }),
    ).rejects.toThrow("another tab");
    two.lock();
    await two.unlock(pass, false);
    expect(two.data!.patients.map((p) => p.name)).toEqual(["First change"]);
    const envelope = (await readVault(uid))!;
    await expect(commitVault(uid, "stale", envelope)).rejects.toThrow(
      "another tab",
    );
    expect(await readVault(uid)).toEqual(envelope);
  });
  it("checks account ownership again on every save and download", async () => {
    let allowed = true;
    const vault = new RecordVault(crypto.randomUUID(), async () => {
      if (!allowed) throw Error("Account changed");
    });
    await vault.unlock(pass, true);
    const id = await vault.savePatient({
      name: "Owner",
      birthDate: "",
      history: "",
    });
    await vault.addDocument(
      id,
      "prescriptions",
      new File(["%PDF-1.7\noriginal"], "original.pdf", {
        type: "application/pdf",
      }),
      "",
      "",
    );
    allowed = false;
    await expect(
      vault.savePatient({ name: "Unauthorized", birthDate: "", history: "" }),
    ).rejects.toThrow("Account changed");
    await expect(vault.document(vault.data!.documents[0].id)).rejects.toThrow(
      "Account changed",
    );
    expect(vault.data!.patients).toHaveLength(1);
  });
  it("cancels an unlock that completes after a lock", async () => {
    const vault = new RecordVault(crypto.randomUUID(), authorize);
    const opening = vault.unlock(pass, true);
    vault.lock();
    await expect(opening).rejects.toThrow("locked");
    expect(vault.data).toBeUndefined();
    expect(await vault.exists()).toBe(false);
  });
  it("validates impossible dates and file signatures without claiming clinical verification", async () => {
    expect(() => patientInput("Name", "2025-02-31", "")).toThrow();
    expect(() => patientInput(" ", "", "")).toThrow();
    await expect(
      validatedDocument(
        new File(["<script>evil()</script>"], "report.pdf", {
          type: "application/pdf",
        }),
      ),
    ).rejects.toThrow("content");
    await expect(
      validatedDocument(
        new File(["%PDF-1.7"], "picture.jpg", { type: "image/jpeg" }),
      ),
    ).rejects.toThrow("content");
    await expect(
      validatedDocument(new File([], "empty.pdf", { type: "application/pdf" })),
    ).rejects.toThrow("10 MB");
  });
});
