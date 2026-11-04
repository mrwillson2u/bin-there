// Other location pages after DEC-024: a rack (holds places) and a tote (holds parts).
// DEC-027: every place in one list with a type filter, and moving a place without a sticker.
// DEC-033: positions in a rack, set all at once or one by one, shown in lists and paths.
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

// All places, whatever they're inside, filtered by type.
const rackB = await api("POST", "/locations", { name: "Rack B", type: "rack", parentId: site.id });
const box = await api("POST", "/locations", { name: "Grid box 1", type: "gridded_box", parentId: rack.id });
const bin1 = await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", slot: { x: 0, y: 0 } });
await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "2x1", slot: { x: 1, y: 0 } });
await api("POST", "/items", { name: "M3 nuts", locationId: bin1.id, qty: 10 });
await page.goto(`${base}/locations`);
await page.getByRole("button", { name: "All places" }).click();
await page.getByText("6 places").waitFor();
await page.getByRole("group", { name: "Type" }).getByRole("button", { name: /^Bins/ }).click();
await page.getByText("2 found").waitFor();
await page.waitForTimeout(200);
const binsChip = await page.getByRole("group", { name: "Type" }).getByRole("button", { name: /^Bins/ }).boundingBox();
check(binsChip.x >= 0 && binsChip.x + binsChip.width <= 390, `the chosen type is first and fully in sight (x ${Math.round(binsChip.x)})`);
const binRows = (await page.getByRole("main").getByRole("listitem").allTextContents()).map((t) => t.replace(/\u00a0/g, " "));
check(binRows[0].includes("Bin 0001") && binRows[0].includes("M3 nuts") && binRows[0].includes("Rack A › Grid box 1"), "bins listed with what's in them and where: " + binRows[0]);
check(binRows[1].includes("Empty"), "an empty bin says Empty: " + binRows[1]);
check(new URL(page.url()).search.includes("type=bin"), "the type filter is in the address");
await page.screenshot({ path: `${shots}/p3-all-bins.png`, fullPage: true });
await page.getByLabel("Find a place").fill("nuts");
await page.getByText("1 found").waitFor();
check(true, "find a place by what's in it");
await page.getByRole("button", { name: "By place" }).click();
await page.getByRole("link", { name: /^Rack A/ }).waitFor();
check(new URL(page.url()).search === "", "By place clears the filters");

// Move the tote (no sticker needed) by picking from the list.
await page.goto(`${base}/locations/${tote.id}`);
await page.getByRole("button", { name: "Move" }).click();
await page.getByRole("button", { name: "Pick from list" }).click();
const picker = page.getByRole("list").filter({ hasText: "Rack B" });
await picker.waitFor();
await page.getByRole("button", { name: /Rack A \(here now\)/ }).waitFor();
check((await page.getByRole("button", { name: "Choose Rack A" }).count()) === 0 && (await page.getByRole("button", { name: "Choose Rack B" }).count()) === 1, "the picker opens beside the tote: Rack A 'here now' without Choose, Rack B with Choose");
check((await page.getByText("Tap a place to look inside it.").count()) === 1, "it says that tapping a place looks inside");
await page.screenshot({ path: `${shots}/p4-move-pick.png`, fullPage: true });
// Tapping the place it's in now opens it, rather than doing nothing.
await page.getByRole("button", { name: /Rack A \(here now\)/ }).click();
await page.getByText("Inside Rack A (here now)").waitFor();
check((await page.getByRole("button", { name: /^Choose Rack A/ }).count()) === 0, "inside where it is now: no Choose for it");
await page.getByRole("button", { name: "Up one level" }).click();
await page.getByRole("button", { name: "Choose Rack B" }).click();
await page.getByRole("status").filter({ hasText: "Moved to Rack B" }).waitFor();
check((await api("GET", `/locations/${tote.id}`)).path.map((c) => c.name).join(" › ") === "Garage › Rack B › Yellow tote", "tote moved into Rack B");
// A box can't be picked as its own destination.
await page.goto(`${base}/locations/${box.id}`);
await page.getByRole("button", { name: "Move" }).click();
await page.getByRole("button", { name: "Pick from list" }).click();
await page.getByRole("button", { name: /Rack A \(here now\)/ }).click();
await page.getByText("Inside Rack A (here now)").waitFor();
check((await page.getByRole("listitem").filter({ hasText: "Grid box 1" }).count()) === 0 && (await page.getByRole("listitem").count()) > 0, "the box being moved isn't in the list");
// Going inside another place offers "Choose <it>" at the top.
await page.getByRole("button", { name: "Up one level" }).click();
await page.getByRole("button", { name: /^Rack B/ }).click();
await page.getByRole("button", { name: "Choose Rack B" }).waitFor();
await page.screenshot({ path: `${shots}/p5-inside-rack-b.png`, fullPage: true });
check(true, "inside Rack B: 'Choose Rack B' at the top");

// Positions in a rack (DEC-033).
const gridRack = await api("POST", "/locations", { name: "Grid-Box Rack", type: "rack", parentId: site.id });
const boxes = [];
for (const n of ["Box A", "Box B", "Box C"]) boxes.push(await api("POST", "/locations", { name: n, type: "gridded_box", parentId: gridRack.id }));
const deepBin = await api("POST", "/locations", { type: "bin", parentId: boxes[2].id, binSize: "1x1", slot: { x: 0, y: 0 } });
await api("POST", "/items", { name: "Heat-set inserts", locationId: deepBin.id, qty: 30 });
await page.goto(`${base}/locations/${gridRack.id}`);
await page.getByRole("button", { name: "Positions" }).click();
await page.getByRole("button", { name: "Fill 1, 2, 3…" }).click();
await page.getByLabel("Position of Box A").fill("10");
await page.getByLabel("Position of Box B").fill("10");
check(await page.getByRole("button", { name: "Save positions" }).isDisabled() && (await page.getByText("Two places have the same position.").count()) === 1, "two at the same position: caught before saving");
await page.getByLabel("Position of Box B").fill("2");
await page.screenshot({ path: `${shots}/p6-positions.png`, fullPage: true });
await page.getByRole("button", { name: "Save positions" }).click();
await page.getByRole("status").filter({ hasText: "Positions saved" }).waitFor();
await page.getByRole("button", { name: "Positions" }).waitFor();
const rackRows = (await page.getByRole("region", { name: /./ }).count(), await page.locator("main ul").first().getByRole("listitem").allTextContents());
check(rackRows[0].startsWith("2") && rackRows[0].includes("Box B") && rackRows[1].startsWith("3") && rackRows[2].startsWith("10") && rackRows[2].includes("Box A"), "the rack lists them by position, 2 and 3 before 10: " + rackRows.join(" | "));
await page.screenshot({ path: `${shots}/p7-rack-ordered.png`, fullPage: true });
// One box's own page: the tag on its title, and the position next to the name when editing.
await page.goto(`${base}/locations/${boxes[0].id}`);
await page.getByRole("heading", { name: "Box A" }).waitFor();
check((await page.getByLabel("position 10").count()) >= 1, "Box A's page shows position 10");
await page.getByRole("button", { name: "Rename Box A" }).click();
await page.getByLabel("Position in Grid-Box Rack").fill("4");
await page.getByRole("button", { name: "Save", exact: true }).click();
await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
check((await api("GET", `/locations/${boxes[0].id}`)).position === "4", "position changed from the box's page");
// Search shows the slot in the path.
await page.goto(`${base}/?q=heat`);
const hit = page.getByRole("link", { name: /^Heat-set inserts/ });
await hit.waitFor();
check((await hit.textContent()).replace(/\u00a0/g, " ").includes("3Box C"), "a part's path shows its box's position: " + (await hit.textContent()).replace(/\u00a0/g, " "));
await page.screenshot({ path: `${shots}/p8-search-path.png` });

await browser.close();
server.kill();
