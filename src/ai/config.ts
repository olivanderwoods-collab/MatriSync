export const OFFLINE_MODEL = {
  id: "onnx-community/Qwen3-0.6B-ONNX",
  revision: "58ca03a5e7b354b480b1a82b34bde8dc7b854cc0",
  dtype: "q4f16" as const,
  device: "webgpu" as const,
  weightBytes: 569_789_750,
  estimatedInstallBytes: 620_000_000,
  recommendedFreeBytes: 1_300_000_000,
  cache: "matrisync-qwen3-0.6b-v1",
};
export const AI_FLAGS = Object.freeze({
  offlineInstallation: true,
  gemini: false,
  tavily: false,
  onlineMedia: false,
  clinicalGeneration: false,
});
export const GEMINI_MODEL = "gemini-3.8-flash";
export const TAVILY_PLAN = {
  name: "Researcher Free",
  publishedMonthlyCredits: 1000,
  basicCost: 1,
  advancedCost: 2,
};
export const PROVIDER_BLOCKERS = {
  gemini:
    "Unavailable: App Check, project free-tier quotas and shared request controls are not configured.",
  tavily:
    "Unavailable: a protected zero-cost proxy and shared credit ledger are not configured.",
};
