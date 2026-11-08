// Local submission launcher. Does not flash hardware or connect to live Firebase.
import { spawn, spawnSync } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePresentation } from "./presentation-scenario.mjs";
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
mkdirSync(".local-tools/presentation", { recursive: true });
const children = [];
const lock = createServer(socket => socket.end("MatriSync presentation is already open.\n"));
lock.on("error", () => { console.error("Presentation already running. Use the prepared Edge windows."); process.exit(1); });
await new Promise(resolve => lock.listen(4176, "127.0.0.1", resolve));
function listening(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.once("connect", () => done(true)); socket.once("error", () => done(false)); socket.setTimeout(1000, () => done(false));
  });
}
function run(args, env = process.env) {
  const child = spawn(process.execPath, args, { stdio: "inherit", windowsHide: true, env });
  children.push(child); child.on("error", e => { console.error(e); process.exitCode = 1; });
  return child;
}
async function ready(port) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (await listening(port)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw Error(`Local service on port ${port} did not start. See presentation.log.`);
}
let contexts = [];
async function close() {
  for (const context of contexts) await context.close().catch(() => {});
  for (const child of children) if (child.exitCode === null && child.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    else child.kill();
  }
  lock.close();
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void close().finally(() => process.exit()); });
try {
  const cli = ".local-tools/node_modules/firebase-tools/lib/bin/firebase.js";
  const java = path.resolve(".local-tools/java/jdk-21.0.12.1+1-jre");
  const env = { ...process.env, JAVA_HOME: java, PATH: `${java}/bin${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, JAVA_TOOL_OPTIONS: "-Djdk.net.unixdomain.tmpdir=." };
  for (const [port, only, config] of [[9099, "auth", "firebase.json"], [8087, "firestore", "firebase.sharing.json"]]) {
    if (!await listening(port)) {
      if (!existsSync(cli)) throw Error("This checkout needs the documented local Firebase toolchain before first use.");
      run([cli, "emulators:start", "--only", only, "--project", "demo-matrisync", "--config", config], env);
      await ready(port);
    }
  }
  if (await listening(4174)) throw Error("Port 4174 is occupied. Close the development test preview before starting the presentation; no process was stopped.");
  if (!existsSync(".local-tools/submission-dist/index.html")) {
    const build = run(["scripts/build-submission.mjs"]);
    await new Promise((resolve, reject) => build.once("exit", code => code === 0 ? resolve() : reject(Error("Submission build failed."))));
  }
  run(["node_modules/vite/bin/vite.js", "preview", "--outDir", ".local-tools/submission-dist", "--host", "127.0.0.1", "--port", "4174", "--strictPort"]);
  await ready(4174);
  const result = await preparePresentation({ headless: process.env.PRESENTATION_HEADLESS === "1" });
  contexts = result.contexts;
  if (process.env.PRESENTATION_HEADLESS === "1") await close();
  else {
    // Keep services and the four real application windows available until closed.
    await Promise.all(contexts.map(context => new Promise(resolve => context.once("close", resolve))));
    contexts = []; await close();
  }
} catch (error) {
  console.error(error); await close(); process.exitCode = 1;
}
