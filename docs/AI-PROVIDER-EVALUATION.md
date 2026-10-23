# Selected AI foundation — 22 October 2026

**23 October update:** `src/ai/behavior.ts` supplies versioned inference instructions. The user approved a local profile-context amendment and deferred report quotations. The app projects only saved name and dated pregnancy stage from the authenticated mother's own encrypted record; attachments and clinical history are not supplied. This is prompt/context integration, not fine-tuning. See [confirmed decisions](DECISIONS-2026-10-23.md) and the latest [verification](VERIFICATION.md); earlier model-response evidence below does not certify the revised prompt.

Exact identity/stage questions use labelled local profile readback because the small model did not reliably retrieve those facts. The final cached-model offline test passed with two genuine model replies, exact profile answers and explicit safety fallbacks for rejected birth-related output, including after Stop/restart. General conversation quality remains a known limitation; the functional test does not establish unrestricted safe conversation.

The new [AI integration instructions](AI-INTEGRATION-INSTRUCTIONS.md) replace the earlier provider comparison. The selected technologies are Qwen3-0.6B, Firebase AI Logic with Gemini `gemini-3.8-flash`, and Tavily Researcher Free. No OpenAI integration, provider account creation, billing upgrade, cloud file storage or paid fallback is part of this phase.

## Implemented locally

- Separate AI settings and usage views inside the existing MatriSathi companion. Chat and Drug information remain its two main options.
- Optional Qwen3-0.6B ONNX q4f16 WebGPU worker with a pinned repository revision, explicit download confirmation, compatibility/storage checks, cancellation, initialization failure isolation and bounded generation. No model weights are in source control or the initial PWA cache.
- Public model files are cached separately from encrypted private records. Runtime JavaScript/WASM is served from this app, not an external runtime CDN. Network model fetches are blocked outside explicit installation. Installation currently requires a signed-in account to retain Guest's temporary-storage boundary.
- Chat transcript and broad context tags exist only in memory. Clear/new chat removes both; leaving the companion or reloading discards them. Replies are checked before display. Generated token counts are not claimed when unmeasured.
- Conservative English-only safety routing is tested independently of the model. The response templates are developer-reviewed against linked public guidance, **not clinician-approved triage**. Multilingual and clinical validation remain release requirements. Unknown questions and unsupported medical output fall back instead of being treated as verified facts.
- Verified knowledge collection is intentionally empty. The supplied 162-medicine research draft remains unverified and confined to the testing build. It is never included in the companion's prompt.
- Remote modules fail closed even if a frontend flag is changed. Usage parsing accepts actual Gemini metadata; source parsing preserves valid HTTPS citations. A shared-budget transaction contract tests reservations, concurrency, exhaustion and uncertain failure retention. It is not a deployed quota service.

## Remote stages blocked

| Stage | Required before activation | Current behavior |
|---|---|---|
| Gemini | Confirm this project's Spark/no-billing tier and actual model limits; provision App Check; implement authenticated shared request/token enforcement; synthetic-only consent workflow | No AI Logic initialization or Gemini request; budget zero; provider quota unavailable |
| Tavily | User-owned legitimate free account; secret stored only in a protected zero-cost server proxy; verified authentication/abuse protection; durable atomic shared ledger | No key in frontend, no direct Tavily call, no assumed remaining balance |
| Online recognition/transcription | Above gates, preview/explicit upload consent, editable extraction and confirmation, reviewed draft workflow | Mic/image/document AI remains disabled; uploaded reports stay encrypted locally |
| Clinical knowledge | Supplied verified references with provenance and clinical review | Exact missing-reference message; no diagnosis, dose selection or pregnancy-safety verdict |

The dashboard distinguishes the **published** Tavily allocation (1,000 credits/month) from actual balance (unavailable). Gemini input/output/thinking/total usage stays unavailable until official response metadata exists. A browser counter is never presented as an enforceable global provider budget. Unknown failures retain reservations until provider reconciliation; elapsed time alone does not refill an allowance.

## Verified primary documentation

- [Firebase supported models](https://firebase.google.com/docs/ai-logic/models): lists `gemini-3.8-flash` without a billing requirement at this review.
- [Firebase pricing](https://firebase.google.com/docs/ai-logic/pricing) and [quotas](https://firebase.google.com/docs/ai-logic/quotas): project tier and actual limits still require configuration-specific verification.
- [Gemini free-tier data use](https://ai.google.dev/gemini-api/docs/pricing): do not send identifiable health information to the free service.
- [Tavily credits](https://docs.tavily.com/documentation/api-credits): Researcher Free 1,000 credits/month; Basic 1, Advanced 2. Deep Research disabled.
- [Qwen ONNX repository](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX), [original Apache-2.0 model](https://huggingface.co/Qwen/Qwen3-0.6B), [Transformers.js WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu).
- [Maternal warning signs](https://www.cdc.gov/hearher/maternal-warning-signs/index.html), [urgent child concerns](https://www.nhs.uk/baby/health/when-to-get-urgent-medical-help-for-babies-and-children-under-5/), [self-harm support](https://www.nhs.uk/mental-health/feelings-symptoms-behaviours/behaviours/help-for-suicidal-thoughts/).

Model revision: `58ca03a5e7b354b480b1a82b34bde8dc7b854cc0`. ONNX weights: 569,789,750 bytes; estimated complete install 620 MB. Recommend 1.3 GB free for staging/cache overhead. Storage can be evicted by the browser; installation is optional and no cloud token charges apply. Download data charges are separate from provider billing.

See [verification](VERIFICATION.md) for actual device/test evidence and remaining acceptance limits. Do not treat feature implementation as clinical validation or production approval.
