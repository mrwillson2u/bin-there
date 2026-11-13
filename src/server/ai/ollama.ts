// A small client for Ollama's chat API (DEC-048). One model, local, on the GPU: nothing leaves
// the house. `format` asks for JSON that fits a schema, so answers parse instead of being
// pattern-matched out of prose.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

/** `fast` (DEC-061): no thinking first, for a glance at capture; a thinking model answers in a third of the time. */
export type Chat = (opts: { messages: ChatMessage[]; schema?: object; temperature?: number; fast?: boolean }) => Promise<string>;

export function ollamaChat(url: string, model: string, fetchImpl: typeof fetch = fetch): Chat {
  return async ({ messages, schema, temperature = 0, fast = false }) => {
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(schema ? { format: schema } : {}),
        // Qwen 3 models think out loud for a minute before answering; the answer is what's wanted.
        // Gemma 4 thinks too, usefully for the full look-up, but a glance (DEC-061) can't wait for it.
        // Only models that can think take the flag: Ollama refuses it for the others.
        ...(/^qwen3/i.test(model) || (fast && /^gemma4/i.test(model)) ? { think: false } : {}),
        options: { temperature, num_ctx: 8192, num_predict: 1500 },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw new Error(`The model didn't answer (${res.status} from Ollama)`);
    const data = (await res.json()) as { message?: { content?: string } };
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
 * Load the model now, so the first glance of the day doesn't wait for it (DEC-061): Ollama
 * loads on demand, and a cold load of a 6 GB model is most of a minute. The production compose
 * file tells Ollama to keep it loaded; at boot the model server may still be waiting for the
 * card, so this tries a few times over a few minutes and then gives up quietly.
 */
export async function ollamaWarm(url: string, model: string, fetchImpl: typeof fetch = fetch, tries = 4, waitMs = 60_000): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchImpl(`${url.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
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
