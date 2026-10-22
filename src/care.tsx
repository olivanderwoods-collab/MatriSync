import { Link } from "react-router-dom";
export type FollowUp = { id: string; status: "draft" | "scheduled" | "completed" | "cancelled"; date: string; time: string; doctor: string };
export type Referral = { id: string; status: "draft" | "initiated" | "completed"; cause: string; nextFacility?: string };
export function CareCards({ followUps, referrals }: { followUps: FollowUp[]; referrals: Referral[] }) {
  const followUp = followUps.filter(f => f.status === "scheduled").sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0];
  const referral = [...referrals].reverse().find(r => r.status === "initiated");
  return <>
    {followUp && <section className="panel"><h2>Upcoming follow-up</h2><p>{followUp.date} · {followUp.time}</p><p>{followUp.doctor}</p><Link className="text-link" to="/mother/health/follow-up">View follow-up</Link></section>}
    {referral && <section className="panel"><h2>Referral initiated</h2><p>{referral.cause}</p>{referral.nextFacility && <p>{referral.nextFacility}</p>}<Link className="text-link" to="/mother/health/referrals">View referral</Link></section>}
  </>;
}
