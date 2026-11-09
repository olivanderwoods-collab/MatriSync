import {MotherLocalCopies} from "./records";
import {MotherCareRecords,medicationText,medicationDisplay} from "./care-medication";
import {createPatientPairing,redeemPatientPairing} from "./care-intake";
import {CareRecordReview} from "./care-records-panel";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { BleHandoffPanel } from "./ble-handoff-panel";
import { allReferralFields, emptyReferralFields, missingReferralFields, type ReferralFields } from "./referral-draft";
import { printReferralDocument, referralLabels } from "./referral-document";
import { careHandoffDocument } from "./care-document";
import { contributionKinds, type CareRole, type CareView, type ContributionKind } from "./care-model";
import { activateCareFacility, assignCareStaff, careMembership, contributeCare, createCareHandoff, enrollCareDevice, grantCareProfile, listCareFacilities, listCareProfiles, loadCareProfile, receiveCareHandoff, registerCareProfile } from "./care-client";
import { careReceipts, latestCareHandoff, readCareCopy, readCareDraft, readPendingCareHandoff, type PendingCareHandoff, savedCareIds } from "./care-storage";
import { CareDraftSession } from "./care-draft-session";
import { unbase64 } from "./vault-crypto";
const blank = (): ReferralFields => ({ ...emptyReferralFields(), ...Object.fromEntries(allReferralFields.map(k => [k, ""])) });
function Facts({ fields }: { fields: ReferralFields }) {
  return <dl>{allReferralFields.map(key => <div key={key} className="care-fact"><dt>{referralLabels[key]}</dt><dd className="preserve-lines">{fields[key] || "Not recorded"}</dd></div>)}</dl>;
}
function ReceivedPopup({ value, close }: { value: CareView; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={close} className="care-dialog" aria-label="Received NFC handoff">
    <h2>Received handoff · {value.profile.name}</h2>
    <p>{value.verified ? `Matched to the authorized online handoff${value.verifiedAt ? ` at ${value.verifiedAt}` : " when previously checked"}. This saved check does not establish current authorization while offline.` : "Offline basic details. The packet signature and completeness checked; the claimed source and current authorization have not been checked online."}</p>
    <p>Patient ID: {value.id}</p><Facts fields={value.entries[0].fields!} />
    <p>This received snapshot is saved encrypted with the patient reference. Closing this window does not discard it. Uploaded original files were not transferred.</p>
    <button className="button primary" onClick={close}>Close and keep saved handoff</button>
  </dialog>;
}
export function CarePage({ uid, role, section }: { uid: string; role: string; section?: string }) {
  return <CareAccountPage key={`${uid}:${role}`} uid={uid} role={role} section={section} />;
}
function CareAccountPage({ uid, role, section }: { uid: string; role: string; section?: string }) {
  const [membership, setMembership] = useState<Awaited<ReturnType<typeof careMembership>>>({ staff: undefined, facility: undefined });
  const [ids, setIds] = useState<string[]>([]), [id, setId] = useState("");
  const [view, setView] = useState<CareView>(), [popup, setPopup] = useState<CareView>();
  const [receipts, setReceipts] = useState<CareView[]>([]);

  const [intake,setIntake]=useState(""),[pairCode,setPairCode]=useState(""),[pairFacility,setPairFacility]=useState(""),[generatedPair,setGeneratedPair]=useState<{code:string;expiresAt:string}>();
  const [profileTab,setProfileTab]=useState(section==="handoff"?"handoff":"profile");
  const [facilities, setFacilities] = useState<Awaited<ReturnType<typeof listCareFacilities>>>([]);
  const [destination, setDestination] = useState(""), [fields, setFields] = useState<ReferralFields>(blank);
  const [packet, setPacket] = useState<Uint8Array<ArrayBuffer>>(), [html, setHtml] = useState("");
  const [handoffId, setHandoffId] = useState("");
  const selection = useRef(0);
  const [pendingApproval, setPendingApproval] = useState<PendingCareHandoff>();
  const draftSessions = useRef(new Map<string, CareDraftSession>());
  const [capacity, setCapacity] = useState("32768"), [text, setText] = useState(""), [kind, setKind] = useState<ContributionKind>("clinical-note");
  const [accessCode, setAccessCode] = useState(""), [registration, setRegistration] = useState<{ id: string; code: string }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const staff = membership.staff?.enabled ? membership.staff : undefined;
  function selectPatient(next: string) {
    selection.current++; setPendingApproval(undefined);
    setId(next); setView(undefined); setPopup(undefined); setReceipts([]);
    setGeneratedPair(undefined); setAccessCode(""); setRegistration(undefined); setFields(blank()); setText("");
    setDestination(""); setCapacity("32768"); setPacket(undefined); setHtml(""); setHandoffId("");
    setError(""); setNotice("");
    return selection.current;
  }
  useEffect(() => {
    const sessions = draftSessions.current;
    const protectUnsaved = (event: BeforeUnloadEvent) => {
      if ([...sessions.values()].some(session => session.pending > 0 || session.error)) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", protectUnsaved);
    return () => window.removeEventListener("beforeunload", protectUnsaved);
  }, []);
  function editDraft(nextFields = fields, nextDestination = destination, nextCapacity = capacity) {
    setFields(nextFields); setDestination(nextDestination); setCapacity(nextCapacity);
    setPacket(undefined); setHtml(""); setError("");
    if (!view) return;
    const session = draftSessions.current.get(view.id), current = selection.current;
    if (!session) { setError("Load this patient's saved draft before editing."); return; }
    setNotice("Saving referral draft on this browser…");
    void session.save({ fields: nextFields, destination: nextDestination, capacity: nextCapacity }).then(() => {
      if (current === selection.current && session.pending === 0) { setError(""); setNotice("Referral draft saved encrypted on this browser. Review and approve it to create a handoff."); }
    }).catch(e => {
      if (current === selection.current) { setNotice(""); setError(`Draft not saved: ${e instanceof Error ? e.message : "Storage is unavailable."} Keep this page open to preserve your edits.`); }
    });
  }
  useEffect(() => {
    let live = true;
    const current = selection.current;
    void savedCareIds(uid).then(async saved => {
      if (!live || current !== selection.current) return; setIds(existing => [...new Set([...existing, ...saved])]);
      if (role === "mother" && saved.length === 1) {
        const copy = await readCareCopy(uid, saved[0]);
        if (live && current === selection.current && copy?.motherUid === uid) { setView(copy); setId(copy.id); }
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [uid, role]);
  async function act(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Care action failed. No success confirmed."); }
    finally { setBusy(false); }
  }
  async function refresh() {
    await enrollCareDevice(uid);
    const member = await careMembership(uid); setMembership(member);
    if (member.staff?.enabled) setKind(contributionKinds[member.staff.role][0]);
    setIds([...new Set([...await listCareProfiles(uid, role === "mother"), ...await savedCareIds(uid)])]);
    if (member.staff?.role === "doctor" || role === "mother") setFacilities(await listCareFacilities(uid));

  }
  async function open(selected = id, offline = false) {
    const code = accessCode || undefined, current = selectPatient(selected);
    const previousSession = draftSessions.current.get(selected);
    await previousSession?.wait();
    const next = offline ? await readCareCopy(uid, selected) : await loadCareProfile(uid, selected, code);
    if (current !== selection.current) return;
    if (!next) throw Error("No local copy.");
    setView(next);
    const [received, saved, storedDraft, approved] = await Promise.all([careReceipts(uid, selected), latestCareHandoff(uid, selected), previousSession?.error ? Promise.resolve(previousSession.latest) : readCareDraft(uid, selected), readPendingCareHandoff(uid, selected)]);
    if (current !== selection.current) return;
    setReceipts(received);
    const draft = storedDraft?.cleared ? undefined : storedDraft;
    draftSessions.current.set(selected, previousSession?.error ? previousSession : new CareDraftSession(uid, selected, storedDraft));
    if (draft) { setFields(draft.fields); setDestination(draft.destination); setCapacity(draft.capacity); }
    if (previousSession?.error) setError(`Unsaved edits restored from this open tab: ${previousSession.error}`);
    if (approved?.status === "pending") { setPendingApproval(approved); setFields(approved.handoff.fields); setDestination(approved.handoff.recipientUid); setCapacity(String(approved.capacity)); }
    if (saved && !draft && approved?.status !== "pending") {
      setPacket(unbase64(saved.packet)); setHandoffId(saved.id);
      setHtml(careHandoffDocument({ id: saved.caseId, profile: saved.profile }, saved.fields, saved.id, saved.actorName, saved.sourceUid, saved.recordedAt));
    }
    setNotice((next.snapshotOnly ? "Showing the handoff's basic snapshot. Full profile not loaded." : "Saved profile and timestamped contributions loaded. Original files remain on their source device.") + (approved?.status === "pending" ? " An approved handoff is awaiting confirmation. Its original details are locked; use the approval action to check or retry it. Nothing is sent automatically. Any newer draft remains saved separately." : draft ? " Unapproved referral draft restored. Refresh care access to edit if needed; review and approve explicitly before sending." : saved ? " Original completed handoff restored from encrypted storage on this browser. Its details and packet are unchanged; delivery has not been confirmed." : ""));
  }
  useEffect(() => {
    // A scan is immediately retained. Reconnection fetches the authoritative
    // profile separately and never relabels the offline snapshot as current.
    const refreshOnline = () => { if (view?.snapshotOnly && !busy) void act(() => open(view.id)); };
    window.addEventListener("online", refreshOnline);
    return () => window.removeEventListener("online", refreshOnline);
    // The effect needs the latest selected snapshot, not a background poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id, view?.snapshotOnly, busy]);
  return <>
    <h1>{role === "mother" ? "My linked care profile" : "Connected care"}</h1>
    {role === "mother" && <nav className="tabs" aria-label="Section tabs">{["overview","prescriptions","reports"].map(section=><NavLink key={section} to={`/mother/health/${section}`}>{section==="overview"?"My profile":section==="prescriptions"?"Prescriptions":"Reports"}</NavLink>)}</nav>}
    <p className="notice">Submission prototype · Fictional records only. Manually entered records are encrypted in Firestore. Uploaded PDFs and images stay local. Staff permissions come from facility assignments, not the selected workspace.</p>
    <section className="panel"><h2>Account and browser</h2><p className="record-id">Account ID: <span data-testid="care-account-id">{uid}</span></p>
      <button className="button secondary" disabled={busy} onClick={() => void act(refresh)}>Enroll this browser / Refresh care access</button>
      {staff && <p>Assigned role: <strong>{staff.role === "lab" ? "Lab technician" : staff.role}</strong> · {staff.name}</p>}
      {membership.facility?.enabled && <p>Facility: {membership.facility.name}</p>}
      {!staff && !membership.facility && role !== "mother" && <p>Enroll this browser, then give its account ID to your facility administrator. No clinical permission is granted by enrollment.</p>}
    </section>
    {role === "organization" && !membership.facility?.enabled && <form className="panel record-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act(async () => { await activateCareFacility(uid, String(data.get("name")), String(data.get("invitation"))); await refresh(); setNotice("Demo facility invitation redeemed. This is not public clinical accreditation."); }); }}>
      <h2>Activate an invited demo facility</h2><label>Facility name<input name="name" required maxLength={120} /></label><label>One-use facility invitation<input name="invitation" type="password" required autoComplete="off" /></label><button className="button primary" disabled={busy}>Activate invited facility</button>
    </form>}
    {membership.facility?.enabled && <form className="panel record-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act(async () => { await assignCareStaff(uid, String(data.get("uid")), String(data.get("name")), String(data.get("role")) as CareRole, data.get("enabled") === "on"); setNotice("Staff assignment saved. Case access is granted separately below."); }); }}>
      <h2>Register staff permissions</h2><p>Each staff member signs in with their own account and enrolls their browser first.</p>
      <label>Staff account ID<input name="uid" required /></label><label>Staff display name<input name="name" required maxLength={120} /></label>
      <label>Staff role<select name="role"><option value="doctor">Doctor</option><option value="nurse">Nurse</option><option value="lab">Lab technician</option></select></label>
      <label className="check-row"><input name="enabled" type="checkbox" defaultChecked />Active assignment</label><button className="button primary" disabled={busy}>Save staff permissions</button>
    </form>}
    {role === "organization" && membership.facility?.enabled && <section className="panel"><h2>Add patient</h2><div className="action-row"><button className="button secondary" onClick={()=>setIntake("manual")}>Add patient manually</button><button className="button secondary" onClick={()=>setIntake("pair")}>Load with Mother's pairing code</button><button className="button secondary" onClick={()=>setIntake("nfc")}>Connect MatriSync Device / Scan NFC</button></div>
    {intake==="manual"&&<form className="record-form" onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);void act(async()=>{const result=await registerCareProfile(uid,{name:String(form.get("name")),birthDate:String(form.get("birthDate")),sourceLocalId:crypto.randomUUID(),sourceUid:uid},true);selectPatient(result.id);setRegistration(result);setView(result.view);setIds(existing=>[...new Set([...existing,result.id])]);});}}><label>Mother name<input name="name" required maxLength={120}/></label><label>Date of birth<input name="birthDate" type="date"/></label><button className="button primary" disabled={busy}>Register patient</button></form>}
    {intake==="pair"&&<form className="record-form" onSubmit={e=>{e.preventDefault();void act(async()=>{const full=await redeemPatientPairing(uid,pairCode);selectPatient(full.id);setView(full);setIds(existing=>[...new Set([...existing,full.id])]);setPairCode("");setNotice("Mother-approved profile paired. Assign the patient to the care team below.");});}}><label>Mother-generated pairing code<input value={pairCode} onChange={e=>setPairCode(e.target.value)} autoComplete="off" required/></label><button className="button primary" disabled={busy}>Load paired profile</button></form>}
    {registration&&<div className="notice"><strong>Mother login credentials</strong><p>Patient ID: {registration.id}</p><p>Access code: {registration.code}</p><p>Keep these for the Mother. They are separate from the one-use pairing code.</p></div>}
    </section>}
    <section className="panel record-form"><h2>Open a saved or assigned profile</h2>
      <label>Connected patient<select aria-label="Connected patient" disabled={busy} value={id} onChange={e => selectPatient(e.target.value)}><option value="">Choose a patient reference</option>{ids.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      {role === "mother" && <label>Patient access code (first unlock on this browser)<input type="password" autoComplete="off" value={accessCode} onChange={e => setAccessCode(e.target.value)} /></label>}
      <button className="button secondary" disabled={busy || !id} onClick={() => void act(() => open())}>Load / Refresh full profile</button>
      <button className="text-link" disabled={busy} onClick={() => void act(async () => { const saved = await savedCareIds(uid); setIds(existing => [...new Set([...existing, ...saved])]); if (id) await open(id, true); })}>Open saved offline copies</button>
    </section>
    {role === "organization" && intake === "nfc" && <BleHandoffPanel onRead={async bytes => {
      const started = selection.current, value = await receiveCareHandoff(uid, bytes);
      if (started !== selection.current) return;
      const current = selectPatient(value.id); setPopup(value); setView(value); setIds(existing => [...new Set([...existing, value.id])]);
      const received = await careReceipts(uid, value.id); if (current !== selection.current) return; setReceipts(received);
      if (value.verified && navigator.onLine) { try { const full = await loadCareProfile(uid, value.id); if (current === selection.current) setView(full); } catch (e) { if (current === selection.current) setError(e instanceof Error ? e.message : "Full profile not available. Basic handoff retained."); } }
    }} />}
    {view && <section className="panel" aria-label="Connected care profile"><h2>{view.profile.name}</h2><p className="record-id">Patient ID: {view.id}</p>
      <p>{view.snapshotOnly ? "Basic handoff snapshot · Full profile unavailable" : "Authorized saved full profile"} · {view.verified ? "Checked online when saved; this copy may be out of date" : "Source and current authority not checked online"}</p>
      <p>Date of birth: {view.profile.birthDate || "Not recorded"}</p>
      {role !== "mother" && <nav className="tabs" aria-label="Patient profile sections"><button className="text-link" aria-pressed={profileTab==="profile"} onClick={()=>setProfileTab("profile")}>Profile</button><button className="text-link" aria-pressed={profileTab==="handoff"} onClick={()=>setProfileTab("handoff")}>Referral Handoff</button></nav>}
      {role === "mother" && <section className="record-form"><h3>Pair with a facility</h3><label>Receiving facility<select value={pairFacility} onChange={e=>setPairFacility(e.target.value)}><option value="">Refresh care access, then choose a facility</option>{facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><button className="button secondary" disabled={busy||!pairFacility||view.snapshotOnly} onClick={()=>void act(async()=>setGeneratedPair(await createPatientPairing(uid,view,pairFacility)))}>Generate pairing code</button>{generatedPair&&<p className="preserve-lines">{generatedPair.code}<br/>One use · Expires {generatedPair.expiresAt}</p>}</section>}
      {role !== "mother" && profileTab === "profile" && view.profile.details && <details><summary>Original manually entered profile</summary><p>Snapshot at registration. Later contributions are listed separately below.</p><dl>{Object.entries(view.profile.details).map(([key, value]) => <div className="care-fact" key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{String(value || "Not recorded")}</dd></div>)}</dl><p className="preserve-lines">{view.profile.history || "No profile notes recorded."}</p></details>}
      {role === "professional" && view.profile.sourceUid === uid && <Link className="button secondary" to={`/professional/patients/${view.profile.sourceLocalId}/overview`}>Open local profile, reports and prescriptions</Link>}
      {role !== "mother" && <><h3>{profileTab==="handoff"?"Referral Handoff":"Contribution history"}</h3>{view.entries.length === 0 && <p>No contributions recorded yet.</p>}
      {view.entries.filter(entry=>profileTab==="handoff"?entry.kind==="referral":entry.kind!=="referral").map(entry => <article key={entry.id} className="local-document"><h4>{entry.kind} · {entry.actorName}</h4><p className="small">{entry.role} · {entry.actorUid}<br />Device-recorded: {entry.recordedAt}<br />Server-recorded: {entry.serverAt || "Not available in this handoff snapshot"}</p><p className="preserve-lines">{medicationDisplay(entry.text)}</p>{entry.fields && <Facts fields={entry.fields} />}</article>)}
      {profileTab === "handoff" && receipts.length > 0 && <details><summary>Saved handoff receipts ({receipts.length})</summary>{receipts.map(receipt => <article key={receipt.handoffId}><p>{receipt.handoffId} · First received {receipt.receivedAt} · {receipt.verified ? `Checked online ${receipt.verifiedAt || "previously (time not recorded)"}` : "Captured offline; source authority was not checked at receipt"}</p><button className="text-link" onClick={() => setPopup(receipt)}>Reopen handoff</button></article>)}</details>}
      </>}
      {role === "mother" && <MotherCareRecords entries={view.entries} section={section}/>}
      {!view.snapshotOnly && <CareRecordReview key={`${uid}/${view.id}`} uid={uid} view={view} mother={role==="mother"} doctor={staff?.role==="doctor"} onlyKind={section==="reports"?"reports":section==="prescriptions"?"prescriptions":undefined}/>}
      {membership.facility?.enabled && !view.snapshotOnly && <form className="record-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act(async () => { await grantCareProfile(uid, view, String(data.get("staff"))); setNotice("Case assigned to the selected enrolled staff account."); }); }}><label>Assign this patient to staff account ID<input name="staff" required /></label><button className="button secondary" disabled={busy}>Assign patient to staff</button></form>}
      {staff && !view.snapshotOnly && <form className="record-form" onSubmit={e => { e.preventDefault(); const data=new FormData(e.currentTarget); void act(async () => { const content=kind==="prescription"?medicationText({name:String(data.get("medicine")),dose:String(data.get("dose")),route:String(data.get("route")),timing:String(data.get("timing")),from:String(data.get("from")),until:String(data.get("until"))}):text; await contributeCare(uid, view, kind, content); setText(""); await open(view.id); setNotice("Contribution saved with your identity, assigned role and server timestamp. Earlier entries are unchanged."); }); }}>
        <h3>Add your contribution</h3><label>Contribution type<select value={kind} onChange={e => setKind(e.target.value as ContributionKind)}>{contributionKinds[staff.role].filter(k => k !== "referral").map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        {kind==="prescription"?<><label>Medication name<input name="medicine" required maxLength={200}/></label>{["dose","route","timing","from","until"].map(field=><label key={field}>{field[0].toUpperCase()+field.slice(1)}<input name={field} maxLength={200}/></label>)}</>:<label>Recorded contribution<textarea value={text} onChange={e => setText(e.target.value)} maxLength={8000} rows={5} required /></label>}<button className="button primary" disabled={busy}>Save contribution</button>
      </form>}
      {(staff?.role === "doctor" || (role === "professional" && pendingApproval)) && !view.snapshotOnly && <section aria-label="Manual care handoff" className="record-form"><h3>Create referral handoff</h3>
        <p>Manually enter the details you intend to hand over. Nothing is inferred from documents or missing values.</p>
        <aside aria-label="Missing handoff details" aria-live="polite" className="notice"><strong>Missing details — advisory only</strong><p>{missingReferralFields(fields).map(k => referralLabels[k]).join("; ") || "Every listed field has an entry; this does not verify accuracy."}</p><p>You can create and send even with missing fields. Unknown values remain “Not recorded”.</p></aside>
        {allReferralFields.map(key => <label key={key}>{referralLabels[key]}<textarea disabled={busy || !!pendingApproval || !draftSessions.current.has(view.id)} value={fields[key] || ""} rows={2} maxLength={8000} onChange={e => editDraft({ ...fields, [key]: e.target.value })} /></label>)}
        <label>Receiving facility<select disabled={busy || !!pendingApproval || !draftSessions.current.has(view.id)} value={destination} onChange={e => editDraft(fields, e.target.value)}><option value="">Select the receiving facility</option>{destination && !facilities.some(f => f.id === destination) && <option value={destination}>Previously selected facility · availability not checked</option>}{facilities.filter(f => f.id !== staff?.facilityId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Handoff packet size limit in bytes<input disabled={busy || !!pendingApproval || !draftSessions.current.has(view.id)} type="number" min={1} max={32768} value={capacity} onChange={e => editDraft(fields, destination, e.target.value)} /></label><p className="small">32,768 is the reference BLE buffer limit. The current PN532 tag has only 48 verified bytes; its full capacity is still unconfirmed. The handoff uses lossless compact encoding; its final byte count must fit the verified usable tag capacity. A smaller confirmed limit rejects oversized packets without truncating them.</p>
        <button className="button primary" disabled={busy || !destination || !draftSessions.current.has(view.id)} onClick={() => void act(async () => {
          const size = Number(capacity); if (!Number.isInteger(size) || size < 1 || size > 32768) throw Error("Enter a packet limit between 1 and 32768 bytes.");
          const session = draftSessions.current.get(view.id)!; await session.wait(); if (session.error) throw Error(session.error);
          let result;
          try { result = await createCareHandoff(uid, view, destination, fields, size, pendingApproval ? pendingApproval.approvalRevision : session.revision); }
          finally { try { const pending = await readPendingCareHandoff(uid, view.id); setPendingApproval(pending?.status === "pending" ? pending : undefined); } catch { /* Do not mask a confirmed cloud result with a local read failure. */ } }
          let draftWarning = "";
          try { if (!result.savedLocally || session.revision !== result.approvalRevision) throw Error("Preserve draft until recovery completes"); await session.complete(); } catch { draftWarning = " The saved draft was retained because cleanup could not finish or a newer draft exists. Reload to recover the original approval and review the retained draft."; }
          setPacket(result.packet); setHandoffId(result.id); setHtml(careHandoffDocument({ id: view.id, profile: result.profile }, result.fields, result.id, result.actorName, uid, result.recordedAt)); setNotice("Doctor-recorded handoff created. Blank details remain unknown. BLE and NFC transfer have not been confirmed. " + (result.savedLocally ? "Original handoff saved encrypted on this browser for reopening." : "The cloud handoff succeeded, but its offline copy could not be saved. Keep this page open to print or transfer it. The saved approval remains available; use the same action to confirm and recover the original.") + draftWarning);
        })}>{pendingApproval ? "Check / retry approved handoff" : "Create and approve handoff with entered details"}</button>
      </section>}
      {role !== "mother" && html && <><iframe sandbox="" title="Handoff summary preview" srcDoc={html} style={{ width: "100%", height: 480 }} /><button className="button secondary" disabled={busy} onClick={() => void act(() => printReferralDocument(html))}>Print handoff summary / Save PDF</button></>}
      {packet && staff?.role === "doctor" && <BleHandoffPanel key={handoffId} packet={packet} />}
    </section>}
    {role === "mother" && (section==="prescriptions"||section==="reports") && <MotherLocalCopies kind={section}/>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">Working…</p>}
    {role !== "mother" && popup && <ReceivedPopup value={popup} close={() => setPopup(undefined)} />}
  </>;
}
