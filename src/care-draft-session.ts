import { clearCareDraft, saveCareDraft, type CareHandoffDraft } from "./care-storage";
type Input = Pick<CareHandoffDraft, "fields" | "destination" | "capacity">;
// Serialize this tab's keystrokes; storage also checks revisions across tabs.
export class CareDraftSession {
  private chain: Promise<void> = Promise.resolve();
  revision: string | null;
  pending = 0;
  error = "";
  latest?: CareHandoffDraft;
  constructor(readonly uid: string, readonly caseId: string, saved?: CareHandoffDraft) {
    this.revision = saved?.revision || null; this.latest = saved?.cleared ? undefined : saved;
  }
  save(input: Input) {
    const value: CareHandoffDraft = { ...input, fields: { ...input.fields }, version: 1, caseId: this.caseId, sourceUid: this.uid, revision: crypto.randomUUID(), updatedAt: new Date().toISOString() };
    this.latest = value; this.pending++;
    const task = this.chain.then(async () => {
      await saveCareDraft(this.uid, value, this.revision);
      this.revision = value.revision; this.error = "";
    }).catch(error => { this.error = error instanceof Error ? error.message : "The referral draft could not be saved."; throw error; }).finally(() => { this.pending--; });
    this.chain = task.catch(() => {});
    return task;
  }
  async wait() { await this.chain; }
  async complete() {
    await this.wait();
    if (this.error) throw Error(this.error);
    const cleared = await clearCareDraft(this.uid, this.caseId, this.revision);
    this.revision = cleared.revision; this.latest = undefined;
  }
}
