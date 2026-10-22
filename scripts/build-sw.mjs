import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await files(path)));
    else if (entry.name !== "sw.js") result.push(path);
  }
  return result;
}
const root = process.argv[2] || "dist";
const paths = await files(root);
const hash = createHash("sha256");
for (const path of paths.sort()) hash.update(await readFile(path));
const version = hash.digest("hex").slice(0, 12);
const all = paths.map((p) => "/" + p.slice(root.length + 1));
const optional = all.filter(
  (p) =>
    p.startsWith("/ai-runtime/") ||
    p.startsWith("/assets/ai-") ||
    p.startsWith("/assets/ort-"),
);
const assets = all.filter((p) => !optional.includes(p));
await writeFile(
  `${root}/sw.js`,
  `// Public static assets only. Never stores navigation responses, Auth responses or mutable session data.
const CACHE='matrisync-shell-${version}';
const ASSETS=${JSON.stringify(assets)};
const OPTIONAL=${JSON.stringify(optional)};
const AI_CACHE='matrisync-ai-runtime-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('matrisync-shell-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const request=event.request;const url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(cache=>cache.match('/index.html').then(cached=>cached||fetch('/index.html'))));return;}
 if(url.search)return;
 if(OPTIONAL.includes(url.pathname)){
  event.respondWith(caches.open(AI_CACHE).then(async cache=>{const hit=await cache.match(url.pathname);if(hit)return hit;const response=await fetch(request);if(response.ok)await cache.put(url.pathname,response.clone());return response;}));return;
 }
 if(!ASSETS.includes(url.pathname))return;
 event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname).then(cached=>cached||fetch(request))));
});
`,
);
console.log(
  `Built public shell cache ${version}: ${assets.length} static assets.`,
);
