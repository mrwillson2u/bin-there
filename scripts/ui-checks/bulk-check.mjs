// Bulk editing (DEC-057): Select on Inventory turns rows and tiles into checkboxes; the bar at
// the bottom sets the category, moves everything the parts have to one place, sets how they're
// counted, or deletes them; Search has the same. Each part gets its own activity entry.
// usage: node scripts/ui-checks/bulk-check.mjs <app dir> <empty data dir> <screenshots dir>
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
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
const { mkdirSync } = await import("node:fs");
const [, , app, dataDir, shots] = process.argv;
mkdirSync(shots, { recursive: true });
const base = "http://127.0.0.1:3011";
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3011", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };
const get = (id) => api("GET", `/items/${id}`);
/** The toast with these words (there are other status lines, like the scan strip). */
const toast = async (words) => { const t = page.locator(".toast-in", { hasText: words }); await t.waitFor({ timeout: 10000 }); return t.textContent(); };

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const toteA = await api("POST", "/locations", { name: "Tote A", type: "tote", parentId: site.id });
const toteB = await api("POST", "/locations", { name: "Tote B", type: "tote", parentId: site.id });
const screws = await api("POST", "/items", { name: "M3 screws", locationId: toteA.id, qty: 40 });
const nuts = await api("POST", "/items", { name: "M3 nuts", locationId: toteA.id, qty: 25 });
await api("POST", "/stock/recount", { itemId: nuts.id, locationId: toteB.id, qty: 5 });
const washers = await api("POST", "/items", { name: "M3 washers", locationId: toteB.id, qty: 100 });
const loose = await api("POST", "/items", { name: "Loose part" });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

// 1. Inventory, list view: Select turns rows into checkboxes.
await page.goto(`${base}/`);
await page.getByRole("heading", { name: "Inventory" }).waitFor();
check((await page.getByRole("checkbox").count()) === 0, "no checkboxes before Select");
await page.getByRole("button", { name: "Select" }).click();
await page.getByRole("region", { name: "Selected parts" }).waitFor();
check((await page.getByRole("checkbox").count()) === 4, "Select: every row is a checkbox");
check((await page.getByRole("button", { name: "Category" }).isDisabled()) === true, "with nothing checked the actions are off");
await page.getByRole("checkbox", { name: "M3 screws" }).click();
await page.getByRole("checkbox", { name: "M3 nuts" }).click();
check((await page.getByText("2 selected").count()) === 1, "two checked: the bar says 2 selected");
check((await page.getByRole("checkbox", { name: "M3 nuts" }).getAttribute("aria-checked")) === "true", "a checked row says so");

// 2. Category: the type-to-find picker, then Set category.
await page.getByRole("button", { name: "Category" }).click();
const cat = page.getByRole("combobox", { name: "Category for the selected parts" });
await cat.click();
await cat.fill("fast");
await cat.press("Enter");
await page.screenshot({ path: `${shots}/bulk-1-category.png` });
await page.getByRole("button", { name: "Set category" }).click();
check((await toast("Set 2 parts")).includes("Set 2 parts to Fasteners"), "the toast says what happened");
check((await get(screws.id)).categoryName === "Fasteners" && (await get(nuts.id)).categoryName === "Fasteners", "both parts are Fasteners now");
await page.getByRole("region", { name: "Selected parts" }).waitFor({ state: "detached" });
check((await page.getByRole("checkbox").count()) === 0, "after an action, selecting is over");

// 3. Move: All shown, then browse to Tote B. Everything each part has goes there.
await page.getByRole("button", { name: "Select" }).click();
await page.getByRole("button", { name: "All 4 shown" }).click();
check((await page.getByText("4 selected").count()) === 1, "All shown checks every part");
await page.getByRole("button", { name: "Move" }).click();
await page.getByRole("button", { name: "Pick from list" }).click();
await page.getByRole("button", { name: "Choose Tote B" }).click();
check((await toast("Moved 4 parts")).includes("Moved 4 parts to Tote B"), "the toast says where they went");
const nutsAfter = await get(nuts.id);
check(nutsAfter.places.map((p) => [p.path.at(-1).name, p.qty, p.isHome]).join(";") === "Tote B,30,true", "a part counted in two totes is all in Tote B with 30, its home there: " + JSON.stringify(nutsAfter.places.map((p) => [p.path.at(-1).name, p.qty])));
check((await get(loose.id)).places.map((p) => p.path.at(-1).name).join() === "Tote B", "a part with no place is put there");
check((await get(washers.id)).history.filter((e) => e.type === "move").length === 0, "a part already there gets no entry");
check(nutsAfter.history.find((e) => e.type === "move")?.canUndo === true, "the move is one undoable entry on the part");

// 4. Counting, on one part; then Delete with its confirmation.
await page.getByRole("button", { name: "Select" }).click();
await page.getByRole("checkbox", { name: "M3 washers" }).click();
await page.getByRole("button", { name: "Counting" }).click();
await page.getByRole("button", { name: "Plenty / low / out" }).click();
await toast("now counted by plenty");
check((await get(washers.id)).tracking === "level" && (await get(washers.id)).places[0].level === "plenty", "counting set to levels; the count became Plenty");
await page.getByRole("button", { name: "Select" }).click();
await page.getByRole("checkbox", { name: "Loose part" }).click();
await page.getByRole("button", { name: "Delete", exact: true }).click();
await page.getByText("Delete 1 part?").waitFor();
await page.screenshot({ path: `${shots}/bulk-2-delete.png` });
await page.getByRole("button", { name: "Delete 1 part" }).click();
await toast("Deleted 1 part");
check((await fetch(`${base}/api/items/${loose.id}`)).status === 404, "deleted");
check((await page.getByRole("checkbox").count()) === 0 && (await page.getByText("3 items").count()) === 1, "the list shows the three left, not selecting");

// 5. Tiles: the checkbox sits on the photo corner; Done stops selecting.
await page.getByRole("button", { name: "Tile view" }).click();
await page.getByRole("button", { name: "Select" }).click();
await page.getByRole("checkbox", { name: "M3 screws" }).click();
check((await page.getByText("1 selected").count()) === 1, "a tile can be checked");
check((await page.getByRole("button", { name: /^Pin / }).count()) === 0, "no pin buttons while selecting");
await page.screenshot({ path: `${shots}/bulk-3-tiles.png` });
await page.getByRole("button", { name: "Done" }).click();
check((await page.getByRole("checkbox").count()) === 0 && (await page.getByRole("button", { name: /^Pin / }).count()) === 3, "Done: tiles are tiles again");
await page.getByRole("button", { name: "List view" }).click();

// 6. Search has the same.
await page.goto(`${base}/search?q=m3`);
await page.getByRole("checkbox", { name: "M3 nuts" }).waitFor({ state: "detached" });
await page.getByRole("button", { name: "Select" }).click();
await page.getByRole("checkbox", { name: "M3 nuts" }).click();
await page.getByRole("button", { name: "Category" }).click();
const cat2 = page.getByRole("combobox", { name: "Category for the selected parts" });
await cat2.click();
await cat2.fill("supp");
await cat2.press("Enter");
await page.getByRole("button", { name: "Set category" }).click();
await toast("Set 1 part to Supplies");
check((await get(nuts.id)).categoryName === "Supplies", "from Search: the category is set");

// 7. Phone: the bar covers the bottom nav, actions as icons with words.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/`);
await page.getByRole("heading", { name: "Inventory" }).waitFor();
await page.getByRole("button", { name: "Select" }).click();
await page.getByRole("checkbox", { name: "M3 screws" }).click();
await page.getByRole("checkbox", { name: "M3 nuts" }).click();
const bar = await page.getByRole("region", { name: "Selected parts" }).boundingBox();
check(bar && bar.x >= 0 && bar.x + bar.width <= 390 && bar.y + bar.height <= 844 + 1, `the bar fits the phone: ${JSON.stringify(bar)}`);
const nav = await page.getByRole("link", { name: "Locations" }).boundingBox();
const covered = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest("[data-bulk-bar]"), [nav.x + nav.width / 2, nav.y + nav.height / 2]);
check(covered, "the bar sits over the bottom nav");
await page.screenshot({ path: `${shots}/bulk-4-phone.png` });
await page.getByRole("button", { name: "Move" }).click();
await page.screenshot({ path: `${shots}/bulk-5-phone-move.png` });
const panel = await page.getByRole("button", { name: "Pick from list" }).boundingBox();
check(panel && panel.x + panel.width <= 390, "the move panel fits the phone");

await browser.close();
server.kill();
