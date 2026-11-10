// Explicit entry for a future isolated browser fixture, NOT the public app.
// Persistence and authoritative reconciliation are supplied separately; exports
// never initialize a database, enroll keys, approve recovery or send a handoff.
export {RECOVERY_DOMAIN,bytes,digest,requestClaims,possessionClaims,approvalClaims,closureClaims} from "./recovery-protocol";
export type {RecoveryInput,RecoveryRequest,RecoveryOffer,Approval,Closure,ClosureStatus,Decision,ClosedDecision,RecoveryOutcome,Authority,RecoveryReconciler,RecoveryTransactionStore} from "./recovery-protocol";
export {IMPORT_DOMAIN,IMPORT_LIMIT,IsolatedRecoveryImport,manifestClaims,rawDigest,sealImportManifest,sealImportObject,verifyImportAcknowledgement} from "./recovery-import";
export type {Descriptor,Manifest,ImportReceipt,ImportRow,ImportedRecord} from "./recovery-import";
export {IsolatedRecoveryExport} from "./recovery-export";
export type {ExportPackage} from "./recovery-export";
export {sourceIdentity,sourceChoices,reviewSourceSelection,captureSourceSelection,sourceSession} from "./recovery-source";
export type {SourceChoice} from "./recovery-source";
export {validateImportRecord} from "./recovery-import-records";
export type {ImportKind} from "./recovery-import-records";
export {BrowserImportDatabase,BrowserExportDatabase} from "./recovery-indexeddb";
export type {BrowserStoreBinding,BrowserStoreFault} from "./recovery-indexeddb";
