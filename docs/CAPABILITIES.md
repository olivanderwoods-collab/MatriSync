# Capability inventory — 23 October 2026

Current changes: [23 October decisions](DECISIONS-2026-10-23.md). Private records now open automatically on this device, with one-time migration for old passphrase vaults. Mother replaces Mother/Caregiver. Patient-level navigation, organization-controlled referral initiation, Inventory refunds and synthetic linking/assignment are implemented as described there. Synthetic grants are not real authorization; cloud E2EE sharing, hardware transport and an operational refund ledger remain pending. The table below describes the earlier 22 October baseline and is retained as historical context.

| Area | Working now | Remaining |
|---|---|---|
| Auth / Guest | Email/password Auth; synthetic Guest stays session-only, no service calls | Verified clinician/facility privileges and live-account acceptance |
| Navigation | Latest mother/professional tab removals, exact More cleanup, compact language selector, merged Profile/Settings, Back and legacy redirects | Organization inventory remains its approved preview |
| Private patients | Signed-in professionals can create, edit and search device-owned profiles | Shared access, consent, facility membership and clinical verification |
| Documents | Encrypted on-device reports and prescription copies, original-byte download, source/date metadata; mother's own uploads | Cloud photo/report uploads deliberately disabled; backup/export and recovery UI |
| Encryption | PBKDF2-SHA256 + AES-GCM; key in memory only; lock on idle, reload and account exit; atomic saves and stale-write rejection | Passphrase rotation/recovery and multi-device migration |
| Firebase records | Structured-record encryption adapter, transactional concurrency checks, prototype owner-only Firestore rules tested locally | Live activation and backup/restore/conflict UI; no rules deployment |
| MatriSathi | Topic browsing/search and draft medicine lookup in explicit testing build | Reviewed articles/video links, verified references, gated Gemini/Tavily connections and mic/camera recognition |
| AI foundation | Optional Qwen worker, settings, separate usage views, independent safety routing and remote gates | Real-device/clinical/language validation; App Check and secure shared quota/proxy integration |
| Clinical workflows | Existing labelled previews, uploaded prescription copies | Prescribing, clinical approval, referrals and follow-up scheduling |
| Children / organization / distributor | Approved navigation and synthetic previews | Verified caregiver linkage, staff/stock/device/financial operations |
| PWA | Static shell, consent-based update, offline Guest/reference tests; local upload tested offline in active account session | Real-device acceptance; no automatic cloud synchronization |

Original artwork and exact Medical Green tokens are preserved. No paid services, cloud file uploads, clinical AI, hardware or payment connections were activated. Role selection cannot grant access to another account. Private uploads are stored as unverified source documents, not clinically interpreted or approved records.

See [Phased development](PHASED-DEVELOPMENT.md) and [storage design](FIRESTORE-MODEL.md) for explicit limits.
