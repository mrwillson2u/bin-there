// Other location pages after DEC-024: a rack (holds places) and a tote (holds parts).
// DEC-027: every place in one list with a type filter, and moving a place without a sticker.
// DEC-034: racks with numbered positions: set up, drag to reorder, labels, filling empty positions.
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

// A rack with numbered positions (DEC-034): set it up, drag to reorder, rename a position,
// put things in empty positions, and see the position in a part's path.
const gridRack = await api("POST", "/locations", { name: "Grid-Box Rack", type: "rack", parentId: site.id });
const boxes = {};
for (const n of ["Box 10", "Box 2", "Box 3"]) boxes[n] = await api("POST", "/locations", { name: n, type: "gridded_box", parentId: gridRack.id });
const deepBin = await api("POST", "/locations", { type: "bin", parentId: boxes["Box 3"].id, binSize: "1x1", slot: { x: 0, y: 0 } });
await api("POST", "/items", { name: "Heat-set inserts", locationId: deepBin.id, qty: 30 });
const spareTote = await api("POST", "/locations", { name: "Spare tote", type: "tote", parentId: site.id });
const slotsNow = async () => (await api("GET", `/locations/${gridRack.id}`)).children.filter((c) => c.rackSlot !== null).sort((a, b) => a.rackSlot - b.rackSlot).map((c) => `${c.position}:${c.name}`).join(" ");
await page.goto(`${base}/locations/${gridRack.id}`);
await page.getByRole("button", { name: /numbered positions\? Set them up/ }).click();
await page.getByLabel("How many positions").fill("5");
await page.getByRole("button", { name: "Set up" }).click();
await page.getByRole("status").filter({ hasText: "has 5 positions" }).waitFor();
await page.getByRole("list", { name: "Positions" }).waitFor();
check((await slotsNow()) === "1:Box 2 2:Box 3 3:Box 10", "set up: what was inside fills 1, 2, 3 in order (Box 2 before Box 10): " + (await slotsNow()));
check((await page.getByRole("button", { name: /Position 4 is empty/ }).count()) === 1, "empty positions say so, and offer to take something");
await page.screenshot({ path: `${shots}/p6-rack.png`, fullPage: true });

// Arrange: drag Box 10 onto position 1. While dragging, the others slide down to make room;
// dropped, Box 10 takes 1 and the ones in between move along one (DEC-035).
await page.getByRole("button", { name: "Arrange" }).click();
const card = (name) => page.getByRole("list", { name: "Positions" }).getByText(name, { exact: true });
const box2Before = (await card("Box 2").boundingBox()).y;
const transition = await card("Box 2").evaluate((e) => getComputedStyle(e.closest("[style]")).transitionProperty);
check(transition.includes("top"), "boxes slide between positions (transition: " + transition + ")");
const grip = await page.getByRole("button", { name: "Move Box 10" }).boundingBox();
const row1 = await page.getByRole("list", { name: "Positions" }).getByRole("listitem").first().boundingBox();
const gx = grip.x + grip.width / 2, gy = grip.y + grip.height / 2, ty = row1.y + row1.height / 2;
await page.mouse.move(gx, gy);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(gx, gy + (ty - gy) * (i / 10));
await page.waitForTimeout(350);
const box2During = (await card("Box 2").boundingBox()).y;
check(box2During - box2Before > 40, `while dragging, Box 2 has already slid down a position (${Math.round(box2Before)} → ${Math.round(box2During)})`);
await page.screenshot({ path: `${shots}/p7-dragging.png`, fullPage: true });
await page.mouse.up();
await page.waitForTimeout(600);
check((await slotsNow()) === "1:Box 10 2:Box 2 3:Box 3", "dropped on 1: Box 10 is first, Box 2 and Box 3 moved down one: " + (await slotsNow()));
// The keyboard: arrow down moves it one position, the one there moves up.
await page.getByRole("button", { name: "Move Box 10" }).focus();
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(600);
check((await slotsNow()) === "1:Box 2 2:Box 10 3:Box 3", "arrow down on the handle: one position down: " + (await slotsNow()));
// One coming in from "Not in a position" pushes the rest down into the next empty position.
await api("POST", "/locations", { name: "Box 9", type: "gridded_box", parentId: gridRack.id });
await page.reload();
await page.getByRole("button", { name: "Arrange" }).click();
const g9 = await page.getByRole("button", { name: "Move Box 9" }).boundingBox();
const row2 = await page.getByRole("list", { name: "Positions" }).getByRole("listitem").nth(1).boundingBox();
await page.mouse.move(g9.x + g9.width / 2, g9.y + g9.height / 2);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(g9.x + g9.width / 2 + ((row2.x + row2.width / 2) - (g9.x + g9.width / 2)) * (i / 12), g9.y + g9.height / 2 + ((row2.y + row2.height / 2) - (g9.y + g9.height / 2)) * (i / 12));
await page.waitForTimeout(300);
await page.screenshot({ path: `${shots}/p7b-dragging-in.png`, fullPage: true });
await page.mouse.up();
await page.waitForTimeout(600);
check((await slotsNow()) === "1:Box 2 2:Box 9 3:Box 10 4:Box 3", "Box 9 dropped on 2: Box 10 and Box 3 moved down into the empty 4: " + (await slotsNow()));
// Rename position 5; make room for one more.
await page.getByLabel("Label for position 5").fill("Top");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
check(JSON.stringify((await api("GET", `/locations/${gridRack.id}`)).rack.labels) === JSON.stringify([null, null, null, null, "Top"]), "position 5 renamed Top; the others keep their numbers");
await page.getByRole("button", { name: "One more position" }).click();
await page.waitForTimeout(500);
check((await api("GET", `/locations/${gridRack.id}`)).rack.size === 6, "one more position: 6");
await page.screenshot({ path: `${shots}/p8-arrange.png`, fullPage: true });
await page.getByRole("button", { name: "Done" }).click();

// An empty position: pick a tote from elsewhere.
await page.getByRole("button", { name: /Position 6 is empty/ }).click();
const sheet = page.getByRole("dialog", { name: "Position 6 of Grid-Box Rack" });
await sheet.getByRole("button", { name: "From somewhere else" }).click();
await sheet.getByRole("button", { name: "Pick from list" }).click();
await sheet.getByRole("button", { name: "Choose Spare tote" }).click();
await page.getByRole("status").filter({ hasText: "Spare tote is in position 6" }).waitFor();
check((await slotsNow()).includes("6:Spare tote"), "a tote from elsewhere went into position 6");
// The Top position: a new box straight into it.
await page.getByRole("button", { name: /Position Top is empty/ }).click();
await page.getByRole("dialog", { name: "Position Top of Grid-Box Rack" }).getByRole("link", { name: "New box here" }).click();
await page.getByText("Goes in this position of Grid-Box Rack").waitFor();
await page.getByPlaceholder(/Rack A, Screws box/).fill("Box 5");
await page.getByRole("button", { name: /^Create|^Add|^Save/ }).first().click();
await page.getByRole("heading", { name: "Box 5" }).waitFor();
check((await page.getByLabel("Top", { exact: true }).count()) >= 1, "the new box is in position Top, shown on its page");

// A part's path shows its box's position.
await page.goto(`${base}/?q=heat`);
const hit = page.getByRole("link", { name: /^Heat-set inserts/ });
await hit.waitFor();
check((await hit.textContent()).replace(/\u00a0/g, " ").includes("4Box 3"), "a part's path shows its box's position: " + (await hit.textContent()).replace(/\u00a0/g, " "));

await browser.close();
server.kill();
