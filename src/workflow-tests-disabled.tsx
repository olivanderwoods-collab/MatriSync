import type { ReactNode } from "react";
export const workflowTestsEnabled = false;
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
