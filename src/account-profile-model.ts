export type AccountProfileKind = "professional" | "organization";
export const accountProfileFields = {
  professional: [
    ["name", "Full name"],
    ["phone", "Phone"],
    ["birthDate", "Date of birth"],
    ["profession", "Profession"],
    ["qualification", "Qualifications"],
    ["specialty", "Specialty"],
    ["council", "Registration council / authority"],
    ["registrationNumber", "Professional registration number"],
    ["registrationValidUntil", "Registration valid until"],
    ["experience", "Years of experience"],
    ["affiliation", "Facility affiliation"],
    ["department", "Department"],
    ["address", "Work address"],
  ],
  organization: [
    ["name", "Facility name"],
    ["facilityType", "Facility type"],
    ["registrationNumber", "Facility registration number"],
    ["affiliation", "Government / network affiliation"],
    ["address", "Facility address"],
    ["city", "City / district"],
    ["state", "State / region"],
    ["postalCode", "Postal code"],
    ["country", "Country"],
    ["contactPerson", "Contact person"],
    ["phone", "Contact phone"],
    ["email", "Facility email"],
    ["website", "Website"],
    ["services", "Services provided"],
  ],
} as const;
export type AccountProfile = {
  fields: Record<string, string>;
  code: string;
  updatedAt: string;
  credential?: { id: string; name: string; type: string; size: number };
};
export function validateAccountFields(
  kind: AccountProfileKind,
  input: Record<string, string>,
) {
  const fields: Record<string, string> = {};
  for (const [key] of accountProfileFields[kind]) {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.length > 1000)
      throw Error("Check the profile field lengths.");
    fields[key] = value.trim();
  }
  if (!fields.name || fields.name.length > 120)
    throw Error("Enter a name of up to 120 characters.");
  for (const key of ["birthDate", "registrationValidUntil"]) {
    if (
      fields[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(fields[key]) ||
        !Number.isFinite(Date.parse(fields[key])) ||
        new Date(fields[key]).toISOString().slice(0, 10) !== fields[key])
    )
      throw Error("Enter a valid date.");
  }
  if (fields.experience && !/^\d{1,2}$/.test(fields.experience))
    throw Error("Enter whole years of experience.");
  return fields;
}
