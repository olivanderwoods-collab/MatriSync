# MATRIsYNC — FINAL CODEX DEVELOPMENT, GITHUB HANDOFF & BOLT TRANSFER

## PRIMARY INSTRUCTION

You are continuing the existing MatriSync development project.

**This is the final Codex development session before transferring development to Bolt.new.**

I have very limited remaining work tokens. Your responsibility is to complete the active development phase as far as reasonably possible, fix essential issues, implement the highest-priority missing functionality (especially existing AI features), push the complete working project to GitHub, and prepare a comprehensive handoff report.

**Do not restart development, rebuild the application from scratch, or waste tokens explaining decisions already made.**

Work autonomously using the existing repository, project files, previous conversation context, and development history.

Do not ask routine clarification questions. Make conservative technical decisions, preserve existing functionality, and document any unresolved decisions.

## STEP 1 — INSPECT THE CURRENT PROJECT

Before making changes:

1. Inspect the existing source code, Git status, branches, recent commits, documentation, and development progress.
2. Identify the exact development phase currently in progress.
3. Identify completed, partially completed, broken, and missing features.
4. Review existing AI components, Firebase integration, offline functionality, and role-specific interfaces.
5. Preserve all existing functional features and the MatriSync visual identity.
6. Identify the minimum remaining work needed to finish the current phase.

Do not perform an unnecessary architectural rewrite.

Prioritize completing existing incomplete functionality over introducing unrelated features.

## STEP 2 — APPLY THE LATEST APPROVED MATRISYNC REQUIREMENTS

MatriSync is now a **healthcare-first maternal care continuity platform**.

The Healthcare interface is the primary operational system. The Mother/Caregiver interface is secondary.

### Healthcare roles

- Facility Administrator / Management
- Doctor / Authorized Clinician
- Nurse
- ANM
- ASHA / Community Healthcare Worker
- Authorized Registration Operator

Use granular, role-specific permissions.

Administrators manage facility operations, device authorization, patient registration, personnel, and case assignments. They must not edit prescriptions merely because they are administrators.

Doctors have access only to authorized patient cases and appropriate clinical functions.

ANM and ASHA workers can document medicines dispensed, administered, or provided under approved programmes. Prescription/order creation must be restricted to their legally and professionally authorized scope.

Trained registration personnel create patient profiles. Facility administrators control assignment of personnel to cases.

### Mother/Caregiver profile

The mother-facing interface includes:

- MatriSathi AI Companion
- Verified educational drug and herb information
- Drug interaction information with appropriate warnings
- View-only access to relevant healthcare-authored medical records
- Uploading personal reports and documents
- Referral and follow-up visibility

Mothers cannot edit or delete healthcare-authored records.

Mother-uploaded documents remain pending review. Before acceptance, mothers may withdraw their uploads. Once approved and incorporated into the clinical record, they cannot directly delete those accepted records.

Preserve document source, review state, reviewer identity, timestamps, and version history.

### Healthcare device restrictions

Healthcare access must be limited to specifically enrolled and authorized facility devices.

A professional may be approved for multiple specific devices within their facility.

Shared workstations display staff profile selection. Each professional has a personal six-digit quick-unlock PIN. Selecting **Leave** locks the professional session and returns to profile selection.

A PIN must never serve as the sole authentication mechanism. Maintain individually authenticated identities, secure sessions, authorization checks, retry limits, and device access controls.

Do not present browser fingerprinting or a frontend-only device list as production-grade device enforcement.

Where full cryptographic device enrollment or secure offline access cannot be implemented within this phase, clearly mark it as incomplete and keep the prototype restricted to synthetic data.

## STEP 3 — FINISH THE ACTIVE DEVELOPMENT PHASE

Complete the current phase before expanding into new work.

Priority order:

**P0 — Essential functionality**
- Resolve incomplete flows and blocking errors.
- Ensure authentication and navigation function correctly.
- Ensure patient registration, assignment, and record access work wherever currently in scope.
- Complete healthcare-specific permission checks.
- Preserve functional referral and document workflows.
- Fix broken Firebase queries, routes, and forms.

**P1 — AI functionality**
Complete and integrate the existing AI components as far as possible:

1. Healthcare-only AI transcription/documentation assistance.
2. AI-assisted referral organization and documentation completeness checking.
3. Human review, editing, and explicit acceptance of generated clinical documentation.
4. MatriSathi AI Companion for mothers/caregivers.
5. Existing verified drug-information and interaction workflows.

Important AI conditions:

- AI remains assistive and non-diagnostic.
- AI must not independently prescribe, diagnose, change medications, or modify clinical records.
- Never fabricate verified medication information, interactions, or clinical recommendations.
- Separate verified database content from unverified external information.
- Use backend-controlled configuration for external AI services.
- Never expose secret API keys in frontend code.
- Do not transmit identifiable medical data to external AI services without appropriate security, authorization, and consent.
- If AI credentials or an actual model are unavailable, provide a clearly marked demonstration mode or an integration-ready implementation. Do not falsely claim live AI functionality.

**P2 — Supporting integrations**

Preserve and stabilize existing:
- Offline-first functionality
- Firebase authentication and database integration
- Referral tracking
- NFC handoff interfaces
- Transport/ambulance documentation
- Follow-up workflows

Do not attempt to invent or falsely claim hardware functionality that has not been tested.

If a significant feature cannot be finished, leave a stable, clearly documented boundary for Bolt to continue.

## STEP 4 — VERIFY THE APPLICATION

Perform appropriate checks supported by this repository:

- TypeScript/type checking
- Production build
- Linting, where configured
- Available automated tests
- Basic functional smoke testing
- Route and authentication checks
- Permission checks
- AI integration checks
- Existing offline functionality checks

Fix critical errors before handoff.

Avoid unnecessary dependency upgrades.

Report the actual outcomes of every check. Never claim a test passed unless it was executed successfully.

Do not use real patient information for testing.

## STEP 5 — CREATE A SAFE GITHUB HANDOFF BRANCH

Preserve the existing main branch and all previous work.

Preferred new branch name:

`handoff/matrisync-codex-2026-11-05`

If a safe handoff branch already exists, use it appropriately without overwriting unrelated commits.

Actions:

1. Inspect the current Git status, remote configuration, and pending changes.
2. Preserve all legitimate work, including uncommitted changes.
3. Create the handoff branch safely from the appropriate current development state.
4. Ensure `.env` secrets, credentials, patient information, and local-only files are excluded.
5. Add/update `.env.example` with placeholder configuration names only.
6. Commit all intended source-code changes.
7. Push the handoff branch to the existing MatriSync GitHub repository.
8. Verify that the remote branch contains the final commits.

**Do not force-push, delete branches, or overwrite main.**

If credentials, network access, or permissions prevent pushing, retain the local commit and give exact commands needed to finish the push manually.

Do not report GitHub synchronization as successful without verifying it.

## STEP 6 — GENERATE A COMPLETE DEVELOPMENT HANDOFF FILE

Create this file in the repository:

`docs/MATRISYNC_CODEX_HANDOFF_2026-11-05.md`

This document is extremely important. It must be understandable by a new AI assistant without access to this Codex conversation.

Include:

### A. Project identity
- MatriSync purpose and target users
- Current development objectives
- Current architecture and technology stack
- Design theme and existing UI structure

### B. Exact development status
- Current completed phase
- Phase that was active before this session
- What was finished during this session
- What remains unfinished
- Current overall readiness for demonstration

### C. Feature inventory
For every major module, classify its status as:

- COMPLETE AND TESTED
- IMPLEMENTED BUT UNTESTED
- PARTIALLY IMPLEMENTED
- UI/DEMO ONLY
- NOT STARTED

Include relevant source paths.

### D. AI implementation
Explain:
- Every implemented AI feature
- Which AI provider or model is actually used
- API/client integration and relevant files
- Required environment variables
- Verified knowledge base connections
- Offline AI capabilities, if any
- Demonstration mode limitations
- Remaining AI implementation work

### E. Database and authentication
Document:
- Firebase collections and schema
- Authentication implementation
- Roles and permissions
- Storage rules
- Facility scoping
- Patient assignments
- Device authorization implementation
- Offline persistence and synchronization
- Missing security measures

### F. Functional workflows
Explain end-to-end flows for:
- Facility onboarding
- Healthcare login and staff switching
- Patient registration and assignment
- Clinical documentation
- Mother document uploads and review
- Referrals
- NFC handoffs
- Travel monitoring
- MatriSathi
- Drug information and interaction checking

### G. Project structure
Identify important directories, components, services, hooks, utilities, data files, and configuration files.

### H. Setup instructions
Include exact instructions for:
- Installing dependencies
- Configuring environment variables
- Running the development server
- Building the application
- Running available tests
- Connecting Firebase
- Using demonstration data

### I. Bugs and technical debt
Explain known problems, workarounds, missing integrations, and security limitations.

### J. Next development roadmap
Provide an ordered, dependency-aware development plan for Bolt, with small independent implementation tasks.

For every task, specify:
- Objective
- Relevant existing files
- Required changes
- Dependencies
- Acceptance criteria

Avoid vague instructions like "complete backend" or "implement AI."

### K. GitHub and Bolt transfer
Include:
- Repository URL
- Branch name
- Final commit hash
- Exact instructions to import the repository into Bolt
- How to select the correct branch
- Configuration steps after importing
- Verification steps before making edits
- Any potential repository conflicts

The handoff document must reflect the actual repository, not assumptions.

## STEP 7 — FINAL RESPONSE TO ME

After completing the work, provide a structured final report with these headings:

1. **Current Development Status**
2. **Features Completed in This Session**
3. **AI Features: Working vs Pending**
4. **Build and Test Results**
5. **GitHub Push Confirmation**
6. **Repository URL, Branch and Commit**
7. **Exact Bolt Import and Branch-Switching Instructions**
8. **Required Configuration and Secrets**
9. **Remaining Bugs and Limitations**
10. **Next 10 Development Priorities**
11. **New ChatGPT Conversation Handoff**

For section 11, prepare a complete, self-contained context summary that I can paste into a fresh ChatGPT conversation.

That summary should explain what MatriSync is, its latest approved healthcare-first architecture, what has actually been implemented, what is pending, which GitHub branch contains the code, and how the new assistant should guide Bolt development.

## FINAL EXECUTION RULES

- Execute development actions rather than merely explaining them.
- Respect the existing codebase and previous decisions.
- Minimize token expenditure and unnecessary commentary.
- Do not redesign completed features without necessity.
- Focus on functional completion, integration, testing, and handoff.
- Do not claim unfinished features are working.
- Do not silently replace unavailable services with mock implementations.
- Preserve the existing Firebase-based architecture unless correcting an actual blocker.
- Use synthetic patient data only.
- Keep the system suitable for Bolt continuation.
- Do not merge into the main branch.
- Prioritize a successful, reproducible GitHub handoff over optional enhancements.

**Start by inspecting the existing project and then immediately proceed with the remaining development tasks. Do not stop after generating a plan.**

**The final objective is a stable MatriSync development checkpoint, safely pushed to GitHub, with sufficient documentation to continue the project in Bolt.new and a fresh ChatGPT conversation without losing technical or functional context.**