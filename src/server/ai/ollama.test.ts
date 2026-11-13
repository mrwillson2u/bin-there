import { describe, expect, it } from "vitest";
import { ollamaChat, ollamaWarm } from "./ollama";

/** Which models get told not to think (DEC-053), and the keep-alive on every call (DEC-061). */
describe("ollamaChat", () => {
  const bodies: Record<string, unknown>[] = [];
  const fakeFetch = (async (_u: URL | string | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ message: { content: "ok" } }));
  }) as typeof fetch;
  const ask = (model: string) => ollamaChat("http://ollama:11434/", model, fakeFetch)({ messages: [{ role: "user", content: "hi" }] });

  it("tells Qwen 3 not to think and other models nothing, and asks for the model to stay loaded", async () => {
    await ask("qwen3-vl:4b");
    await ask("gemma4:e4b");
    await ask("gemma3:4b");
    expect(bodies.map((b) => b.think)).toEqual([false, undefined, undefined]);
    expect(bodies.every((b) => b.model && b.stream === false && b.keep_alive === -1)).toBe(true);
  });

  it("asks for the wide window and answer allowance (DEC-066), warms the model with the same window, and logs what a call took", async () => {
    expect(bodies[0]!.options).toEqual({ temperature: 0, num_ctx: 16_384, num_predict: 3000 });
    const lines: string[] = [];
    const cut = (async () => new Response(JSON.stringify({ message: { content: "{", thinking: "hmm" }, prompt_eval_count: 9000, eval_count: 3000, done_reason: "length" }))) as unknown as typeof fetch;
    await ollamaChat("http://ollama:11434", "gemma4:e4b", cut, (l) => lines.push(l))({ messages: [{ role: "user", content: "hi" }] });
    expect(lines).toEqual(["model: prompt 9000 tokens, answer 3000 tokens (thinking 3 chars), stopped at the length limit"]);
    let warmBody: Record<string, unknown> = {};
    const warm = (async (_u: URL | string | Request, init?: RequestInit) => {
      warmBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response("{}");
    }) as typeof fetch;
    expect(await ollamaWarm("http://ollama:11434", "gemma4:e4b", warm, 1, 0)).toBe(true);
    expect(warmBody).toEqual({ model: "gemma4:e4b", keep_alive: -1, options: { num_ctx: 16_384 } });
  });
});
