import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useRecords } from "./records";
import { BleHandoffPanel } from "./ble-handoff-panel";
import { allReferralFields, emptyReferralFields, missingReferralFields, type ReferralFields } from "./referral-draft";
import { printReferralDocument, referralLabels } from "./referral-document";
import { careHandoffDocument } from "./care-document";
import { contributionKinds, type CareRole, type CareView, type ContributionKind } from "./care-model";
import { activateCareFacility, assignCareStaff, careMembership, contributeCare, createCareHandoff, enrollCareDevice, grantCareProfile, listCareFacilities, listCareProfiles, loadCareProfile, receiveCareHandoff, registerCareProfile } from "./care-client";
import { careReceipts, latestCareHandoff, readCareCopy, readCareDraft, savedCareIds } from "./care-storage";
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
export function CarePage({ uid, role }: { uid: string; role: string }) {
  return <CareAccountPage key={`${uid}:${role}`} uid={uid} role={role} />;
}
function CareAccountPage({ uid, role }: { uid: string; role: string }) {
  const { vault } = useRecords();
  const [membership, setMembership] = useState<Awaited<ReturnType<typeof careMembership>>>({ staff: undefined, facility: undefined });
  const [ids, setIds] = useState<string[]>([]), [id, setId] = useState("");
  const [view, setView] = useState<CareView>(), [popup, setPopup] = useState<CareView>();
  const [receipts, setReceipts] = useState<CareView[]>([]);
  const [localId, setLocalId] = useState(new URLSearchParams(location.search).get("localPatient") || "");
  const [patients, setPatients] = useState<{ id: string; name: string }[]>([]);
  const [facilities, setFacilities] = useState<Awaited<ReturnType<typeof listCareFacilities>>>([]);
  const [destination, setDestination] = useState(""), [fields, setFields] = useState<ReferralFields>(blank);
  const [packet, setPacket] = useState<Uint8Array<ArrayBuffer>>(), [html, setHtml] = useState("");
  const [handoffId, setHandoffId] = useState("");
  const selection = useRef(0);
  const draftSessions = useRef(new Map<string, CareDraftSession>());
  const [capacity, setCapacity] = useState("32768"), [text, setText] = useState(""), [kind, setKind] = useState<ContributionKind>("clinical-note");
  const [accessCode, setAccessCode] = useState(""), [registration, setRegistration] = useState<{ id: string; code: string }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const staff = membership.staff?.enabled ? membership.staff : undefined;
  function selectPatient(next: string) {
    selection.current++;
    setId(next); setView(undefined); setPopup(undefined); setReceipts([]);
    setAccessCode(""); setRegistration(undefined); setFields(blank()); setText("");
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
    if (member.staff?.role === "doctor") setFacilities(await listCareFacilities(uid));
    if (vault && await vault.openOnDevice()) setPatients(vault.data?.patients.filter(p => p.id !== "self" && p.kind !== "child") || []);
  }
  async function open(selected = id, offline = false) {
    const code = accessCode || undefined, current = selectPatient(selected);
    const previousSession = draftSessions.current.get(selected);
    await previousSession?.wait();
    const next = offline ? await readCareCopy(uid, selected) : await loadCareProfile(uid, selected, code);
    if (current !== selection.current) return;
    if (!next) throw Error("No local copy.");
    setView(next);
    const [received, saved, storedDraft] = await Promise.all([careReceipts(uid, selected), latestCareHandoff(uid, selected), previousSession?.error ? Promise.resolve(previousSession.latest) : readCareDraft(uid, selected)]);
    if (current !== selection.current) return;
    setReceipts(received);
    const draft = storedDraft?.cleared ? undefined : storedDraft;
    draftSessions.current.set(selected, previousSession?.error ? previousSession : new CareDraftSession(uid, selected, storedDraft));
    if (draft) { setFields(draft.fields); setDestination(draft.destination); setCapacity(draft.capacity); }
    if (previousSession?.error) setError(`Unsaved edits restored from this open tab: ${previousSession.error}`);
    if (saved && !draft) {
      setPacket(unbase64(saved.packet)); setHandoffId(saved.id);
      setHtml(careHandoffDocument({ id: saved.caseId, profile: saved.profile }, saved.fields, saved.id, saved.actorName, saved.sourceUid, saved.recordedAt));
    }
    setNotice((next.snapshotOnly ? "Showing the handoff's basic snapshot. Full profile not loaded." : "Saved profile and timestamped contributions loaded. Original files remain on their source device.") + (draft ? " Unapproved referral draft restored. Refresh care access to edit if needed; review and approve explicitly before sending." : saved ? " Original completed handoff restored from encrypted storage on this browser. Its details and packet are unchanged; delivery has not been confirmed." : ""));
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
    {staff?.role === "doctor" && <section className="panel record-form"><h2>Connect a Doctor-created Mother profile</h2>
      <Link to="/professional/patients/add" className="button secondary">Create Mother profile locally</Link>
      <label>Saved local Mother profile<select aria-label="Saved local Mother profile" value={localId} onChange={e => setLocalId(e.target.value)}><option value="">Choose a saved patient</option>{patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <p>Register once to issue the Mother's separate patient ID/access code. Local report and prescription uploads will not be sent.</p>
      <button className="button primary" disabled={busy || !localId} onClick={() => void act(async () => {
        const patient = vault?.data?.patients.find(p => p.id === localId); if (!patient) throw Error("Open the saved local profile first.");
        const result = await registerCareProfile(uid, { name: patient.name, birthDate: patient.birthDate, sourceLocalId: patient.id, sourceUid: uid, ...(patient.profile ? { details: patient.profile } : {}), history: patient.history });
        selectPatient(result.id); draftSessions.current.set(result.id, new CareDraftSession(uid, result.id)); setRegistration(result); setView(result.view); setIds(current => [...new Set([...current, result.id])]); setNotice("Connected profile registered. Save the Mother credentials now; they are not placed in the handoff.");
      })}>Register linked profile and Mother access</button>
      {registration && <div className="notice"><strong>Save these Mother credentials now</strong><p>Patient ID: <span data-testid="mother-patient-id">{registration.id}</span></p><p>Access code: <span data-testid="mother-access-code">{registration.code}</span></p><p>The code is shown for this session only. It never grants a staff role.</p></div>}
    </section>}
    <section className="panel record-form"><h2>Open a saved or assigned profile</h2>
      <label>Connected patient<select aria-label="Connected patient" disabled={busy} value={id} onChange={e => selectPatient(e.target.value)}><option value="">Choose a patient reference</option>{ids.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      {role === "mother" && <label>Patient access code (first unlock on this browser)<input type="password" autoComplete="off" value={accessCode} onChange={e => setAccessCode(e.target.value)} /></label>}
      <button className="button secondary" disabled={busy || !id} onClick={() => void act(() => open())}>Load / Refresh full profile</button>
      <button className="text-link" disabled={busy} onClick={() => void act(async () => { const saved = await savedCareIds(uid); setIds(existing => [...new Set([...existing, ...saved])]); if (id) await open(id, true); })}>Open saved offline copies</button>
    </section>
    {role === "organization" && <BleHandoffPanel onRead={async bytes => {
      const started = selection.current, value = await receiveCareHandoff(uid, bytes);
      if (started !== selection.current) return;
      const current = selectPatient(value.id); setPopup(value); setView(value); setIds(existing => [...new Set([...existing, value.id])]);
      const received = await careReceipts(uid, value.id); if (current !== selection.current) return; setReceipts(received);
      if (value.verified && navigator.onLine) { try { const full = await loadCareProfile(uid, value.id); if (current === selection.current) setView(full); } catch (e) { if (current === selection.current) setError(e instanceof Error ? e.message : "Full profile not available. Basic handoff retained."); } }
    }} />}
    {view && <section className="panel" aria-label="Connected care profile"><h2>{view.profile.name}</h2><p className="record-id">Patient ID: {view.id}</p>
      <p>{view.snapshotOnly ? "Basic handoff snapshot · Full profile unavailable" : "Authorized saved full profile"} · {view.verified ? "Checked online when saved; this copy may be out of date" : "Source and current authority not checked online"}</p>
      <p>Date of birth: {view.profile.birthDate || "Not recorded"}</p>
      {view.profile.details && <details><summary>Original manually entered profile</summary><p>Snapshot at registration. Later contributions are listed separately below.</p><dl>{Object.entries(view.profile.details).map(([key, value]) => <div className="care-fact" key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{String(value || "Not recorded")}</dd></div>)}</dl><p className="preserve-lines">{view.profile.history || "No profile notes recorded."}</p></details>}
      {view.profile.sourceUid === uid && <Link className="button secondary" to={`/professional/patients/${view.profile.sourceLocalId}/overview`}>Open local profile, reports and prescriptions</Link>}
      <h3>Contribution history</h3>{view.entries.length === 0 && <p>No contributions recorded yet.</p>}
      {view.entries.map(entry => <article key={entry.id} className="local-document"><h4>{entry.kind} · {entry.actorName}</h4><p className="small">{entry.role} · {entry.actorUid}<br />Device-recorded: {entry.recordedAt}<br />Server-recorded: {entry.serverAt || "Not available in this handoff snapshot"}</p><p className="preserve-lines">{entry.text}</p>{entry.fields && <Facts fields={entry.fields} />}</article>)}
      {receipts.length > 0 && <details><summary>Saved handoff receipts ({receipts.length})</summary>{receipts.map(receipt => <article key={receipt.handoffId}><p>{receipt.handoffId} · First received {receipt.receivedAt} · {receipt.verified ? `Checked online ${receipt.verifiedAt || "previously (time not recorded)"}` : "Captured offline; source authority was not checked at receipt"}</p><button className="text-link" onClick={() => setPopup(receipt)}>Reopen handoff</button></article>)}</details>}
      {membership.facility?.enabled && !view.snapshotOnly && <form className="record-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act(async () => { await grantCareProfile(uid, view, String(data.get("staff"))); setNotice("Case assigned to the selected enrolled staff account."); }); }}><label>Assign this patient to staff account ID<input name="staff" required /></label><button className="button secondary" disabled={busy}>Assign patient to staff</button></form>}
      {staff && !view.snapshotOnly && <form className="record-form" onSubmit={e => { e.preventDefault(); void act(async () => { await contributeCare(uid, view, kind, text); setText(""); await open(view.id); setNotice("Contribution saved with your identity, assigned role and server timestamp. Earlier entries are unchanged."); }); }}>
        <h3>Add your contribution</h3><label>Contribution type<select value={kind} onChange={e => setKind(e.target.value as ContributionKind)}>{contributionKinds[staff.role].filter(k => k !== "referral").map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <label>Recorded contribution<textarea value={text} onChange={e => setText(e.target.value)} maxLength={8000} rows={5} required /></label><button className="button primary" disabled={busy}>Save contribution</button>
      </form>}
      {staff?.role === "doctor" && !view.snapshotOnly && <section aria-label="Manual care handoff" className="record-form"><h3>Create referral handoff</h3>
        <p>Manually enter the details you intend to hand over. Nothing is inferred from documents or missing values.</p>
        <aside aria-label="Missing handoff details" aria-live="polite" className="notice"><strong>Missing details — advisory only</strong><p>{missingReferralFields(fields).map(k => referralLabels[k]).join("; ") || "Every listed field has an entry; this does not verify accuracy."}</p><p>You can create and send even with missing fields. Unknown values remain “Not recorded”.</p></aside>
        {allReferralFields.map(key => <label key={key}>{referralLabels[key]}<textarea disabled={busy || !draftSessions.current.has(view.id)} value={fields[key] || ""} rows={2} maxLength={8000} onChange={e => editDraft({ ...fields, [key]: e.target.value })} /></label>)}
        <label>Receiving facility<select disabled={busy || !draftSessions.current.has(view.id)} value={destination} onChange={e => editDraft(fields, e.target.value)}><option value="">Select the receiving facility</option>{destination && !facilities.some(f => f.id === destination) && <option value={destination}>Previously selected facility · availability not checked</option>}{facilities.filter(f => f.id !== staff.facilityId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Handoff packet size limit in bytes<input disabled={busy || !draftSessions.current.has(view.id)} type="number" min={1} max={32768} value={capacity} onChange={e => editDraft(fields, destination, e.target.value)} /></label><p className="small">32,768 is the reference BLE buffer limit. The current PN532 tag has only 48 verified bytes; its full capacity and compact encrypted format are pending. Preparing this packet does not mean it fits your NFC tag. A smaller confirmed limit rejects oversized packets without truncating them.</p>
        <button className="button primary" disabled={busy || !destination || !draftSessions.current.has(view.id)} onClick={() => void act(async () => {
          const size = Number(capacity); if (!Number.isInteger(size) || size < 1 || size > 32768) throw Error("Enter a packet limit between 1 and 32768 bytes.");
          const session = draftSessions.current.get(view.id)!; await session.wait(); if (session.error) throw Error(session.error);
          const result = await createCareHandoff(uid, view, destination, fields, size);
          let draftWarning = "";
          try { await session.complete(); } catch { draftWarning = " A saved draft could not be cleared. Reload before starting another handoff; creating again is not a cleanup retry."; }
          setPacket(result.packet); setHandoffId(result.id); setHtml(careHandoffDocument(view, result.fields, result.id, result.actorName, uid, result.recordedAt)); setNotice("Doctor-recorded handoff created. Blank details remain unknown. BLE and NFC transfer have not been confirmed. " + (result.savedLocally ? "Original handoff saved encrypted on this browser for reopening." : "The cloud handoff succeeded, but its offline copy could not be saved. Keep this page open to print or transfer it. Creating again would make a separate handoff.") + draftWarning);
        })}>Create and approve handoff with entered details</button>
      </section>}
      {html && <><iframe sandbox="" title="Handoff summary preview" srcDoc={html} style={{ width: "100%", height: 480 }} /><button className="button secondary" disabled={busy} onClick={() => void act(() => printReferralDocument(html))}>Print handoff summary / Save PDF</button></>}
      {packet && staff?.role === "doctor" && <BleHandoffPanel key={handoffId} packet={packet} />}
    </section>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{busy && <p role="status">Working…</p>}
    {popup && <ReceivedPopup value={popup} close={() => setPopup(undefined)} />}
  </>;
}
