import type { Role } from "./session";

export type Section = {
  id: string;
  title: string;
  description: string;
  actions: string[];
};
const section = (
  id: string,
  title: string,
  description: string,
  actions: string[] = [],
): Section => ({ id, title, description, actions });

export const maternalSections = [
  section(
    "overview",
    "Overview",
    "Identity, pregnancy stage and latest authorized record previews.",
    ["View Details"],
  ),
  section(
    "prescriptions",
    "Prescriptions",
    "Prescriptions and related medical history. No prescribed medicines or doses are supplied in this demo.",
    ["View Prescription"],
  ),
  section(
    "reports",
    "Reports",
    "Issued tests retain their original source and date. No clinical interpretation is generated.",
    ["Open Report", "Download Document"],
  ),
  section(
    "referrals",
    "Referrals",
    "Active and previous handoff status. This example is not a submitted referral.",
    ["View Referral"],
  ),
  section(
    "follow-up",
    "Follow-ups",
    "Doctor-entered reason, required investigations and date.",
    ["View Details"],
  ),
];
export const childSections = [
  section(
    "overview",
    "Overview",
    "This child's identity, caregiver and separate record context.",
  ),
  section(
    "vaccinations",
    "Vaccinations",
    "Coming Soon — an informational placeholder, not an immunization scheduler.",
  ),
  ...maternalSections
    .filter((s) => ["prescriptions", "reports", "follow-up"].includes(s.id))
    .map((s) => ({ ...s, actions: [] })),
];
export const professionalSections = [
  section("overview", "Overview", "Identity and authorized record context.", [
    "Edit Authorized Fields",
  ]),
  section(
    "reports",
    "Reports",
    "Original source, collection/report dates, units, corrections and verification must remain traceable.",
    ["Add Report", "View Original", "Verify Source"],
  ),
  section(
    "prescriptions",
    "Prescriptions",
    "Clinician-authored prescriptions. Planned reviewed database for drug/herb information and interactions; professional validation is pending.",
    ["Create Prescription", "Review Interactions"],
  ),
  section(
    "referrals",
    "Referrals",
    "Prepare a clinical package for approval and submission to facility operations. Organizations initiate transfers.",
    ["Prepare Referral", "View Status"],
  ),
  section(
    "follow-up",
    "Follow-ups",
    "The clinician specifies why, which investigations and when.",
    ["Schedule Follow-up", "Review Status"],
  ),
];
export const prescriptionActions = [
  "Add Medication",
  "Search Reviewed Database",
  "View Medicine Information",
  "Review Interactions",
  "Save Draft",
  "Review & Authorize Prescription",
];

export const professionalReferrals = [
  section(
    "draft",
    "Draft Referrals",
    "Select a patient, document the reason/history/treatment, attach original reports and review the source-linked draft. No clinical fields or AI output are generated.",
    [
      "New Referral",
      "Attach Report",
      "Check Completeness",
      "Generate Summary",
      "View Sources",
      "Edit Draft",
      "Save Draft",
    ],
  ),
  section(
    "review",
    "Pending Clinical Review",
    "Professionals review and correct the package. AI never clinically validates a report. Optional missing fields must not block emergency care.",
    ["View Sources", "Edit Draft", "Approve Referral"],
  ),
  section(
    "approved",
    "Approved Referrals",
    "Future clinician approval precedes submission to facility operations. No package has actually been approved.",
    ["Submit to Organization"],
  ),
  section(
    "submitted",
    "Submitted to Organization",
    "Facility operations will choose the permitted destination and initiate the approved transfer.",
  ),
  section(
    "initiated",
    "Initiated Referrals",
    "Read-only operational status. A pending or in-transit status is not proof of the patient's location.",
  ),
  section(
    "completed",
    "Completed Referrals",
    "Closure follows documented outcome and handoff acknowledgement; no completion is fabricated.",
  ),
  section(
    "correction",
    "Returned for Correction",
    "Preserve source versions and review changes before re-approval.",
    ["View Sources", "Edit Draft", "Save Draft"],
  ),
];
export const organizationReferrals = [
  section(
    "ready",
    "Ready to Initiate",
    "Route A — Connected Facility: after clinical approval, the sending organization chooses a permitted destination and sends the approved package.",
    [
      "Select Approved Referral",
      "Initiate Referral",
      "Choose Destination",
      "Send Digitally",
    ],
  ),
  section(
    "outgoing",
    "Outgoing",
    "Track authorized operational events separately from local pending changes. No transfer has been sent.",
    ["View Status"],
  ),
  section(
    "incoming",
    "Incoming",
    "Connected facilities review the approved incoming package; acceptance does not mean the patient has arrived.",
    [
      "Review Referral",
      "Accept Referral",
      "Decline with Reason",
      "Contact Sending Facility",
    ],
  ),
  section(
    "acceptance",
    "Awaiting Acceptance",
    "Remote acceptance requires connectivity or a verified communication path. An NFC write is not hospital acceptance.",
    ["View Status"],
  ),
  section(
    "transit",
    "In Transit",
    "Arrival must be verified separately. No live location tracking is provided.",
    ["Confirm Patient Arrival"],
  ),
  section(
    "arrived",
    "Arrived",
    "Identity-confirmed arrival, clinical handoff acknowledgement and outcome are separate events.",
    ["Acknowledge Handoff", "Record Outcome"],
  ),
  section(
    "completed",
    "Completed",
    "Closure/outcome must be documented and delivered before synchronized status can be asserted.",
    ["View Status"],
  ),
  section(
    "external",
    "External Referrals",
    "Route B — External / Non-participating Facility: use clinician-approved paper, the complete organized soft copy through an authorized channel, and a compact encrypted NFC handoff. A phone is not required. No automatic external acceptance or arrival is claimed.",
    [
      "Select Approved Referral",
      "Initiate Referral",
      "Choose Destination",
      "Generate Documents",
      "Prepare NFC Handoff",
      "Record Verified Update",
    ],
  ),
];
export const followUpSections = [
  section(
    "today",
    "Today's Follow-ups",
    "No visit is scheduled for today in this demo.",
    ["Create Follow-up", "Select Patient"],
  ),
  section(
    "upcoming",
    "Upcoming",
    "Doctor-entered instructions, not generated care requirements.",
    ["Enter Reason", "Add Required Tests", "Set Date", "Set Reminder"],
  ),
  section(
    "overdue",
    "Overdue",
    "No overdue clinical status is inferred from the synthetic example.",
    ["Mark Reviewed"],
  ),
  section(
    "completed",
    "Completed",
    "Only an authorized clinician may record completion; no completion occurs here.",
    ["Mark Completed"],
  ),
  section(
    "instructions",
    "Patient Instructions",
    "Show exactly what the clinician entered.",
    ["Enter Reason"],
  ),
  section(
    "investigations",
    "Required Investigations",
    "Only clinician-entered required tests belong here.",
    ["Add Required Tests"],
  ),
];
export const inventorySections = [
  section(
    "stock",
    "NFC Band Stock",
    "Physical printed/engraved Band Inventory IDs track stock by model, batch, condition and facility. Stock quantities are not supplied.",
    ["View Stock", "Add Received Stock", "Request Stock"],
  ),
  section(
    "issue",
    "Issue Band",
    "Issue and optional deposit use the external band asset code, never the clinical NFC contents.",
    ["Enter Band Code", "Record Issue", "Record Deposit"],
  ),
  section(
    "return",
    "Return Band",
    "Participating facilities inspect condition and record return/refund where applicable. Clearance, hygiene checking and verification are required before reuse.",
    ["Enter Band Code", "Inspect Condition", "Record Return", "Process Refund"],
  ),
  section(
    "defective",
    "Defective Bands",
    "Damaged or defective bands require replacement or retirement, with responsibility agreed before production.",
    ["Report Damage", "Send for Replacement", "Retire Band"],
  ),
  section(
    "transfers",
    "Stock Transfers",
    "Redistribute surplus and replenish shortages with authorized receipt and reconciliation.",
    ["Request Transfer", "Transfer Surplus", "Confirm Receipt"],
  ),
  section(
    "devices",
    "Bluetooth Devices",
    "Facility-owned Bluetooth NFC Reader/Writer: proposed ESP32 BLE reader and writer with a small screen and physical controls. Devices are not connected.",
    ["Register Device", "Assign Device", "Report Fault"],
  ),
  section(
    "financial",
    "Financial Records",
    "Deposits, refunds and distributor reimbursement require reconciled claims and duplicate prevention. No amounts or transactions are supplied.",
    ["View Deposits", "View Refunds", "Reimbursement Claims"],
  ),
  section(
    "history",
    "Inventory History",
    "Future issue/return, condition, settlement and transfer history. No stock movement has occurred.",
    ["View Transactions", "Export Report"],
  ),
];
export const distributorSections = [
  section(
    "overview",
    "Home",
    "Facility stock levels, shortages, returns and outstanding reimbursements. Operational quantities are not supplied.",
    ["View Shortages", "Review Requests"],
  ),
  section(
    "stock",
    "Stock",
    "Bands by model/batch/condition, warehouse stock, devices and returns.",
    ["Add Stock", "Assign Stock", "Inspect Returns"],
  ),
  section(
    "transfers",
    "Transfers",
    "Replenishment, surplus requests, shipment and collection tracking.",
    ["Approve Transfer", "Dispatch", "Confirm Delivery"],
  ),
  section(
    "settlements",
    "Settlements",
    "Refund reimbursement requests and reconciled payouts. Prevent duplicate refunds/claims; offline pending status is not settlement.",
    ["Verify Claim", "Approve Reimbursement", "Mark Settled"],
  ),
  section(
    "more",
    "More",
    "Partner facilities, damaged stock, reports and preferences.",
    ["Manage Facilities", "Export Report"],
  ),
];
export const moreMenus: Record<Role, [string, string][]> = {
  mother: [
    ["profile", "Profile Settings"],
    ["permissions", "Connected Accounts and Permissions"],
    ["appearance", "Appearance"],
    ["privacy", "Privacy and Data Controls"],
    ["help", "Help and Support"],
    ["logout", "Log Out"],
  ],
  professional: [
    ["profile", "Profile"],
    ["notifications", "Notifications"],
    ["verification", "Professional Verification"],
    ["affiliation", "Facility Affiliation"],
    ["help", "Help"],
    ["logout", "Log Out"],
  ],
  organization: [
    ["staff", "Staff Management"],
    ["verification", "Professional Verification"],
    ["profile", "Facility Profile"],
    ["device", "Device Management"],
    ["reports", "Reports and Analytics"],
    ["monitoring", "Referral Monitoring"],
    ["follow-up", "Follow-up Operations"],
    ["distributor", "Distributor Coordination"],
    ["settlements", "Financial Settlements"],
    ["notifications", "Notifications"],
    ["settings", "Settings"],
    ["help", "Help and Support"],
    ["logout", "Log Out"],
  ],
};
export const moreDescriptions: Record<string, string> = {
  notifications:
    "No notifications have been issued. Future notifications and delivery channels require separate approval.",
  documents:
    "Authorized documents retain their original source and date. No file is uploaded or downloaded in this demo.",
  permissions:
    "Connected account and record-sharing consent controls are planned. Role selection grants no record access.",
  profile:
    "Synthetic profile only. Identity authentication does not verify a clinical license or facility affiliation.",
  verification:
    "Professional credentials and organizational permissions require a future verified process. No verification is granted by this preview.",
  affiliation:
    "Dr. Ishani Rao · Lotus Family Clinic · Synthetic affiliation, not verified.",
  documentation:
    "AI Documentation: planned source-preserving extraction, completeness checks, structured handoff drafts and revisions. Original reports, author, time, units and unknowns remain visible. A clinician must confirm; changed source documents require review and re-approval. No extraction or AI generation is active.",
  device:
    "Bluetooth NFC Reader/Writer preview: facility-owned ESP32 with BLE, NFC read/write module, screen and physical controls. Planned size/ready state, physical write confirmation and read-back verification. No phone-native NFC or Bluetooth connection is active. Only clinician-approved, authorized compact encrypted clinical handoffs may be transferred.",
  reports:
    "Authorized original reports and investigations retain source, dates and verification context. No analysis or export runs here.",
  monitoring:
    "Referral Monitoring: operational acceptance, arrival, handoff acknowledgement and closure are distinct verified events. No clinical risk score, location monitoring, or live alert is generated.",
  "follow-up":
    "Follow-up Operations: an administrative preview of clinician-entered follow-up coordination. Organizations do not choose clinical reasons/tests or mark clinical review complete. Live delivery and escalation remain undecided.",
  settlements:
    "Reconciled facility refunds and distributor reimbursement are planned. Policies, liabilities, duplicate prevention and authorization remain unresolved; no financial operation is active.",
};
export const educationActions = [
  "Search Topics",
  "Browse Categories",
  "Read Article",
  "Related Topics",
  "View Source",
  "Watch Video",
  "Ask AI Companion",
];
export const companionActions = [
  "New Chat",
  "Ask Question",
  "Explore Topic",
  "View Sources",
  "Search Online",
  "Personalization Settings",
  "Reset Preferences",
  "Chat History",
];
