// Dependency-free preview of the production build, with SPA deep-link fallback.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir')+1] : 'dist');const port=Number((process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port")+1] : undefined) || process.env.PORT || 4173);
const types={'.mjs':'application/javascript; charset=utf-8','.wasm':'application/wasm','.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const hostingHeaders = process.env.TEST_HOSTING_HEADERS === '1' ? JSON.parse(await readFile('firebase.json','utf8')).hosting.headers.find(rule=>rule.source==='**').headers : [];
const server=http.createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let file=path.resolve(root,'.'+pathname);
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{if(!(await stat(file)).isFile())file=path.join(root,'index.html');}catch{if(path.extname(pathname)){res.writeHead(404).end();return;}file=path.join(root,'index.html');}
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  for (const header of hostingHeaders) res.setHeader(header.key, header.key==='Content-Security-Policy' && process.env.VITE_FIREBASE_PROJECT_ID==='demo-matrisync' ? header.value.replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:8086 http://127.0.0.1:9099") : header.value);
  res.setHeader('Cache-Control','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
  res.end(req.method==='HEAD'?undefined:await readFile(file));
 }catch{res.writeHead(500).end('Unable to open the preview. Run pnpm build first.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`MatriSync preview: http://127.0.0.1:${port}/`));
