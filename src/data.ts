import type { Role } from "./session";
export const TAGLINE = "Every Mother. Every Step."; // Provisional copy pending final acceptance.
export const roleNames: Record<Role, string> = {
  mother: "Mother / Caregiver",
  professional: "Healthcare Professional",
  organization: "Organization / Facility",
};
export const patients = [
  {
    id: "mira",
    name: "Mira Sen",
    initials: "MS",
    stage: "Pregnancy",
    detail: "Maternal journey · Sample profile",
    age: "29 years",
  },
  {
    id: "anika",
    name: "Anika Roy",
    initials: "AR",
    stage: "Postpartum",
    detail: "Postpartum journey · Sample profile",
    age: "32 years",
  },
  {
    id: "leela",
    name: "Leela Das",
    initials: "LD",
    stage: "Parenting",
    detail: "Family journey · Sample profile",
    age: "27 years",
  },
];
export const children = [
  {
    id: "tara",
    name: "Tara Sen",
    initials: "TS",
    age: "4 years",
    description: "A little explorer with a big imagination.",
    report: "Tara · Routine visit summary",
    prescription: "Tara · Prescription layout example",
    medication: "Tara · Medication record preview",
  },
  {
    id: "arun",
    name: "Arun Sen",
    initials: "AS",
    age: "18 months",
    description: "Discovering the world, one small step at a time.",
    report: "Arun · Growth visit summary",
    prescription: "Arun · Prescription layout example",
    medication: "Arun · Medication record preview",
  },
];
export const navigation: Record<Role, [string, string, string][]> = {
  mother: [
    ["overview", "My overview", "House"],
    ["journey", "My journey", "Heart"],
    ["health", "My health", "FileHeart"],
    ["children", "My children", "Baby"],
    ["follow-up", "Follow-up", "CalendarDays"],
    ["referrals", "Care journey", "ArrowRightLeft"],
    ["matrisathi", "MatriSathi", "Flower2"],
    ["assistant", "AI Assistant", "Sparkles"],
  ],
  professional: [
    ["overview", "Overview", "House"],
    ["patients", "Patients", "Users"],
    ["prescriptions", "Prescriptions", "ClipboardList"],
    ["matribridge", "MatriBridge", "Files"],
    ["matriflow", "MatriFlow", "ArrowRightLeft"],
    ["matriwatch", "MatriWatch", "Activity"],
    ["follow-up", "Follow-up", "CalendarDays"],
    ["drug-safety", "Drug Safety Assistant", "Pill"],
    ["matrivitals", "MatriVitals", "HeartPulse"],
    ["bridge", "Bridge Manager", "Cpu"],
  ],
  organization: [
    ["overview", "Facility overview", "House"],
    ["staff", "Staff & verification", "BadgeCheck"],
    ["patients", "Patient records", "Users"],
    ["referrals", "Referrals", "ArrowRightLeft"],
    ["follow-up", "Follow-up", "CalendarDays"],
    ["devices", "Device inventory", "Cpu"],
    ["activity", "Activity history", "Activity"],
  ],
};
export const modules: Record<
  string,
  {
    title: string;
    eyebrow: string;
    description: string;
    steps: string[];
    action: string;
  }
> = {
  matribridge: {
    title: "Less paperwork. More presence.",
    eyebrow: "MatriBridge",
    description:
      "A future documentation workspace to help professionals organize source records, with human review at every step.",
    steps: [
      "Add a source record",
      "Request transcription",
      "Review against the original",
      "Confirm the documentation",
    ],
    action: "Upload a record",
  },
  matrisathi: {
    title: "A companion for every chapter.",
    eyebrow: "MatriSathi",
    description:
      "A planned educational space for mothers and caregivers, from preparing for pregnancy to raising children.",
    steps: [
      "Preparing for pregnancy",
      "Your pregnancy journey",
      "Postpartum support",
      "Growing with your children",
    ],
    action: "Explore personalized tips",
  },
  assistant: {
    title: "A space for your questions.",
    eyebrow: "AI Assistant",
    description:
      "A future educational assistant for maternal and child topics. No model is loaded and no answers are generated in this demo.",
    steps: [
      "Maternal topics",
      "Child-related topics",
      "Online companion",
      "On-device companion · future 4 GB RAM target",
    ],
    action: "Start a conversation",
  },
  "drug-safety": {
    title: "Knowledge that supports care.",
    eyebrow: "Drug Safety Assistant",
    description:
      "An educational reference concept for medicines and herbs. No patient-specific advice, interaction assessment, or medicine recommendations are available.",
    steps: ["Drug references", "Herb references", "Interaction references"],
    action: "Search references",
  },
  matrivitals: {
    title: "A clearer picture, together.",
    eyebrow: "MatriVitals",
    description:
      "A placeholder for future recorded observations and device integration. Device specifications and validation remain to be defined.",
    steps: [
      "Recorded observations",
      "Source and provenance",
      "Professional review",
    ],
    action: "Connect a device",
  },
  bridge: {
    title: "Continuity, beyond connectivity.",
    eyebrow: "Bridge Manager",
    description:
      "A future Bluetooth connection to the MatriSync Bridge: an ESP32 device with an external NFC interface. MatriBand carries the handoff; the phone does not read NFC directly.",
    steps: [
      "Connect the facility Bridge",
      "Prepare the handoff",
      "Confirm on the physical device",
      "Read back and verify",
    ],
    action: "Connect Bridge",
  },
  devices: {
    title: "Tools that connect your team.",
    eyebrow: "Device inventory",
    description:
      "A preview of facility-provided MatriSync Bridge devices and MatriBand tokens. No device is connected or transmitting data.",
    steps: [
      "Bridge DEMO-01 · Not connected",
      "Bridge DEMO-02 · Not connected",
      "MatriBand · Passive handoff token",
    ],
    action: "Manage devices",
  },
};
