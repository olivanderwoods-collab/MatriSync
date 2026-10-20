# MatriSync · 11 am meeting walkthrough

## Open before the meeting

Use the running local preview at `http://127.0.0.1:5173/`. If it has stopped, run `pnpm dev` in this repository. For the production/offline build, run `Start-MatriSync.ps1` from PowerShell or `node scripts/serve.mjs`, then open `http://127.0.0.1:4173/`. This URL works on this computer; it is not a public site.

Use **Guest** for the meeting. It is fully independent of account setup or cloud connectivity. Keep this browser tab open. Use Reset Demo before presenting if you have changed preferences. All people and dates are synthetic examples.

## Six-minute tour

1. **Brand and roles (30 sec):** Show the supplied icon, Medical Green theme, and three role cards. Explain the goal: maternal care continuity from conceiving through parenting.
2. **Mother/Caregiver (90 sec):** Continue as Guest. Show the overview, My Journey’s four selectable stages, and My Health’s record tabs. Open Tara’s test reports, then switch to Arun: the child name and record change together. Reload to demonstrate same-tab continuity.
3. **Care coordination (45 sec):** Open Follow-up: doctor’s reason, required tests, and due date. Open Care journey: fictional sending/receiving facilities and handoff timeline. Click a future action to show its honest Coming Soon dialog.
4. **Professional (90 sec):** Exit Guest, select Healthcare Professional, and continue as Guest. Open a sample patient, prescription preview, MatriBridge workflow, MatriFlow handoff, MatriWatch operational examples, Drug Safety Assistant reference tabs, and Bridge Manager. These are explanations and previews, not clinical engines.
5. **Organization (60 sec):** Exit Guest, select Organization/Facility, and continue as Guest. Show staff verification preview, read-only patient records, incoming/outgoing referrals, follow-up, and device inventory.
6. **Preferences and boundary (45 sec):** Switch Light/Dark/System and a preferred language. Point out the English fallback. Explain that the working milestone is navigation, Guest sessions, preferences, PWA shell, and configured account integration. All future services remain Coming Soon.

## Honest answers

- “Is this real patient data?” **No. All profiles and records are fictional, including after account sign-in.**
- “Does the AI/Bridge work?” **These are workflow previews. No AI model, device connection, upload, or clinical interpretation is active.**
- “Does the demo work offline?” **The production public shell does after its first online load. Account sign-in needs internet. Real-device install/airplane-mode acceptance is still pending.**
- “Is it deployed?” **No. This is the local meeting build. Source synchronization is separate from publishing.**
- “Does selecting Professional verify a doctor?” **No. Authentication proves account identity only; credentials and record authorization are future work.**

Avoid showing live account signup as a confirmed feature until a successful end-to-end account session has been checked. The Firebase project is configured, but the meeting can proceed entirely through Guest.
