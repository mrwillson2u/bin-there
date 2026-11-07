// A small client for Ollama's chat API (DEC-048). One model, local, on the GPU: nothing leaves
// the house. `format` asks for JSON that fits a schema, so answers parse instead of being
// pattern-matched out of prose.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string; images?: string[] };

export type Chat = (opts: { messages: ChatMessage[]; schema?: object; temperature?: number }) => Promise<string>;

export function ollamaChat(url: string, model: string, fetchImpl: typeof fetch = fetch): Chat {
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
