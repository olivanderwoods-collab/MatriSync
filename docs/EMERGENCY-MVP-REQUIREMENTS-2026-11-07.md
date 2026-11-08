# MATRIsYNC — EMERGENCY MVP COMPLETION, DEMO DATA INTEGRATION AND TWO-ACCOUNT DEVELOPMENT HANDOFF

## MISSION

You are working on MatriSync, an offline-first maternal healthcare continuity platform being developed for Health-a-thon 2026.

We have two separate Codex account development budgets available. Your task is to complete the highest-priority MVP work safely, then hand over the exact state of the project to a second Codex account that has no previous knowledge of the application.

THE SECOND ACCOUNT MUST BE ABLE TO CONTINUE IMMEDIATELY WITHOUT REPEATING THE INITIAL INVESTIGATION.

This is a time-sensitive development task. Do not waste tokens on unnecessary redesigns, speculative refactoring, or features outside the MVP.

## EXISTING AND TARGET REPOSITORIES

Current project: Inspect the working repository already available in this environment.

New public submission repository:
https://github.com/olivanderwoods-collab/MatriSync--Health-a-thon-submission.git

Do not replace, delete, force-push, or damage the original development repository.

The second Codex account will be responsible for publishing the final tested code to the submission repository unless this task is explicitly completed earlier and documented.

## THREE NON-NEGOTIABLE INSTRUCTIONS

### 1. Safe demo-data cleanup

Clear OLD SYNTHETIC DEMO RECORDS ONLY, and only from the explicitly identified demo dataset.

You MUST NOT:
- Delete production records.
- Delete Firebase Authentication users.
- Delete Firebase Storage files.
- Delete real patient information.
- Clear entire Firestore collections or databases.
- Delete unrelated user or facility records.
- Modify or weaken production authorization rules.

Before removing records, identify their exact storage location and prove they belong to the disposable synthetic demo dataset.

If there is uncertainty about whether records are disposable demo data, preserve them and report the blocker.

### 2. MatriSathi naming and functionality

MatriSathi MUST remain the mother-facing conversational assistant within MatriSync.

Do not introduce RUHI as a new assistant name. RUHI belongs to another project.

If an existing conversational implementation can be reused, adapt its underlying technical functionality without changing the approved MatriSync identity.

For this MVP, provide basic working conversations and clearly distinguish scripted responses from genuine generative AI.

Do not add a new assistant tab, floating assistant, or additional UI section unless already approved.

### 3. Mandatory transfer between Codex accounts

When Account 1 finishes, you MUST provide:

1. The exact source repository URL.
2. The exact branch name.
3. The latest committed Git SHA.
4. The complete `MATRISYNC_MVP_ACCOUNT2_HANDOFF.md` file.
5. The complete `MATRISYNC_ACCOUNT2_START_PROMPT.md` file.

Both handoff files and all completed code changes must be committed and accessible to Account 2.

The user will then:

1. Log out of Account 1.
2. Log into Account 2.
3. Open the same committed codebase.
4. Supply the original MatriSync development guide.
5. Supply `MATRISYNC_MVP_ACCOUNT2_HANDOFF.md`.
6. Paste the complete `MATRISYNC_ACCOUNT2_START_PROMPT.md`.
7. Instruct Account 2 to continue from the exact recorded branch and commit.

Account 2 will NOT automatically inherit Account 1's chat history, credentials, uncommitted changes, local files, or working environment.

Therefore, every important implementation decision, remaining task, known bug, setup requirement, and verified test result must be transferred through the repository and handoff documents.

This handoff is a REQUIRED deliverable, not an optional summary.

## MANDATORY FIRST ACTIONS

1. Inspect the existing repository and its documentation.
2. Identify the frontend framework, Firebase services, database models, routing, authentication, demo data and build scripts.
3. Read the supplied MatriSync development guide.
4. Identify which features already work and which are unfinished.
5. Identify existing PDF generation and handoff-package code.
6. Identify the existing MatriSathi implementation, if any.
7. Run the current build and record its result.
8. Preserve the existing approved UI and architecture.

DO NOT rebuild the application from scratch.

DO NOT create extra buttons, tabs, pages, cards, menus, or sections that were not previously approved.

## PRIMARY DELIVERABLES FOR ACCOUNT 1

Complete these in priority order:

A. Safe cleanup and deterministic creation of synthetic demo records.

B. Fully linked profiles for Ophelia Frost and Dr. Olivander Woods.

C. Functional medication history, blood product request, reports and clinical timeline.

D. Functional emergency referral handoff generation.

E. Functional, downloadable clinical handoff PDF.

F. Basic MatriSathi conversations.

G. Application stability, working navigation and successful production build.

H. Tested functionality and complete Account 2 development handoff.

Do not start optional features while required deliverables remain incomplete.

## 1. DEMO DATA RESET

The current demo environment must contain one consistent primary demonstration case:

Patient: Ophelia Frost
Patient ID: MAT-DEMO-001

Doctor: Dr. Olivander Woods
Professional ID: DOC-DEMO-001

Remove only obsolete, duplicate or conflicting SYNTHETIC records from the identified disposable demo-data store.

Before deleting anything:
- Identify the exact storage location.
- Verify that each record is synthetic and disposable.
- Preserve the existing schemas and authentication configuration.
- Preserve all real user and patient information.
- Never delete Firebase Auth accounts.
- Never delete Firebase Storage files.
- Never perform collection-wide or database-wide destructive operations.
- Never modify production records.

Demo seeding must be deterministic and idempotent.

Repeated execution must not create duplicate patients, prescriptions, clinicians or referrals.

If the project uses sessionStorage or local JSON fixtures for the demo, maintain that architecture rather than introducing an unnecessary new backend.

## 2. DOCTOR PROFILE

Create the following fictional professional:

Full Name: Dr. Olivander Woods
Professional ID: DOC-DEMO-001
Gender: Male
Age: 38 years
Designation: Consultant Obstetrician & Gynaecologist
Department: Obstetrics & Gynaecology
Specialization: Obstetrics and Maternal Healthcare
Experience: 10 years — Fictional
Facility: MatriSync Demo District Hospital
Email: olivander.woods@demo.matrisync.invalid
Account Status: Active — Demo
Professional Verification: Unverified / Demo Only
Facility Affiliation: Demo Facility
Authorized Device: Approved Demo Workstation
Access Role: Healthcare Professional

Do not fabricate a medical registration number, verified professional credential or certification.

The doctor profile must display the approved professional information, assigned patients and relevant activity history.

## 3. PATIENT PROFILE AND DOCTOR LINKAGE

Patient: Ophelia Frost
Patient ID: MAT-DEMO-001
Primary Treating Doctor: Dr. Olivander Woods
Doctor ID: DOC-DEMO-001
Relationship: Attending obstetrician

Admission: 2026-11-07T07:50:00+05:30
Doctor Assigned: 2026-11-07T08:05:00+05:30

Current Diagnosis:
Primary postpartum haemorrhage due to suspected uterine atony, complicated by haemorrhagic hypovolaemic shock.

Estimated Blood Loss: 1,700 mL.

Current Status: Critical — Emergency Referral.

Preserve other available verified fictional patient details, including blood group, allergies, reports and antenatal history.

Do not invent missing clinical information. Use "Not recorded" or "Not available" where appropriate.

All clinical demo records must show:

DEMO / NOT FOR CLINICAL USE

## 4. MEDICATION RECORDS

Create exactly six linked medication records.

All timestamps must use ISO 8601 with Asia/Kolkata UTC+05:30.

### Medication 1

ID: MED-DEMO-001
Name: Iron and Folic Acid tablet
Strength: Elemental iron 60 mg + folic acid 400 micrograms
Prescribed: 2026-10-30T15:20:00+05:30
Route: Oral
Frequency: Once daily
Indication: Routine antenatal supplementation
Status: Previously prescribed / ongoing at admission
Prescriber: DOC-DEMO-001
Creator: DOC-DEMO-001
Administration: Not recorded

### Medication 2

ID: MED-DEMO-002
Name: Oxytocin
Dose: 10 IU
Route: Intramuscular
Frequency: Single dose
Indication: Prevention of postpartum haemorrhage after delivery
Prescribed: 2026-11-07T11:40:00+05:30
Administered: 2026-11-07T11:42:00+05:30
Status: Administered — Demo
Prescriber: DOC-DEMO-001
Creator: DOC-DEMO-001

### Medication 3

ID: MED-DEMO-003
Name: Oxytocin
Dose: 10 IU
Route: Intravenous, under clinical protocol
Frequency: Emergency dose
Indication: Postpartum haemorrhage with suspected uterine atony
Prescribed: 2026-11-07T11:57:00+05:30
Administered: 2026-11-07T11:58:00+05:30
Status: Administered — Demo
Prescriber: DOC-DEMO-001
Creator: DOC-DEMO-001

### Medication 4

ID: MED-DEMO-004
Name: Ringer's Lactate
Route: Intravenous infusion
Administration: Clinician-directed emergency fluid resuscitation; exact volume and rate not specified
Indication: Circulatory support following severe blood loss
Prescribed: 2026-11-07T11:59:00+05:30
Initiated: 2026-11-07T12:01:00+05:30
Status: Infusion initiated — Demo
Prescriber: DOC-DEMO-001
Creator: DOC-DEMO-001

### Medication 5

ID: MED-DEMO-005
Name: Tranexamic Acid
Dose: 1 g
Route: Intravenous over 10 minutes
Frequency: Initial emergency dose
Indication: Postpartum haemorrhage
Prescribed: 2026-11-07T12:02:00+05:30
Initiated: 2026-11-07T12:04:00+05:30
Status: Administered — Demo
Prescriber: DOC-DEMO-001
Creator: DOC-DEMO-001

### Medication 6

ID: MED-DEMO-006
Name: Misoprostol
Dose: 800 micrograms
Route: Sublingual
Frequency: Single emergency dose
Indication: Continued postpartum haemorrhage despite initial uterotonic treatment
Prescribed: 2026-11-07T12:10:00+05:30
Administered: 2026-11-07T12:12:00+05:30
Status: Administered — Demo
Prescriber: DOC-DEMO-001
Creator: DOC-DEMO-001

### Medication Rules

- All six records must link to MAT-DEMO-001.
- All six records must link to DOC-DEMO-001 as prescriber and creator.
- Separate prescription and administration timestamps.
- Do not assume the prescriber personally administered any medication.
- Leave unknown administering personnel unrecorded.
- Mother/caregiver accounts may view clinician-authorized medication records but must not modify them.
- Facility admins must not alter prescriptions.
- Preserve existing role-based clinical authorization.
- Do not convert these fictional medicine doses into treatment recommendations or prescribing defaults.

## 5. SEPARATE BLOOD PRODUCT REQUEST

Order ID: BLOOD-DEMO-001
Patient ID: MAT-DEMO-001
Requested by: DOC-DEMO-001
Requested at: 2026-11-07T12:20:00+05:30
Product: Packed Red Blood Cells (PRBC)
Blood Group: O Positive
Indication: Severe blood loss with haemorrhagic shock
Crossmatch Status: Pending
Transfusion Status: Not administered

This must remain a separate blood product request.

Do not mark the blood as crossmatched, issued or administered.

## 6. CLINICAL ACTIVITY TIMELINE

Add the following events:

2026-10-30 15:20 — Antenatal supplement prescribed
2026-11-07 07:50 — Patient admitted
2026-11-07 08:05 — Dr. Olivander Woods assigned
2026-11-07 08:15 — Admission blood investigations documented
2026-11-07 11:40 — Female baby delivered
2026-11-07 11:42 — Prophylactic oxytocin administered
2026-11-07 11:50 — Placenta delivered
2026-11-07 11:55 — Heavy postpartum bleeding identified
2026-11-07 11:58 — Emergency oxytocin administered
2026-11-07 12:01 — IV fluid resuscitation initiated
2026-11-07 12:04 — Tranexamic acid initiated
2026-11-07 12:12 — Misoprostol administered
2026-11-07 12:20 — Blood product request created
2026-11-07 12:25 — Emergency blood results documented
2026-11-07 12:40 — Emergency hospital referral initiated

Store all timestamps internally in full ISO 8601 format with +05:30 offset.

Ensure that clinician approval and facility operational referral initiation remain distinct when required by the existing MatriSync authorization workflow.

## 7. MEDICAL REPORTS

Preserve the existing fictional reports:

- Antenatal ultrasound dated 30 October 2026.
- Admission blood investigations.
- Emergency blood investigations.

Reuse the existing report files and structured data wherever available.

Do not invent laboratory values, ultrasound findings, signatures or clinical observations.

If reports are missing, identify them in the final development handoff rather than fabricating their contents.

Keep medication records separate from investigation findings.

## 8. FUNCTIONAL REFERRAL HANDOFF

Make referral handoff generation operational using the actual linked synthetic demo records.

The handoff must include:

- Patient name.
- Stable patient ID.
- Blood group.
- Recorded allergies.
- Maternal diagnosis.
- Emergency referral reason.
- Estimated blood loss.
- Essential available investigations.
- Relevant medicines and administration times.
- Pending PRBC request.
- Referring doctor.
- Sending facility.
- Referral date and time.
- Referral status.

Generate:

A. Structured, human-readable clinical handoff.

B. Compact, versioned handoff data package suitable for the NFC demonstration.

Reuse the existing MatriSync compact coding dictionary, if present.

Do not include full clinical reports in the compact NFC payload.

Do not imply that an NFC band was physically programmed or that data was encrypted unless those operations genuinely occurred.

Implement a functional software package preview/export where physical hardware is not connected.

## 9. FUNCTIONAL HANDOFF SUMMARY PDF

Generate a readable, downloadable PDF using the actual current demo data.

It should contain:

- MatriSync branding.
- DEMO / NOT FOR CLINICAL USE.
- Patient identification.
- Doctor and facility details.
- Admission and referral information.
- Primary diagnosis.
- Referral reason.
- Relevant available history.
- Allergies.
- Essential blood investigation results.
- Relevant ultrasound information.
- Medication records with timestamps.
- Pending blood product request.
- Emergency clinical timeline.
- Referral status.

Use the existing PDF generation architecture whenever possible.

The PDF must not be a permanently hard-coded file disguised as dynamically generated output.

Test PDF downloading and opening.

## 10. BASIC MATRIsATHI CONVERSATIONAL FUNCTIONALITY

The assistant's approved name is MATRIsATHI.

It must remain inside the Mother/Caregiver interface.

Do not introduce RUHI into MatriSync branding or navigation.

Inspect the existing conversational implementation before making changes.

For this MVP, support:

- Basic greetings.
- Friendly conversational exchanges.
- General explanations of MatriSync.
- Assistance navigating mother records.
- Assistance finding reports.
- Explanation of available referral information.
- General maternal wellbeing information.
- Explanation of clinician-authored prescriptions.
- Explanation of demo limitations.
- Appropriate emergency guidance to seek immediate professional help.

Use a lightweight deterministic conversational system if necessary.

Do not require a paid AI API for basic MVP functionality.

Do not present fixed scripted responses as an independently intelligent generative model.

Do not diagnose conditions, recommend medications or provide individualized treatment decisions.

Keep the feature clearly labelled as a demo when appropriate.

## 11. ROLE STRUCTURE AND PERMISSIONS

Preserve the current approved navigation.

Mother/Caregiver:
Home | My Health | MatriSathi | Children | More

Healthcare Professional:
Home | Patients | Referrals | Follow-ups | More

Healthcare Organization:
Home | Referrals | Patients | Inventory | More

Do not create additional public roles.

Do not introduce unapproved UI.

Clinical permissions must remain intact.

Mother accounts must not modify clinician-authored prescriptions.

Facility admins must not edit prescriptions.

Demo professional credentials must remain marked unverified.

## 12. UI COMPLETION

Preserve the approved Medical Green theme, layout and branding.

Fix:

- Broken navigation.
- Nonfunctional controls in MVP workflows.
- Incorrect doctor-patient linkage.
- Incorrect or inconsistent timestamps.
- Missing records.
- PDF failures.
- Handoff generation errors.
- Mobile responsiveness issues.
- Broken layouts or overflow.
- Misleading success messages.

Do not redesign the application.

Do not introduce unnecessary sections.

Every approved visible button must either:

- Execute a real implemented action.
- Open the correct existing destination.
- Display a clear Coming Soon indication.

Features using synthetic data must be labelled Demo Only or Simulated Data.

## 13. AUDITABILITY AND DATA SAFETY

Preserve:

- Stable patient identifiers.
- Stable professional identifiers.
- Record creator references.
- Prescription timestamps.
- Administration timestamps.
- Created and updated timestamps.
- Relevant demo activity history.

Do not claim immutable audit logging if the existing demo architecture cannot genuinely guarantee it.

Never weaken production permissions to simplify a fictional demonstration.

## 14. TESTING REQUIREMENTS

Verify:

1. Successful production build.
2. Patient profile opens.
3. Doctor profile opens.
4. Doctor-patient relationship resolves.
5. Six medication records appear correctly.
6. Prescription and administration timestamps remain separate.
7. Blood product request remains separate.
8. Timeline displays chronologically.
9. Existing reports remain linked.
10. Handoff generation works.
11. Compact handoff includes appropriate essential information.
12. PDF is generated and opens.
13. Mother cannot edit clinician-authored prescriptions.
14. Facility admin cannot edit prescriptions.
15. MatriSathi handles basic conversations.
16. Emergency questions receive suitable safety responses.
17. Mobile interface works.
18. Repeated demo seeding creates no duplicates.
19. No production data is deleted.
20. No credentials or real patient information is exposed.

Report exactly which tests pass, fail, or remain unverified.

## 15. DEVELOPMENT TOKEN MANAGEMENT

We have a limited development budget across two Codex accounts.

PRIORITIZE COMPLETION OVER FEATURE EXPANSION.

Complete existing functionality first.

Do not start unnecessary new features.

Do not refactor unrelated code.

Avoid repeatedly rewriting the same files.

Reserve sufficient time and tokens for testing, Git commits and the Account 2 handoff.

If the remaining development budget becomes limited:

1. Stop initiating new features.
2. Finish the current safe task.
3. Run the available tests.
4. Preserve working changes in Git.
5. Create both handoff documents.
6. Provide the exact resume instructions for Account 2.

Do not leave critical uncommitted work behind.

Do not assume the development environment exposes an exact remaining-token count.

## 16. MANDATORY ACCOUNT 2 HANDOFF DOCUMENT

Create:

MATRISYNC_MVP_ACCOUNT2_HANDOFF.md

Include:

1. Complete project overview.
2. Source repository URL.
3. Current branch.
4. Latest committed SHA.
5. Technology stack.
6. Architecture and folder structure.
7. Development setup instructions.
8. Environment variables needed, without secret values.
9. Firebase project configuration and deployment status.
10. Current authentication architecture.
11. Demo dataset locations.
12. Exact demo seeding and safe cleanup instructions.
13. Doctor and patient record structure.
14. Medication and timeline implementation.
15. Report handling.
16. Referral workflow implementation.
17. Compact handoff format and limitations.
18. PDF generation implementation.
19. MatriSathi implementation.
20. Working features.
21. Simulated features.
22. Coming Soon features.
23. Known bugs and blocked items.
24. Tests performed and results.
25. Unfinished MVP tasks in priority order.
26. Final Firebase deployment instructions.
27. New GitHub submission repository instructions.
28. Security and clinical demo limitations.
29. Exact starting point for Account 2.

The document must be detailed enough that another developer can continue without access to this conversation.

## 17. MANDATORY ACCOUNT 2 COPY-PASTE PROMPT

Create:

MATRISYNC_ACCOUNT2_START_PROMPT.md

This must be a COMPLETE executable development instruction for an entirely new Codex session.

The second account must be instructed to:

1. Read the MatriSync development guide.
2. Read MATRIsYNC_MVP_ACCOUNT2_HANDOFF.md.
3. Open the existing committed source code.
4. Verify the branch and commit SHA.
5. Inspect the completed Account 1 changes.
6. Complete the remaining prioritized MVP tasks.
7. Preserve all completed functionality.
8. Fix critical navigation and data issues.
9. Ensure the handoff and PDF functions work.
10. Ensure MatriSathi works at the approved demo level.
11. Keep incomplete roadmap features labelled Coming Soon.
12. Verify that all remaining visible MVP controls work correctly.
13. Run a clean production build.
14. Run the relevant tests.
15. Deploy to the existing free Firebase Hosting project.
16. Verify that the live public URL loads successfully.
17. Test important workflows using the deployed version.
18. Check for stale PWA service-worker caching.
19. Check for exposed secrets and sensitive data.
20. Push the final sanitized source to the public submission repository:
    https://github.com/olivanderwoods-collab/MatriSync--Health-a-thon-submission.git
21. Preserve the original repository and Git history.
22. Confirm the public repository and commit SHA.
23. Produce a transparent final development report.

Do not claim successful deployment without verifying the live URL.

Do not claim GitHub publication without confirming that the code was pushed and is accessible.

Do not claim that all future features are complete when they are only Coming Soon.

## 18. TRANSFER PROCEDURE — CRITICAL

ACCOUNT 1 MUST FINISH WITH THE FOLLOWING INFORMATION:

SOURCE REPOSITORY:
[Exact URL]

BRANCH:
[Exact branch]

LATEST COMMIT:
[Full SHA]

HANDOFF DOCUMENT:
[Exact committed path or accessible link]

ACCOUNT 2 START PROMPT:
[Exact committed path or accessible link]

BUILD STATUS:
[Pass / Fail / Blocked]

TEST STATUS:
[Verified results]

REMAINING DEVELOPMENT:
[Prioritized tasks]

DEPLOYMENT STATUS:
[Actual verified status]

USER ACTIONS REQUIRED:
[Only necessary actions]

Do not leave placeholders unfilled in the final output.

Both handoff files must be committed and accessible.

The user will switch accounts and provide the development guide, handoff file and generated Account 2 prompt.

Account 2 must continue from the recorded commit rather than starting from scratch.

## 19. FINAL ACCOUNT 1 RESPONSE

At the end, provide:

- Completed implementation work.
- Remaining MVP functionality.
- Working, simulated and Coming Soon features.
- Build results.
- Test results.
- Exact GitHub source repository.
- Branch and latest commit SHA.
- Both committed handoff files.
- Full copy-paste Account 2 prompt.
- Any deployment blockers.
- Necessary user actions.

Do not merely describe intended work.

Provide the actual results and verified state of the repository.

## FINAL EXECUTION ORDER

1. Inspect the current MatriSync codebase.
2. Safely clean only obsolete synthetic demo records.
3. Create the Ophelia Frost and Dr. Olivander Woods demo case.
4. Integrate all medications, reports, blood product request and clinical timeline.
5. Make referral handoff generation functional.
6. Make the dynamically generated handoff PDF functional.
7. Make basic MatriSathi conversations work.
8. Fix important UI and navigation issues.
9. Run tests and production build.
10. Commit all safe completed changes.
11. Create and commit the two Account 2 handoff files.
12. Provide complete, verified transfer instructions.

The overall objective is a stable, demonstrable and honest MatriSync MVP for Health-a-thon 2026, completed across the available two-account development budget.

START BY INSPECTING THE EXISTING REPOSITORY AND CONTINUE WITH THE PRIORITIZED IMPLEMENTATION.

DO NOT REBUILD THE PROJECT FROM SCRATCH.