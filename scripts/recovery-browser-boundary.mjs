// Build-time guard for the isolated browser fixture. Never imported by the app.
import {builtinModules} from "node:module";
const builtins=new Set(builtinModules.map(name=>name.replace(/^node:/,"")));
export function recoveryBrowserBoundary(){
  return {name:"recovery-browser-boundary",setup(build){
    build.onResolve({filter:/.*/},args=>{
      const path=args.path.replaceAll("\\","/");
      if(path.startsWith("node:")||builtins.has(path)||
        /(?:^|\/)recovery-(?:sqlite|databases|emulator|verifier|.*worker)(?:\.[cm]?[jt]s)?$/.test(path)||
        /(?:^|\/)scripts\/identity(?:\/|$)/.test(path))
        return {errors:[{text:`Privileged dependency is forbidden in the isolated recovery browser: ${args.path}`}]};
    });
  }};
}
