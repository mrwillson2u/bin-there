// The AI look-up queue (DEC-055): parts captured with "look it up with AI after saving" wait
// their turn here and are looked up one at a time in the background, the result stored on the
// part for whenever it's reviewed. The queue lives in the items table (`ai_job`), so it survives
// a restart: anything left "running" by a crash goes back to "queued" on start. A cancel clears
// the part's job at once; a look-up already under way runs on to its end (a model call can't be
// interrupted) and its answer is then thrown away.

import { asc, eq } from "drizzle-orm";
import type { ResearchResult, StoredResearch } from "../../shared/api";
import type { Db } from "../db/client";
import { items } from "../db/schema";

export class AiQueue {
  private working = false;
  private cancelled = new Set<number>();
  private waiters: (() => void)[] = [];

  constructor(
    private db: Db,
    /** The look-up itself, for one part. */
    private run: (itemId: number) => Promise<ResearchResult>,
    /** Called after every change the queue makes, so open screens refresh (DEC-046). */
    private changed: () => void,
    private log: (line: string) => void = () => {},
  ) {}

  /** On start: whatever a crash left "running" is queued again, and the work resumes. */
  resume() {
    const left = this.db.update(items).set({ aiJob: "queued" }).where(eq(items.aiJob, "running")).run();
    if (left.changes > 0) this.log(`${left.changes} look-up(s) left running by the last stop are queued again`);
    void this.kick();
  }

  enqueue(itemId: number) {
    this.cancelled.delete(itemId);
    this.db.update(items).set({ aiJob: "queued", aiJobAt: new Date().toISOString(), aiJobError: null }).where(eq(items.id, itemId)).run();
    this.changed();
    void this.kick();
  }

  cancel(itemId: number) {
    this.cancelled.add(itemId);
    this.db.update(items).set({ aiJob: null, aiJobAt: null, aiJobError: null }).where(eq(items.id, itemId)).run();
    this.changed();
  }

  /** Resolves once nothing is queued or running (for tests). */
  idle(): Promise<void> {
    if (!this.working) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private async kick() {
    if (this.working) return;
    this.working = true;
    try {
      for (;;) {
        const next = this.db.select({ id: items.id }).from(items).where(eq(items.aiJob, "queued")).orderBy(asc(items.aiJobAt), asc(items.id)).get();
        if (!next) break;
        const id = next.id;
        this.db.update(items).set({ aiJob: "running", aiJobAt: new Date().toISOString() }).where(eq(items.id, id)).run();
        this.changed();
        try {
          const result = await this.run(id);
          if (this.cancelled.has(id)) {
            this.cancelled.delete(id);
            continue;
          }
          const stored: StoredResearch = { ...result, at: new Date().toISOString(), mode: "full" };
          this.db.update(items).set({ aiJob: null, aiJobAt: null, aiJobError: null, aiResult: stored }).where(eq(items.id, id)).run();
        } catch (e) {
          if (this.cancelled.has(id)) {
            this.cancelled.delete(id);
            continue;
          }
          const message = (e as Error).message;
          this.log(`look-up of item ${id} failed: ${message}`);
          this.db.update(items).set({ aiJob: "failed", aiJobError: message.slice(0, 300) }).where(eq(items.id, id)).run();
        }
        this.changed();
      }
    } finally {
      this.working = false;
      for (const w of this.waiters) w();
      this.waiters = [];
    }
  }
}
