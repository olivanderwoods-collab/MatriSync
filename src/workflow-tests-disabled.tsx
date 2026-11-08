import type { ReactNode } from "react";
export const workflowTestsEnabled = false;
export function ProfileLinkPreview(_props: { role: string }) {
  void _props;
  return (
    <section className="panel">
      <h2>Load profile</h2>
      <p>
        Encrypted cross-account sharing is not connected yet. Local profiles
        remain available on this device.
      </p>
    </section>
  );
}
export function TestAssignments(_props: { accepted?: boolean }) {
  void _props;
  return null;
}
export function WorkflowTestProvider({ children }: { children: ReactNode }) {
  return children;
}
export function TestLink(_props: { role: string }) {
  void _props;
  return null;
}
export function WorkflowTests(_props: { role: string; path: string }) {
  void _props;
  return null;
}
