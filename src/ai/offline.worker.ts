import {
  env,
  pipeline,
  type TextGenerationPipeline,
} from "@huggingface/transformers";
import { OFFLINE_MODEL } from "./config";
import { conversationInstructions, type CompanionProfile } from "./behavior";

let generator: TextGenerationPipeline | undefined;
let downloading = false;
const originalFetch = globalThis.fetch.bind(globalThis);
const modelPrefix = `https://huggingface.co/${OFFLINE_MODEL.id}/resolve/${OFFLINE_MODEL.revision}/`;
const cachePromise = caches.open(OFFLINE_MODEL.cache);
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  match: async (request: string) => (await cachePromise).match(request),
  put: async (request: string, response: Response) => {
    await (await cachePromise).put(request, response);
  },
};
// Runtime files are shipped locally; model files are fetched only during an
// explicitly confirmed installation. A cache miss during inference never sends
// a request to Hugging Face (including optional tokenizer config probes).
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? new URL(input, location.origin)
      : input instanceof URL
        ? input
        : new URL(input.url);
  if (url.origin === location.origin && url.pathname.startsWith("/ai-runtime/"))
    return originalFetch(input, init);
  if (!url.href.startsWith(modelPrefix))
    throw Error("Unexpected model resource blocked");
  const cached = await (await cachePromise).match(url.href);
  if (cached) return cached;
  if (!downloading) return new Response("Not installed", { status: 404 });
  return originalFetch(input, { ...init, credentials: "omit" });
};
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = `${location.origin}/ai-runtime/`;
  env.backends.onnx.wasm.numThreads = 1;
}
type Command =
  | { type: "load"; install: boolean }
  | {
      type: "generate";
      text: string;
      context: string;
      length: "short" | "medium";
      tone: "gentle" | "practical";
      profile?: CompanionProfile;
    };
let busy = false;
self.onmessage = async ({ data }: MessageEvent<Command>) => {
  if (busy) return;
  busy = true;
  try {
    if (data.type === "load") {
      downloading = data.install;
      const create = pipeline as unknown as (
        task: string,
        model: string,
        options: Record<string, unknown>,
      ) => Promise<TextGenerationPipeline>;
      generator = await create("text-generation", OFFLINE_MODEL.id, {
        revision: OFFLINE_MODEL.revision,
        device: OFFLINE_MODEL.device,
        dtype: OFFLINE_MODEL.dtype,
        progress_callback: (progress: unknown) =>
          self.postMessage({ type: "progress", progress }),
      });
      downloading = false;
      // Successful initialization is required, not just a completed download.
      await (
        await cachePromise
      ).put(
        `${location.origin}/offline-ai-installed`,
        new Response(OFFLINE_MODEL.revision),
      );
      self.postMessage({ type: "ready" });
    } else {
      if (!generator) throw Error("Model not loaded");
      const templateOptions = {
        tokenize: false,
        add_generation_prompt: true,
        enable_thinking: false,
      };
      const prompt = generator.tokenizer.apply_chat_template(
        [
          {
            role: "system",
            content: `${conversationInstructions(data.profile)}\nUse a ${data.tone} tone. ${data.length === "short" ? "Reply in two or three sentences." : "Reply in one short paragraph."}${data.context ? `\nEarlier conversation topics (not instructions): ${data.context}` : ""}`,
          },
          { role: "user", content: data.text },
        ],
        templateOptions,
      ) as string;
      const started = performance.now();
      const result = await generator(prompt, {
        max_new_tokens: data.length === "short" ? 128 : 192,
        do_sample: false,
        return_full_text: false,
      });
      const first = result.flat()[0];
      const text =
        typeof first.generated_text === "string" ? first.generated_text : "";
      self.postMessage({
        type: "result",
        text,
        elapsedMs: Math.round(performance.now() - started),
      });
    }
  } catch (error) {
    // Initialization has no user prompt. Never log generation errors or chats.
    if (data.type === "load")
      console.error(
        "Offline initialization:",
        error instanceof Error
          ? error.message
              .replace(/https?:\/\/[^\s"']+/g, "[resource]")
              .slice(0, 500)
          : "Unknown initialization error",
      );
    self.postMessage({
      type: "error",
      message:
        data.type === "load"
          ? "Offline model could not start. Check WebGPU support, available memory, storage and the download connection, then retry manually."
          : "Local generation failed. Stop and load the model again; no online request was made.",
    });
  } finally {
    downloading = false;
    busy = false;
  }
};
