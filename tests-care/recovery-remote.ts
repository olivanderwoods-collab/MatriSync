// Browser-safe client for the isolated loopback harness, never the public app.
import type {RecoveryInput,RecoveryOffer,Approval,Decision,Closure,ClosedDecision,RecoveryOutcome,Authority} from "./recovery-protocol";
const origin="http://127.0.0.1:4192";
export type RecoveryInspection={uid:string;decision:Decision;authority:Authority};
export class LoopbackRecoveryClient{
  constructor(private readonly token:()=>Promise<string>){}
  private async call(action:string,input:unknown):Promise<unknown>{
    if(location.origin!==origin)throw Error("Recovery transport is restricted to the isolated loopback fixture.");
    // Copy now, before token refresh; a caller cannot mutate an approved request
    // while asynchronous authentication is in progress.
    const body=JSON.stringify({action,input});if(new TextEncoder().encode(body).length>48*1024)throw Error("Recovery input too large.");
    const token=await this.token();if(typeof token!=="string"||token.length>8192||!token)throw Error("Recovery session required.");
    const response=await fetch(`${origin}/v1/recovery`,{method:"POST",mode:"same-origin",credentials:"omit",cache:"no-store",redirect:"error",headers:{"Content-Type":"application/json","X-MatriSync-Recovery":"1",Authorization:`Bearer ${token}`},body,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error("Recovery outcome unavailable. Reconcile the same operation before retry.");
    const text=await response.text();if(text.length>65536)throw Error("Invalid recovery response.");
    const value:unknown=JSON.parse(text);
    if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).join()!=="result")throw Error("Invalid recovery response.");
    return (value as {result:unknown}).result;
  }
  request(value:RecoveryInput){return this.call("request",value) as Promise<RecoveryOffer>;}
  approve(value:Approval){return this.call("approve",value) as Promise<Decision>;}
  close(value:Closure){return this.call("close",value) as Promise<ClosedDecision>;}
  async reconcile(id:string){return (await this.call("reconcile",id)??undefined) as RecoveryOutcome|undefined;}
  inspect(id:string){return this.call("inspect",id) as Promise<RecoveryInspection>;}
}
