// Privileged, loopback-only emulator harness. Never imported into a browser.
import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import type {EmulatorRecoveryBoundary} from "./recovery-emulator";

const origin="http://127.0.0.1:4192",maxBody=48*1024;
type Boundary=Pick<EmulatorRecoveryBoundary,"request"|"approve"|"close"|"reconcile"|"inspect">;
export type RecoveryAction=keyof Boundary;
const actions:RecoveryAction[]=["request","approve","close","reconcile","inspect"];
function reply(res:ServerResponse,status:number,value:unknown){res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'"});res.end(JSON.stringify(value));}
function read(req:IncomingMessage):Promise<unknown>{
  return new Promise((resolve,reject)=>{
    const chunks:Buffer[]=[];let size=0,failed=false;
    const fail=(error:Error)=>{if(!failed){failed=true;chunks.length=0;reject(error);}};
    req.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>maxBody)fail(Error("Body limit"));else if(!failed)chunks.push(chunk);});
    req.on("end",()=>{if(failed)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{fail(Error("Invalid JSON"));}});
    req.on("aborted",()=>fail(Error("Request interrupted")));req.on("error",()=>fail(Error("Request interrupted")));
    req.setTimeout(8000,()=>{fail(Error("Request timeout"));req.destroy();});
  });
}
export function recoveryTransport(boundary:Boundary,options:{afterDispatch?:(action:RecoveryAction)=>boolean}={}){
  let active=0;
  const server=createServer(async(req,res)=>{
    if(req.socket.remoteAddress!=="127.0.0.1"||req.headers.host!=="127.0.0.1:4192"||req.headers.origin!==origin||
      req.headers["sec-fetch-site"]&&req.headers["sec-fetch-site"]!=="same-origin")return reply(res,403,{error:"Local recovery request refused."});
    if(req.method!=="POST"||req.url!=="/v1/recovery")return reply(res,404,{error:"Recovery route unavailable."});
    if(req.headers["content-type"]!=="application/json"||req.headers["x-matrisync-recovery"]!=="1"||req.headers["content-encoding"]||req.headers.cookie)
      return reply(res,400,{error:"Unsupported recovery request."});
    const authorization=req.headers.authorization;
    if(typeof authorization!=="string"||authorization.length>8200||!/^Bearer [A-Za-z0-9_.-]+$/.test(authorization))return reply(res,401,{error:"Recovery session required."});
    if(req.headers["content-length"]&&(!/^\d+$/.test(req.headers["content-length"])||Number(req.headers["content-length"])>maxBody))return reply(res,413,{error:"Recovery input too large."});
    if(active>=8)return reply(res,429,{error:"Recovery service busy; reconcile before retry."});
    active++;
    try{
      let value:unknown;try{value=await read(req);}catch{return reply(res,400,{error:"Invalid or oversized recovery input."});}
      if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join()!=="action,input")return reply(res,400,{error:"Unsupported recovery command."});
      const command=value as {action:RecoveryAction;input:unknown};
      if(!actions.includes(command.action)||Buffer.byteLength(JSON.stringify(command.input))>32768)return reply(res,400,{error:"Unsupported recovery command."});
      if(["inspect","reconcile"].includes(command.action)&&typeof command.input!=="string")return reply(res,400,{error:"Recovery operation ID required."});
      try{
        const token=authorization.slice(7);
        const result=command.action==="inspect"||command.action==="reconcile"?await boundary[command.action](token,command.input as string):await boundary[command.action](token,command.input);
        if(options.afterDispatch?.(command.action)){res.destroy();return;}
        reply(res,200,{result:result??null});
      }catch{reply(res,409,{error:"Recovery outcome unavailable. Reconcile the same operation before retry."});}
    }finally{active--;}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
  // No token, key, request body or internal error logging. No CORS or provisioning
  // endpoint. The harness owner must call listen on 127.0.0.1:4192 explicitly.
  return server;
}
