import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb } from "../db/client";
import { items, locations } from "../db/schema";
import { createItem } from "../items";
import { AiQueue } from "./queue";

// The AI look-up queue (DEC-055): one at a time in the background, the answer stored on the
// part, a cancel honoured, a crash's leftovers resumed.

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const answer = (identified: string) => ({ identified, markings: [], queries: [], sources: [], suggestions: [{ field: "name", label: "Name", value: identified, source: "photo", confidence: "medium" as const }], notes: [] });

describe("AiQueue", () => {
  it("looks parts up one at a time, stores the answer, and honours a cancel", async () => {
    const db = openDb(":memory:");
    const site = db.insert(locations).values({ name: "Garage", type: "site" }).returning().get();
    const a = createItem(db, { name: "A", locationId: site.id });
    const b = createItem(db, { name: "B", locationId: site.id });
    const c = createItem(db, { name: "C", locationId: site.id });
    const gates = new Map<number, ReturnType<typeof deferred<void>>>();
    const started: number[] = [];
    let changes = 0;
    const queue = new AiQueue(
      db,
      async (id) => {
        started.push(id);
        const gate = deferred<void>();
        gates.set(id, gate);
        await gate.promise;
        return answer(`part ${id}`);
      },
      () => changes++,
    );
    const job = (id: number) => db.select({ aiJob: items.aiJob, aiResult: items.aiResult }).from(items).where(eq(items.id, id)).get()!;
    queue.enqueue(a.id);
    queue.enqueue(b.id);
    queue.enqueue(c.id);
    await new Promise((r) => setTimeout(r, 5));
    // A is running, B and C wait their turn.
    expect(started).toEqual([a.id]);
    expect([job(a.id).aiJob, job(b.id).aiJob, job(c.id).aiJob]).toEqual(["running", "queued", "queued"]);
    // B is cancelled while queued: cleared at once, never started.
    queue.cancel(b.id);
    expect(job(b.id).aiJob).toBeNull();
    gates.get(a.id)!.resolve();
    await new Promise((r) => setTimeout(r, 5));
    expect(job(a.id).aiJob).toBeNull();
    expect(job(a.id).aiResult?.identified).toBe("part " + a.id);
    expect(job(a.id).aiResult?.mode).toBe("full");
    // C started after A; cancelled while running: its answer, when it comes, is thrown away.
    expect(started).toEqual([a.id, c.id]);
    queue.cancel(c.id);
    gates.get(c.id)!.resolve();
    await queue.idle();
    expect(job(c.id).aiJob).toBeNull();
    expect(job(c.id).aiResult).toBeNull();
    expect(changes).toBeGreaterThanOrEqual(6);
  });

  it("marks a failed look-up, and queues again what a crash left running", async () => {
    const db = openDb(":memory:");
    const site = db.insert(locations).values({ name: "Garage", type: "site" }).returning().get();
    const a = createItem(db, { name: "A", locationId: site.id });
    const b = createItem(db, { name: "B", locationId: site.id });
    db.update(items).set({ aiJob: "running", aiJobAt: "2026-11-12T00:00:00.000Z" }).where(eq(items.id, b.id)).run();
    const ran: number[] = [];
    const queue = new AiQueue(
      db,
      async (id) => {
        ran.push(id);
        if (id === a.id) throw new Error("the model didn't answer");
        return answer("B");
      },
      () => {},
    );
    queue.resume();
    await queue.idle();
    expect(ran).toEqual([b.id]);
    queue.enqueue(a.id);
    await queue.idle();
    const rowA = db.select({ aiJob: items.aiJob, aiJobError: items.aiJobError }).from(items).where(eq(items.id, a.id)).get()!;
    expect(rowA).toEqual({ aiJob: "failed", aiJobError: "the model didn't answer" });
    const rowB = db.select({ aiJob: items.aiJob, aiResult: items.aiResult }).from(items).where(eq(items.id, b.id)).get()!;
    expect(rowB.aiJob).toBeNull();
    expect(rowB.aiResult?.identified).toBe("B");
  });
});
