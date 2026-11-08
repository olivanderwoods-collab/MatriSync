# Isolated connected-care recovery checks

Run `node node_modules/vite/bin/vite.js --config tests-care/recovery.config.ts`, then open `http://127.0.0.1:4181/tests-care/recovery-fixture.html` in a test browser. The fixture replaces account, care-network and records-context calls only in this development configuration. It uses the real CarePage, encrypted care storage, device keys, IndexedDB, summary document and BLE panel. It never calls Firebase or requests hardware unless a tester explicitly clicks the hardware connection control. Do not do that for these checks.

1. Enroll/refresh the synthetic Doctor. Choose patient-a and load it.
2. Enter a unique reason for referral and an unsaved contribution. Select the synthetic receiving facility and create a handoff. Record the iframe's srcdoc/Handoff ID and recorded time.
3. Select patient-b. Before loading it, confirm that patient A's view, draft, preview and BLE panel disappear.
4. Load B. All referral fields, contribution text and recipient must be blank; no A preview can remain.
5. Reload the page. Select A and use **Open saved offline copies**, without refreshing staff access. The original summary must return with the same ID, timestamp, reason and complete srcdoc. Print must be available; creation and BLE must remain unavailable without current loaded staff access.
6. Switch the fixture account to Other account. The prior view, preview, staff membership and patient references must disappear.

These steps passed in the in-app browser on 8 November 2026. The cloud endpoints/authentication in this fixture are mocked; this is not live multi-account acceptance or hardware verification. The production build excludes this fixture. Nine automated regression tests in care-storage.test.ts and care-client.test.ts separately cover real encrypted storage and mocked cloud commit/failure ordering.
