// A small client for Ollama's chat API (DEC-048). One model, local, on the GPU: nothing leaves
// the house. `format` asks for JSON that fits a schema, so answers parse instead of being
// pattern-matched out of prose.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

export type Chat = (opts: { messages: ChatMessage[]; schema?: object; temperature?: number }) => Promise<string>;

/**
 * The model's window and answer allowance (DEC-066). Three shop pages of numbers came to 8,100
 * tokens, the whole of the old 8,192 window, and the answer came back empty or rambling; and
 * Gemma 4's hidden thinking took 860 of the old 1,500-token allowance. Doubling the window cost
 * no memory on the card (5.6 GB either way, measured 2026-11-13).
 */
export const MODEL_OPTIONS = { num_ctx: 16_384, num_predict: 3000 };

export function ollamaChat(url: string, model: string, fetchImpl: typeof fetch = fetch, log?: (line: string) => void): Chat {
  return async ({ messages, schema, temperature = 0 }) => {
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(schema ? { format: schema } : {}),
        // Qwen 3 models think out loud for a minute before answering; the answer is what's wanted.
        ...(/^qwen3/i.test(model) ? { think: false } : {}),
        // Keep the model loaded (DEC-061): Ollama otherwise drops it after five idle minutes, and
        // a cold load is most of a minute on every first look-up after a quiet spell. A model
        // that needs the room still gets it (Ollama unloads this one and reloads it next call).
        keep_alive: -1,
        options: { temperature, ...MODEL_OPTIONS },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`The model didn't answer (${res.status} from Ollama)`);
    const data = (await res.json()) as { message?: { content?: string; thinking?: string }; prompt_eval_count?: number; eval_count?: number; done_reason?: string };
    // What it took, so a cut-short answer explains itself in the log.
    log?.(
      `model: prompt ${data.prompt_eval_count ?? "?"} tokens, answer ${data.eval_count ?? "?"} tokens (thinking ${data.message?.thinking?.length ?? 0} chars)${data.done_reason === "length" ? ", stopped at the length limit" : ""}`,
    );
    return data.message?.content ?? "";
  };
}

/** Is the model there? Pulls nothing; just lists what the server has. */
export async function ollamaHasModel(url: string, model: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { models?: { name: string }[] };
    const want = model.includes(":") ? model : `${model}:latest`;
    return (data.models ?? []).some((m) => m.name === want || m.name === model);
  } catch {
    return false;
  }
}

/**
 * Load the model now, so the first look-up of the day doesn't wait for it (DEC-061): Ollama
 * loads on demand, and a cold load of a 6 GB model is most of a minute. Loaded with
 * `keep_alive: -1`, as every call is, so it stays; at boot the model server may still be
 * waiting for the card, so this tries a few times over a few minutes and then gives up quietly.
 */
export async function ollamaWarm(url: string, model: string, fetchImpl: typeof fetch = fetch, tries = 4, waitMs = 60_000): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchImpl(`${url.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Loaded with the window every call asks for, or the first look-up loads it all over again.
        body: JSON.stringify({ model, keep_alive: -1, options: { num_ctx: MODEL_OPTIONS.num_ctx } }),
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, waitMs));
  }
  return false;
}
