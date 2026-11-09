import {defineConfig} from "vite";
const env={VITE_CARE_ENABLED:"1",VITE_SHARING_PILOT:"0",VITE_FIREBASE_API_KEY:"emulator-only-key",VITE_FIREBASE_AUTH_DOMAIN:"demo-matrisync.firebaseapp.com",VITE_FIREBASE_PROJECT_ID:"demo-matrisync",VITE_FIREBASE_APP_ID:"emulator-only-app",VITE_FIREBASE_AUTH_EMULATOR_URL:"http://127.0.0.1:9099"};
export default defineConfig({esbuild:{jsx:"automatic"},define:Object.fromEntries(Object.entries(env).map(([k,v])=>[`import.meta.env.${k}`,JSON.stringify(v)])),server:{host:"127.0.0.1",port:4183,strictPort:true}});
