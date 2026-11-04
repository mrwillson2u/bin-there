// Other location pages after DEC-024: a rack (holds places) and a tote (holds parts).
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
// Safety: never point this at the real data. It runs its own server on port 3001
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
const base = "http://127.0.0.1:3001";
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3001", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };
const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const rack = await api("POST", "/locations", { name: "Rack A", type: "rack", parentId: site.id });
const tote = await api("POST", "/locations", { name: "Yellow tote", type: "tote", parentId: rack.id, code: "TOTE01" });
await api("POST", "/items", { name: "Zip ties", locationId: tote.id, qty: 100 });
await api("POST", "/items", { name: "Wire nuts", locationId: tote.id, qty: 30 });
await api("POST", "/items", { name: "Tape", locationId: tote.id });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto(`${base}/locations/${rack.id}`);
await page.getByRole("heading", { name: "Rack A" }).waitFor();
check((await page.getByRole("heading", { name: "Inside" }).count()) === 1 && (await page.getByRole("heading", { name: "Items" }).count()) === 0, "rack: Inside shown, empty Items hidden");
const row = await page.getByRole("link", { name: /Yellow tote/ }).textContent();
check(row.includes("Tote · Tape, Wire nuts +1"), "rack's list row says what's in the tote: " + row);
check((await page.getByRole("region", { name: "Manage Rack A" }).getByRole("link", { name: "Add item here" }).count()) === 1, "rack: 'Add item here' moved to the bottom");
await page.screenshot({ path: `${shots}/p1-rack.png`, fullPage: true });
await page.getByRole("link", { name: /Yellow tote/ }).click();
await page.getByRole("heading", { name: "Yellow tote" }).waitFor();
check((await page.getByRole("heading", { name: "Inside" }).count()) === 0, "tote with parts: no empty Inside section");
check((await page.getByRole("region", { name: "Manage Yellow tote" }).getByText("TOTE01").count()) === 1, "tote's own page shows its sticker at the bottom");
await page.screenshot({ path: `${shots}/p2-tote.png`, fullPage: true });
await browser.close();
server.kill();
