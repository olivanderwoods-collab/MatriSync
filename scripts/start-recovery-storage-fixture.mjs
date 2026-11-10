// Static loopback fixture server; no privileged RPC, credentials or app data.
import {createServer} from "node:http";
import {build} from "esbuild";
import {recoveryBrowserBoundary} from "./recovery-browser-boundary.mjs";
const result=await build({entryPoints:["tests-care/recovery-storage-fixture.ts"],bundle:true,write:false,platform:"browser",format:"esm",target:"es2022",define:{"import.meta.env":"{}","process.env.NODE_ENV":"\"test\""},plugins:[recoveryBrowserBoundary()],logLevel:"silent"});
const html='<!doctype html><html><head><meta charset="utf-8"><title>MatriSync isolated storage check</title><style>body{font:18px system-ui;max-width:960px;margin:40px auto;color:#123e30}button{margin:8px;padding:12px;background:#e0f4e9;border:1px solid #137b52;border-radius:6px}pre{white-space:pre-wrap;padding:20px;background:#eff8f3}</style></head><body><script type="module" src="/fixture.js"></script></body></html>';
const server=createServer((req,res)=>{
  if(req.headers.host!=="127.0.0.1:4191"||req.method!=="GET"||req.headers.origin&&req.headers.origin!=="http://127.0.0.1:4191"){res.writeHead(403);res.end();return;}
  const path=new URL(req.url,"http://127.0.0.1:4191").pathname;
  res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if(path==="/"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(html);}
  else if(path==="/fixture.js"){res.setHeader("Content-Type","text/javascript; charset=utf-8");res.end(result.outputFiles[0].text);}
  else{res.writeHead(404);res.end();}
});
server.listen(4191,"127.0.0.1",()=>console.log("Synthetic storage fixture: http://127.0.0.1:4191/"));
