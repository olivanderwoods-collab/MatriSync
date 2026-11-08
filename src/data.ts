import type { Role } from "./session";
export const TAGLINE = "Every Mother. Every Step."; // Provisional copy pending final acceptance.
export const roleNames: Record<Role, string> = {
  mother: "Mother",
  professional: "Healthcare Professional",
  organization: "Healthcare Organization",
};
// Only the explicitly disposable Guest fixture list is replaced. Account records are untouched.
export const patients = [{ id: "MAT-DEMO-001", name: "Ophelia Frost", initials: "OF", stage: "Postpartum", detail: "Critical - Emergency Referral - Demo", age: "Age not recorded" }];
export const children: { id: string; name: string; initials: string; age: string; description: string; report: string; prescription: string; medication: string }[] = [];
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
    ["referrals", "Referrals", "ArrowRightLeft"],
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
