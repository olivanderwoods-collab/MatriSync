# Phase 1 capability inventory

| Capability | UI location | Status | Dependency for future activation |
|---|---|---|---|
| Role selection, route navigation, Back/Forward, reload | All roles | Working | None |
| Guest start, reset, logout, session preferences | Public/auth/settings | Working; memory fallback disclosed | None |
| Mother journey stages | Mother / My Journey | Working preview | Approved clinical/profile persistence scope |
| Maternal records and child-specific tabs | Mother / My Health, My Children | Read-only synthetic preview | Authorized data model, provenance, consent |
| Sample patient profiles and prescription layouts | Professional, Organization | Read-only synthetic preview | Professional verification, least-privilege records |
| Email/password signup/login/restoration/logout | Auth screens | Configured implementation; successful live session unverified | Existing Firebase Auth project; no additional backend |
| Light/Dark/System | Settings | Working | None |
| Five preferred languages | Settings | Working selector; explicit English fallback | Reviewed bundled translations |
| Public offline shell, update notice | Production build | Desktop browser offline test passed | Device/browser install acceptance |
| AI companion / MatriSathi | Mother | Coming Soon; topic navigation works | Approved educational scope, content/model evaluation |
| Documentation extraction / MatriBridge | Professional | Coming Soon; workflow preview | Source provenance, human review, approved service |
| Referrals / MatriFlow / Patient Received | All roles | Coming Soon; example timeline and directions | Authorized handoff workflow, recipient access |
| MatriWatch | Professional | Coming Soon; operational examples | Defined timers/recipients, validated operations |
| Follow-up scheduling/reminders/completion | All roles | Coming Soon; reason/tests/date preview | Clinician input, approved delivery channels |
| Drug/herb search, recognition, interaction reference | Professional / Drug Safety Assistant | Coming Soon; no answers or calculations | Reviewed sources/licensing; resolved clinical scope |
| MatriVitals | Professional | Coming Soon | Device specifications, validation, data provenance |
| MatriSync Bridge / MatriBand | Professional, Organization | Coming Soon; static device/workflow preview | ESP32 Bluetooth protocol, external NFC, encryption/trust |
| Staff invite, verification, membership | Organization | Coming Soon | Verified affiliations and access model |
| Uploads, edits, exports, search, merge/pairing | Relevant record screens | Coming Soon | Separately approved data/security design |
| Live analytics, notifications, payments | Activity/future roadmap | Coming Soon | Separate scope and cost authorization |

No Supabase, Firestore, Realtime Database, Storage client, Functions, Analytics, Messaging, AI API, Bluetooth/NFC API, push, SMS, payments, or patient-data sync queue is initialized. Future buttons open an informational dialog; they never simulate success or request permissions. Fixture prescription/medication previews omit medicine names/doses, and report previews omit interpreted clinical values.

The full conceptual roadmap remains in the supplied Master Development Guide. This implementation stops at Phase 1. Unresolved: final tagline acceptance, reviewed translations, professional subroles, clinical content quality, competition acceptance of advanced drug/AI features, device specifics, and future follow-up delivery channels.
