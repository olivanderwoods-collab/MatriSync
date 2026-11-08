import { createRoot } from "react-dom/client";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { CarePage } from "../src/care-page";
import { fixture, seed } from "./recovery-mocks";
import "../src/styles.css";
function Fixture() {
  const [uid, setUid] = useState(fixture.uid);
  return <MemoryRouter><main><p>ISOLATED UI TEST · Synthetic data · No Firebase calls</p><label>Fixture account<select value={uid} onChange={e => { fixture.uid = e.target.value; setUid(e.target.value); }}><option value="isolated-recovery-doctor">Synthetic Doctor</option><option value="isolated-recovery-other">Other account</option></select></label><CarePage uid={uid} role="professional" /></main></MemoryRouter>;
}
await seed();
createRoot(document.getElementById("root")!).render(<Fixture />);
