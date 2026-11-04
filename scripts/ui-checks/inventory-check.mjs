// Inventory home and Locations screen (DEC-026): list and tiles, filters, pinned on top,
// paging, focused search, and the nav on phone and desktop.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=800x600", "-frames:v", "1", `${shots}/part.jpg`]);
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3001", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const jpg = readFileSync(`${shots}/part.jpg`);
const photo = async (itemId) => {
  const f = new FormData();
  f.append("photo", new Blob([jpg], { type: "image/jpeg" }), "photo.jpg");
  f.append("thumb", new Blob([jpg], { type: "image/jpeg" }), "thumb.jpg");
  await fetch(`${base}/api/items/${itemId}/photos`, { method: "POST", body: f });
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

// ── Seed ──
const cats = await api("GET", "/categories");
const fasteners = cats.find((c) => c.name === "Fasteners") ?? cats[0];
const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const rack = await api("POST", "/locations", { name: "Rack A", type: "rack", parentId: site.id });
const box = await api("POST", "/locations", { name: "Grid box 1", type: "gridded_box", parentId: rack.id });
const b1 = await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", slot: { x: 0, y: 0 } });
const b2 = await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", slot: { x: 1, y: 0 } });
const tote = await api("POST", "/locations", { name: "Yellow tote", type: "tote", parentId: rack.id });
const screws = await api("POST", "/items", { name: "M3 x 10 socket screws", categoryId: fasteners.id, tracking: "exact", locationId: b1.id, qty: 40 });
await photo(screws.id);
const nuts = await api("POST", "/items", { name: "M3 hex nuts", categoryId: fasteners.id, tracking: "exact", locationId: b2.id, qty: 0 });
const tape = await api("POST", "/items", { name: "Electrical tape", locationId: tote.id, tracking: "level", level: "low" });
await photo(tape.id);
const psu = await api("POST", "/items", { name: "12V power supply", kind: "returnable", code: "PSU01", locationId: tote.id });
await api("POST", `/units/${psu.unitList[0].id}/checkout`, { note: "lent to Sam" });
const zip = await api("POST", "/items", { name: "Zip ties", locationId: tote.id, qty: 100 });
await photo(zip.id);
await api("POST", "/items", { locationId: tote.id });
await api("PUT", `/pins/item/${zip.id}`);
await api("PUT", `/pins/location/${box.id}`);
// Enough parts to need a second page.
for (let i = 1; i <= 70; i++) await api("POST", "/items", { name: `Resistor ${String(i).padStart(3, "0")}k`, locationId: tote.id, qty: i });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const rows = () => page.getByRole("main").getByRole("listitem");

// 1. Home is the inventory: A to Z, pinned on top with − / +.
await page.goto(`${base}/`);
await page.getByRole("heading", { name: "Inventory" }).waitFor();
await page.getByText("76 items").waitFor();
const first = await rows().first().textContent();
check(first.includes("Zip ties") && (await rows().first().getByRole("button", { name: "Add one" }).count()) === 1, "pinned Zip ties is first, with its − / +: " + first);
check((await rows().nth(1).textContent()).includes("12V power supply"), "then A to Z (digits first)");
check((await page.getByRole("link", { name: /Zip ties/ }).count()) === 1, "a pinned part isn't repeated below");
const r3 = page.getByRole("link", { name: /^M3 x 10 socket screws/ }).locator("[title]").first();
check(await r3.evaluate((e) => e.scrollWidth <= e.clientWidth), "phone row shows the whole path: " + (await r3.textContent()));
const tapeBin = page.getByRole("link", { name: /^Electrical tape/ }).locator("[title] > span").last();
check(await tapeBin.evaluate((e) => e.scrollWidth <= e.clientWidth), "a needs-details row keeps its bin whole: " + (await tapeBin.textContent()));
const chipsBox = await page.getByRole("group", { name: "Filters" }).boundingBox();
check(chipsBox.height < 50, `filters take one line on a phone (${Math.round(chipsBox.height)} px)`);
check((await page.getByRole("link", { name: "Locations" }).count()) >= 1, "Locations is in the bottom bar");
await page.screenshot({ path: `${shots}/i1-list.png` });

// 2. Tap + on the pinned part.
await rows().first().getByRole("button", { name: "Add one" }).click();
await page.getByRole("status").filter({ hasText: "Added 1" }).waitFor();
check((await rows().first().getByRole("button", { name: /^101\./ }).count()) === 1, "pinned count went to 101 in place");

// 3. Paging: scroll to the end loads the rest.
const before = await rows().count();
await page.mouse.wheel(0, 20000); await page.waitForTimeout(600);
await page.mouse.wheel(0, 20000); await page.waitForTimeout(600);
const after = await rows().count();
check(before === 61 && after === 76, `first page 61 rows (1 pinned + 60), all 76 after scrolling (${before} → ${after})`);
check((await rows().last().textContent()).includes("Unnamed item"), "unnamed part last");
// Back from a part deep in the list returns to the same spot.
const deep = page.getByRole("link", { name: /^Resistor 050k/ });
await deep.scrollIntoViewIfNeeded();
const y0 = await page.evaluate(() => window.scrollY);
await deep.click();
await page.getByRole("heading", { name: "Resistor 050k" }).waitFor();
await page.goBack(); await page.waitForTimeout(800);
const y1 = await page.evaluate(() => window.scrollY);
check(Math.abs(y1 - y0) < 40, `Back returns to the same spot in the list (${Math.round(y0)} → ${Math.round(y1)})`);

// 4. Search narrows the list; the pinned part drops out when it doesn't match.
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByLabel("Search parts").fill("m3");
await page.getByText("2 found").waitFor();
check((await rows().count()) === 2 && (await page.getByRole("link", { name: /Zip ties/ }).count()) === 0, "search 'm3': 2 rows, pinned Zip ties hidden");
check(new URL(page.url()).searchParams.get("q") === "m3", "search is in the URL");
await page.screenshot({ path: `${shots}/i2-search.png` });
await page.getByRole("button", { name: "Clear search" }).click();
await page.getByText("76 items").waitFor();

// 5. Status chips filter, and say what they mean.
const chip = (name) => page.getByRole("group", { name: "Filters" }).getByRole("button", { name });
const stats = await api("GET", "/stats");
check((await chip(/Needs details/).textContent()).endsWith(String(stats.needsDetails)), "needs-details chip shows its count: " + (await chip(/Needs details/).textContent()));
await chip(/Running low/).click();
await page.getByText("2 found").waitFor();
check((await page.getByRole("button", { name: /Copy as a shopping list/ }).count()) === 1, "running low: offers the shopping-list copy");
const lowChip = await chip(/Running low/).boundingBox();
check(lowChip.x >= 0 && lowChip.x + lowChip.width <= 390, `the chip that's on moves to the front, in sight on a phone (x ${Math.round(lowChip.x)})`);
const lowNames = await rows().allTextContents();
check(lowNames.some((t) => t.includes("Electrical tape")) && lowNames.some((t) => t.includes("M3 hex nuts")), "running low: tape (low) and nuts (0)");
await page.screenshot({ path: `${shots}/i3-low.png` });
await chip(/Running low/).click();
await chip(/Checked out/).click();
await page.getByText("1 found").waitFor();
check((await page.getByRole("link", { name: /Where they went/ }).count()) === 1, "checked out: links to who has them");
await chip(/Checked out/).click();

// 6. Category and kind.
await page.getByLabel("Category").selectOption(String(fasteners.id));
await page.getByText("2 found").waitFor();
check(true, "category filter: 2 fasteners");
await page.getByLabel("Category").selectOption("");
await page.getByLabel("Kind").selectOption("returnable");
await page.getByText("1 found").waitFor();
check((await rows().first().textContent()).includes("12V power supply"), "kind filter: the returnable PSU");
await chip("Clear").click();
await page.getByText("76 items").waitFor();

// 7. Sort.
await page.getByLabel("Sort by").selectOption("added");
await page.waitForTimeout(500);
check((await rows().nth(1).textContent()).includes("Resistor 070k"), "newest first: Resistor 070k after the pinned part");
await page.getByLabel("Sort by").selectOption("");

// 8. Tiles, remembered after a reload.
await page.getByRole("button", { name: "Tile view" }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/i4-tiles.png` });
await page.reload();
await page.getByRole("heading", { name: "Inventory" }).waitFor();
await page.waitForTimeout(400);
check((await page.getByRole("button", { name: "Tile view" }).getAttribute("aria-pressed")) === "true", "tile view remembered");
const tile = await rows().first().textContent();
check(tile.includes("Zip ties") && tile.includes("Yellow tote"), "first tile: pinned Zip ties, where it is: " + tile);
const img = await rows().first().locator("img").boundingBox();
check(img && img.width > 150, `tile photo is big (${Math.round(img?.width ?? 0)} px wide)`);
await page.getByRole("button", { name: "List view" }).click();

// 9. Back after saving details lands on the filtered list.
await chip(/Needs details/).click();
await page.getByText(/found/).waitFor();
await page.getByRole("link", { name: /Electrical tape/ }).click();
await page.getByRole("heading", { name: "Electrical tape" }).waitFor();
await page.getByRole("link", { name: /Needs details/ }).click();
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("heading", { name: "Electrical tape" }).waitFor();
await page.goBack(); await page.waitForTimeout(500);
check(new URL(page.url()).search === "?needs=1", "Back after Save: the needs-details list (" + new URL(page.url()).search + ")");
check((await page.getByRole("link", { name: /Electrical tape/ }).count()) === 0, "and the saved part has left it");

// 10. Locations: the old home, with pinned places on top.
await page.getByRole("link", { name: "Locations" }).click();
await page.getByRole("heading", { name: "Garage", exact: true }).waitFor();
check((await page.getByRole("link", { name: /^Rack A/ }).count()) === 1, "Locations lists the garage's places");
check((await page.getByRole("link", { name: /^Grid box 1/ }).count()) === 1 && (await page.getByText("Pinned", { exact: true }).count()) === 1, "pinned box on top of Locations");
await page.screenshot({ path: `${shots}/i5-locations.png` });
await page.getByRole("link", { name: /^Rack A/ }).click();
await page.getByRole("heading", { name: "Rack A" }).waitFor();
check((await page.getByRole("link", { name: "Locations" }).getAttribute("aria-current")) === "page", "Locations stays lit inside a place");

// 11. /low still works.
await page.goto(`${base}/low`);
await page.getByText("2 found").waitFor();
check(new URL(page.url()).search === "?low=1", "/low opens Inventory filtered to running low");

// 12. Desktop: sidebar has Search; columns; focused search.
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await desk.goto(`${base}/`);
await desk.getByRole("heading", { name: "Inventory" }).waitFor();
await desk.waitForTimeout(400);
const side = await desk.locator("nav").filter({ hasText: "Bin There" }).textContent();
check(side.includes("Inventory") && side.includes("Locations") && side.includes("Search"), "sidebar: Inventory, Locations, Search: " + side);
check(await desk.getByText("Category", { exact: true }).isVisible(), "list has a Category column on desktop");
await desk.screenshot({ path: `${shots}/i6-desk-list.png` });
await desk.getByRole("button", { name: "Tile view" }).click();
await desk.waitForTimeout(300);
await desk.screenshot({ path: `${shots}/i7-desk-tiles.png` });
await desk.getByRole("link", { name: "Search" }).click();
await desk.getByText(/Type a name/).waitFor();
check((await desk.getByRole("main").getByRole("listitem").count()) === 0, "focused search: nothing listed before you type");
await desk.getByLabel("Search").fill("tape");
await desk.getByRole("link", { name: /Electrical tape/ }).waitFor();
check((await desk.getByRole("main").getByRole("listitem").count()) === 1, "focused search: only the hit");
await desk.screenshot({ path: `${shots}/i8-desk-search.png` });

await browser.close();
server.kill();
