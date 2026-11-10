import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {LoopbackRecoveryClient} from "./recovery-remote";
import type {RecoveryInput} from "./recovery-protocol";
const origin="http://127.0.0.1:4192";
beforeEach(()=>vi.stubGlobal("location",{origin}));
afterEach(()=>vi.unstubAllGlobals());
describe("loopback recovery client boundaries",()=>{
  it.each(["https://matrisync-c9de7.web.app","http://localhost:4192","http://127.0.0.1:5173"])("refuses to transmit from %s",async value=>{
    vi.stubGlobal("location",{origin:value});const fetch=vi.fn(),token=vi.fn(async()=>"synthetic-token");vi.stubGlobal("fetch",fetch);
    await expect(new LoopbackRecoveryClient(token).reconcile(crypto.randomUUID())).rejects.toThrow("restricted");expect(token).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it("does not replay a failed network request",async()=>{
    const fetch=vi.fn(async()=>{throw TypeError("Injected network failure");});vi.stubGlobal("fetch",fetch);
    await expect(new LoopbackRecoveryClient(async()=>"synthetic-token").reconcile(crypto.randomUUID())).rejects.toThrow("network failure");expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("captures original request bytes before refreshing a token",async()=>{
    let ready!:()=>void;const gate=new Promise<void>(resolve=>ready=resolve),fetch=vi.fn(async()=>new Response(JSON.stringify({result:{saved:true}})));vi.stubGlobal("fetch",fetch);
    const input={version:1,id:"original-id",uid:"original-account"} as RecoveryInput;
    const pending=new LoopbackRecoveryClient(async()=>{await gate;return "synthetic-token";}).request(input);input.uid="changed-account";ready();await pending;
    const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit];expect(url).toBe(`${origin}/v1/recovery`);expect(JSON.parse(init.body as string).input.uid).toBe("original-account");
    expect(init).toMatchObject({method:"POST",credentials:"omit",mode:"same-origin",redirect:"error",cache:"no-store"});
  });
  it.each(["", "x".repeat(8193)])("refuses absent or oversized tokens",async token=>{
    const fetch=vi.fn();vi.stubGlobal("fetch",fetch);await expect(new LoopbackRecoveryClient(async()=>token).reconcile("id")).rejects.toThrow("session");expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds command bytes before fetching a token",async()=>{
    const token=vi.fn(async()=>"synthetic"),fetch=vi.fn();vi.stubGlobal("fetch",fetch);await expect(new LoopbackRecoveryClient(token).reconcile("x".repeat(50000))).rejects.toThrow("large");expect(token).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it.each([JSON.stringify({result:null,authority:"forged"}),"{",JSON.stringify({error:"raw internal error"}),"x".repeat(65537)])("refuses malformed response envelopes",async response=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(response)));await expect(new LoopbackRecoveryClient(async()=>"synthetic").reconcile("id")).rejects.toThrow();
  });
  it("does not treat an HTTP failure as absence or show internal response text",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("private internal failure",{status:409})));
    await expect(new LoopbackRecoveryClient(async()=>"synthetic").reconcile("id")).rejects.toThrow("Reconcile the same operation");
  });
});
