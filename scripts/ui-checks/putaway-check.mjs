// Put away (DEC-089): the mode's new name, adding something that isn't in the inventory yet
// without leaving it (the find box's "Add ... as new", Save asking where it goes, back with the
// tally), and Inventory's "No place" filter.
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
const box = await api("POST", "/locations", { name: "Grid box 1", type: "gridded_box", parentId: site.id });
const b1 = await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", code: "BIN0001", slot: { x: 0, y: 0 } });
const b2 = await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", code: "BIN0002", slot: { x: 1, y: 0 } });
await api("POST", "/items", { name: "M3 nuts", locationId: b1.id, qty: 50 });
await api("POST", "/items", { name: "Loose thing" });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const toast = (text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 8000 });
const scan = async (code) => {
  await page.keyboard.down("Control"); await page.keyboard.press("b"); await page.keyboard.up("Control");
  await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press("Enter");
};
const items = async () => (await api("GET", "/inventory")).items;

// 1. The mode is called Put away, on the bar and on its screen.
await page.goto(`${base}/`);
await page.getByRole("link", { name: "Put away" }).filter({ visible: true }).click();
await page.getByRole("heading", { name: "Put away" }).waitFor();
check((await page.getByText(/Put-back/).filter({ visible: true }).count()) === 0, "the screen says Put away, never Put-back");
await scan("BIN0001");
await toast("M3 nuts → Bin 0001");
check((await page.locator("[data-tally]").textContent()) === "1 put away", "a logged part is counted: 1 put away");

// 2. Not logged: the find box offers to add it, with what was typed as its name.
await page.getByLabel("Search for the part").fill("widget");
await page.getByRole("button", { name: "Add “widget” as new" }).click();
await page.getByRole("heading", { name: "New item" }).waitFor();
check((await page.getByPlaceholder("Later is fine").inputValue()) === "widget", "New item opens with the typed name filled in");
await page.getByLabel("How many?").fill("5");
await page.screenshot({ path: `${shots}/pa-1-new-item.png` });

// 3. Save with no place set asks where it goes; a scan answers, saves and goes back to Put away.
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByRole("button", { name: "No place yet: save anyway" }).waitFor();
check((await page.locator("[data-scan-note]").filter({ visible: true }).textContent()).includes("Scan the bin it's going in"), "Save asks where it's going: the note says to scan the bin");
check((await items()).every((i) => i.name !== "widget"), "nothing is saved until the place is answered");
await page.screenshot({ path: `${shots}/pa-2-where.png` });
await scan("BIN0002");
await page.getByRole("heading", { name: "Put away" }).waitFor();
await page.getByText(/^In Garage/).waitFor();
check((await page.locator("[data-tally]").textContent()) === "2 put away", "back in Put away, the new item counted: 2 put away");
const widget = (await items()).find((i) => i.name === "widget");
check(widget && widget.totalQty === 5 && widget.places.length === 1 && widget.places[0].locationId === b2.id, "the new item is in the scanned bin with its count of 5");
await page.screenshot({ path: `${shots}/pa-3-back.png` });

// 4. The plain New item button, saved with no place: back in Put away, not counted.
await page.getByRole("button", { name: "Not in the inventory? New item" }).click();
await page.getByRole("heading", { name: "New item" }).waitFor();
await page.getByPlaceholder("Later is fine").fill("gizmo");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByRole("button", { name: "No place yet: save anyway" }).click();
await page.getByRole("heading", { name: "Put away" }).waitFor();
await toast("Saved with no place yet");
check((await page.locator("[data-tally]").textContent()) === "2 put away", "saved with no place: the tally stays at 2");
check((await items()).find((i) => i.name === "gizmo")?.places.length === 0, "the part is saved with no place");

// 5. Cancel on New item goes back to Put away with the tally.
await page.getByRole("button", { name: "Not in the inventory? New item" }).click();
await page.getByRole("button", { name: "Cancel" }).click();
await page.getByRole("heading", { name: "Put away" }).waitFor();
check((await page.locator("[data-tally]").textContent()) === "2 put away", "Cancel comes back to Put away, tally kept");

// 6. Inventory's No place filter lists what has no place.
await page.goto(`${base}/`);
const chip = page.getByRole("group", { name: "Filters" }).getByRole("button", { name: /No place/ });
await chip.waitFor();
check((await chip.textContent()).replace(/\s+/g, "") === "Noplace2", "Inventory has a No place filter with its count: " + (await chip.textContent()));
await chip.click();
await page.getByText("Nothing says where these are").waitFor();
await page.getByText("2 found").waitFor();
const shown = await page.getByRole("main").getByRole("link").allTextContents();
check(shown.some((t) => t.includes("gizmo")) && shown.some((t) => t.includes("Loose thing")) && !shown.some((t) => t.includes("M3 nuts") || t.includes("widget")), "it lists the two parts with no place and nothing else");
await page.screenshot({ path: `${shots}/pa-4-no-place.png` });

// 7. Desktop: the sidebar says Put away.
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await desk.goto(`${base}/`);
await desk.locator("[data-side-menu]").getByRole("link", { name: "Put away" }).waitFor();
check((await desk.locator("[data-side-menu]").getByText("Put-back").count()) === 0, "desktop: the sidebar says Put away");

await browser.close();
server.kill();
