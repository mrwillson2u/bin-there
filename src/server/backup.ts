import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { Db } from "./db/client";

// Nightly backup (PRD F8, DEC-008), run by the app itself so it works the same
// in Docker and on a laptop. Layout of BACKUP_DIR:
//   snapshots/2026-11-03_0300/app.db   one consistent copy of the database per run
//   photos/                            every photo ever taken (photos are never edited, so new files are just added)
//   status.json                        the last run's result, shown in the app

export type BackupStatus = {
  at: string;
  ok: boolean;
  snapshot: string | null;
  items: number;
  photos: number;
  error: string | null;
};

export type BackupConfig = { backupDir: string; photoDir: string; keep: number };

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

async function exists(path: string) {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** Copy photos that aren't in the backup yet. Returns how many photos the backup holds. */
async function syncPhotos(from: string, to: string): Promise<number> {
  await mkdir(to, { recursive: true });
  const have = new Set(await readdir(to));
  const files = (await exists(from)) ? await readdir(from) : [];
  for (const f of files) if (!have.has(f)) await copyFile(join(from, f), join(to, f));
  return new Set([...have, ...files]).size;
}

/** Keep the newest `keep` snapshots. */
async function prune(snapshotsDir: string, keep: number) {
  const dirs = (await readdir(snapshotsDir)).sort();
  for (const d of dirs.slice(0, Math.max(0, dirs.length - keep))) await rm(join(snapshotsDir, d), { recursive: true, force: true });
}

export async function runBackup(db: Db, cfg: BackupConfig, now = new Date()): Promise<BackupStatus> {
  const snapshotsDir = join(cfg.backupDir, "snapshots");
  const name = stamp(now);
  const status: BackupStatus = { at: now.toISOString(), ok: false, snapshot: name, items: 0, photos: 0, error: null };
  try {
    await mkdir(join(snapshotsDir, name), { recursive: true });
    const file = join(snapshotsDir, name, "app.db");
    // SQLite's online backup: a consistent copy even while the app is writing.
    await db.$client.backup(file);
    // Prove the copy opens and is intact before calling it good.
    const copy = new Database(file, { readonly: true });
    try {
      const check = copy.pragma("integrity_check", { simple: true });
      if (check !== "ok") throw new Error(`Backup failed its integrity check: ${String(check)}`);
      status.items = (copy.prepare("select count(*) as n from items").get() as { n: number }).n;
    } finally {
      copy.close();
    }
    status.photos = await syncPhotos(cfg.photoDir, join(cfg.backupDir, "photos"));
    await prune(snapshotsDir, cfg.keep);
    status.ok = true;
  } catch (e) {
    status.error = (e as Error).message;
  }
  await mkdir(cfg.backupDir, { recursive: true }).catch(() => {});
  await writeFile(join(cfg.backupDir, "status.json"), JSON.stringify(status, null, 2)).catch(() => {});
  return status;
}

export async function readBackupStatus(cfg: BackupConfig): Promise<BackupStatus | null> {
  try {
    return JSON.parse(await readFile(join(cfg.backupDir, "status.json"), "utf8")) as BackupStatus;
  } catch {
    return null;
  }
}

/** Milliseconds until the next `hour`:00 local time. */
export function msUntilHour(hour: number, now = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Back up every night at `hour`, and right away if the last good backup is over a day old. */
export function scheduleBackups(db: Db, cfg: BackupConfig, hour: number, log = console.log) {
  const run = () =>
    runBackup(db, cfg).then((s) =>
      log(s.ok ? `backup ok: ${s.snapshot} (${s.items} items, ${s.photos} photos)` : `backup FAILED: ${s.error}`),
    );
  const loop = () => setTimeout(() => run().finally(loop), msUntilHour(hour)).unref();
  readBackupStatus(cfg).then((s) => {
    if (!s?.ok || Date.now() - new Date(s.at).getTime() > 24 * 3600_000) void run();
  });
  loop();
}
