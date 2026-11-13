import { describe, expect, it } from "vitest";
import { ollamaChat } from "./ollama";

/** Which models get told not to think, and when (DEC-053 for Qwen, DEC-061 for a fast glance). */
describe("ollamaChat", () => {
  const bodies: Record<string, unknown>[] = [];
  const fakeFetch = (async (_u: URL | string | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ message: { content: "ok" } }));
  }) as typeof fetch;
  const ask = (model: string, fast?: boolean) => ollamaChat("http://ollama:11434/", model, fakeFetch)({ messages: [{ role: "user", content: "hi" }], ...(fast ? { fast } : {}) });

  it("tells Qwen 3 not to think always, Gemma 4 only for a fast glance, and other models never", async () => {
    await ask("qwen3-vl:4b");
    await ask("gemma4:e4b");
    await ask("gemma4:e4b", true);
    await ask("gemma3:4b", true);
    expect(bodies.map((b) => b.think)).toEqual([false, undefined, false, undefined]);
    expect(bodies.every((b) => b.model && b.stream === false)).toBe(true);
  });
});
