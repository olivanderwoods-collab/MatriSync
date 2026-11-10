// Node-only encrypted persistence. Never import this from browser entry points.
import {EncryptedRecoveryDatabase,type StoragePoint} from "./recovery-sqlite";
import {IMPORT_DOMAIN,type ImportRow} from "./recovery-import";
import type {ExportPackage} from "./recovery-export";

export class ImportDatabase extends EncryptedRecoveryDatabase<ImportRow>{
  constructor(path:string,key:Uint8Array,storeId:string,options:{fault?:(point:StoragePoint)=>void;lockWaitMs?:number}={}){
    super(path,key,storeId,{version:1,purpose:`${IMPORT_DOMAIN}:sqlite-v1`,limit:32*1024*1024,decode:value=>{
      if(!Array.isArray(value)||value.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=="string"||!row[1]||row[1].id!==row[0]||!["session","record"].includes(row[1].type))||new Set(value.map(row=>row[0])).size!==value.length)throw Error("Invalid isolated import state.");
      return new Map(value);
    }},options);
  }
}

export class ExportDatabase extends EncryptedRecoveryDatabase<ExportPackage>{
  constructor(path:string,key:Uint8Array,storeId:string,options:{fault?:(point:StoragePoint)=>void;lockWaitMs?:number}={}){
    super(path,key,storeId,{version:1,purpose:`${IMPORT_DOMAIN}:export-sqlite-v1`,limit:32*1024*1024,decode:value=>{
      if(!Array.isArray(value)||value.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=="string"||!row[1]||row[1].id!==row[0])||new Set(value.map(row=>row[0])).size!==value.length)throw Error("Invalid isolated export state.");
      return new Map(value);
    }},options);
  }
}
