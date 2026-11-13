import { describe, expect, it } from "vitest";
import { ollamaChat } from "./ollama";

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
});
