import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { CareCards, type FollowUp, type Referral } from "./care";
it("hides absent or inactive home events and links real scheduled/initiated summaries", () => {
  const f: FollowUp = { id: "f", status: "draft", date: "2026-11-01", time: "10:30", doctor: "Test clinician" };
  const r: Referral = { id: "r", status: "draft", cause: "Test referral cause" };
  const render = (followUps: FollowUp[], referrals: Referral[]) => renderToStaticMarkup(<MemoryRouter><CareCards followUps={followUps} referrals={referrals} /></MemoryRouter>);
  expect(render([], [])).toBe("");
  expect(render([f], [r])).toBe("");
  const visible = render([{ ...f, status: "scheduled" }], [{ ...r, status: "initiated", nextFacility: "Test facility" }]);
  for (const text of ["10:30", "Test clinician", "Test referral cause", "Test facility", "/mother/health/follow-up", "/mother/health/referrals"]) expect(visible).toContain(text);
  expect(render([{ ...f, status: "cancelled" }], [{ ...r, status: "completed" }])).toBe("");
});
