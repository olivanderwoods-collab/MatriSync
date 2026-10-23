import type { Role } from "./session";
export const TAGLINE = "Every Mother. Every Step."; // Provisional copy pending final acceptance.
export const roleNames: Record<Role, string> = {
  mother: "Mother",
  professional: "Healthcare Professional",
  organization: "Healthcare Organization",
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
    ["overview", "Home", "House"],
    ["health", "My Health", "FileHeart"],
    ["matrisathi", "MatriSathi", "Flower2"],
    ["children", "Children", "Baby"],
    ["more", "More", "Menu"],
  ],
  professional: [
    ["overview", "Home", "House"],
    ["patients", "Patients", "Users"],
    ["follow-up", "Follow-ups", "CalendarDays"],
    ["more", "More", "Menu"],
  ],
  organization: [
    ["overview", "Home", "House"],
    ["referrals", "Referrals", "ArrowRightLeft"],
    ["patients", "Patients", "Users"],
    ["inventory", "Inventory", "Cpu"],
    ["more", "More", "Menu"],
  ],
};
