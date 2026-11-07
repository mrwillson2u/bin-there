// Live updates (DEC-046): two devices (two browser contexts) on the same part; a count changed
// on one shows on the other without a reload, the Inventory list too, and the writer's own
// screen is not refetched twice. A tab coming back into view refetches what it shows.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
// Safety: never point this at the real data. It runs its own server on port 3011
// against DATA_DIR, which must be a new, empty folder outside the app's ./data.
{
  const { resolve } = await import("node:path");
  const { existsSync, readdirSync } = await import("node:fs");
  const [, , appDir, data] = process.argv;
  if (!appDir || !data || !process.argv[4]) throw new Error("usage: node <script> <app dir> <empty data dir> <screenshots dir>");
  if (resolve(data).startsWith(resolve(appDir, "data"))) throw new Error("Refusing to use the app's own data folder");
  if (existsSync(data) && readdirSync(data).length > 0) throw new Error(`${data} isn't empty; use a new folder`);
}

const require = createRequire(process.argv[2] + "/package.json");
const { chromium } = require("playwright");
const [, , app, dataDir, shots] = process.argv;
const base = "http://127.0.0.1:3011";
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3011", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const tote = await api("POST", "/locations", { name: "Tote A", type: "tote", parentId: site.id });
const zip = await api("POST", "/items", { name: "Zip ties", locationId: tote.id, qty: 5 });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
// Two devices: the phone and the desktop, each its own context (own cookies, own stream).
const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const desk = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
for (const p of [phone, desk]) p.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const count = (page) => page.getByRole("button", { name: /Tap to enter a count/ }).first();
const countOf = async (page) => (await count(page).getAttribute("aria-label")).split(".")[0];
const fetches = (page, path) => page.evaluate((p) => performance.getEntriesByType("resource").filter((e) => e.name.includes(p)).length, path);

await phone.goto(`${base}/items/${zip.id}`);
await desk.goto(`${base}/items/${zip.id}`);
await count(phone).waitFor(); await count(desk).waitFor();
check((await countOf(phone)) === "5" && (await countOf(desk)) === "5", "both devices show 5");
await desk.waitForTimeout(500);
const before = await fetches(desk, `/api/items/${zip.id}`);

// The phone adds one. The desktop sees 6 without anyone touching it.
await phone.getByRole("button", { name: "Add one" }).click();
await desk.getByRole("button", { name: /^6\./ }).waitFor({ timeout: 5000 });
check((await countOf(desk)) === "6", "desktop: shows 6 after the phone added one, with no reload");
check((await countOf(phone)) === "6", "phone: shows 6 too");
await phone.waitForTimeout(800);
check((await fetches(phone, `/api/items/${zip.id}`)) - 1 <= 2, "phone: its own change didn't make it refetch twice");

// A write from somewhere else entirely (a scanner station, say) reaches both.
await api("POST", "/stock/adjust", { itemId: zip.id, locationId: tote.id, delta: -2 });
await desk.getByRole("button", { name: /^4\./ }).waitFor({ timeout: 5000 });
await phone.getByRole("button", { name: /^4\./ }).waitFor({ timeout: 5000 });
check(true, "both: a change made by neither device shows on both");
check((await fetches(desk, `/api/items/${zip.id}`)) > before, "desktop: the count came from a refetch, not a guess");

// The Inventory list on the desktop updates when the phone changes a part.
await desk.goto(`${base}/`);
const row = desk.getByRole("link", { name: /Zip ties/ }).first();
await row.waitFor();
check((await row.textContent()).includes("4"), "desktop Inventory: Zip ties shows 4: " + (await row.textContent()).trim().slice(0, 60));
await phone.getByRole("button", { name: "Use one" }).click();
await desk.waitForFunction(() => /\b3\b/.test(document.querySelector('a[href*="/items/"]')?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
check((await row.textContent()).includes("3"), "desktop Inventory: shows 3 after the phone used one: " + (await row.textContent()).trim().slice(0, 60));

// A tab coming back into view refetches: the stream is cut, a change happens, the tab is shown again.
await desk.goto(`${base}/items/${zip.id}`);
await desk.getByRole("button", { name: /^3\./ }).waitFor();
await desk.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); });
await api("POST", "/stock/recount", { itemId: zip.id, locationId: tote.id, qty: 9 });
await desk.getByRole("button", { name: /^9\./ }).waitFor({ timeout: 5000 });
check(true, "desktop: a hidden tab still hears the stream (9)");
const beforeBack = await fetches(desk, `/api/items/${zip.id}`);
await desk.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); });
await desk.waitForTimeout(500);
check((await fetches(desk, `/api/items/${zip.id}`)) > beforeBack, "desktop: coming back into view refetched the part");

await phone.screenshot({ path: `${shots}/live-phone.png` });
await desk.screenshot({ path: `${shots}/live-desk.png` });
await browser.close();
server.kill();
