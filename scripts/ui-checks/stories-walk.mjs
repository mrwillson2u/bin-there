// Walk each user story through the real UI on a phone-sized screen, counting what it
// costs (taps, scans, typed fields, photos, screens) and saving screenshots.
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
  const r = await fetch(base + "/api" + path, { method, headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const jpg = readFileSync(`${shots}/part.jpg`);
const photo = async (itemId) => {
  const f = new FormData();
  f.append("photo", new Blob([jpg], { type: "image/jpeg" }), "photo.jpg");
  f.append("thumb", new Blob([jpg], { type: "image/jpeg" }), "thumb.jpg");
  await fetch(`${base}/api/items/${itemId}/photos`, { method: "POST", body: f });
};

// ── A garage that looks like Colin's ────────────────────────────────────────
const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const rack = await api("POST", "/locations", { name: "Rack A", type: "rack", parentId: site.id, code: "RACK01" });
const box1 = await api("POST", "/locations", { name: "Grid box 1", type: "gridded_box", parentId: rack.id, code: "BOX0001" });
const box2 = await api("POST", "/locations", { name: "Grid box 2", type: "gridded_box", parentId: rack.id, code: "BOX0002" });
const tote = await api("POST", "/locations", { name: "Yellow tote", type: "tote", parentId: rack.id, code: "TOTE01" });
const bench = await api("POST", "/locations", { name: "Bench", type: "shelf", parentId: site.id, code: "BENCH1" });
const bin = (binSize, x, y, code, rotated) => api("POST", "/locations", { type: "bin", parentId: box1.id, binSize, code, slot: { x, y, rotated } });
const b1 = await bin("1x1", 0, 0, "BIN0001");
const b2 = await bin("2x1", 1, 0, "BIN0002");
const b3 = await bin("1x1", 3, 0, "BIN0003");
const b4 = await bin("1x1", 4, 0, "BIN0004");
const b5 = await bin("1x1", 5, 0, "BIN0005");
const item = (body) => api("POST", "/items", body);
const screws = await item({ name: "M3 x 10 socket screws", locationId: b1.id, qty: 40 });
await photo(screws.id);
const headers = await item({ name: "Male headers", locationId: b2.id, tracking: "level", level: "plenty" });
const nuts = await item({ name: "M2 nuts", locationId: b3.id, qty: 50 });
await item({ name: "M2 washers", locationId: b3.id, qty: 20 });
const zip = await item({ name: "Zip ties", locationId: tote.id, qty: 100 });
await photo(zip.id);
await item({ name: "Electrical tape", locationId: tote.id, tracking: "level", level: "low" });
const psu = await item({ name: "12V power supply", code: "PSU01", locationId: tote.id });
for (let i = 0; i < 10; i++) await api("POST", "/stock/adjust", { itemId: zip.id, locationId: tote.id, delta: i % 2 ? 1 : -1 });

// ── Walking ─────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const results = [];
let cur;
let lastUrl = "";
const settle = async () => {
  await page.waitForTimeout(250);
  const u = page.url();
  if (u !== lastUrl) { cur.screens++; lastUrl = u; }
};
const tap = async (loc) => { await loc.click(); cur.taps++; await settle(); };
const type = async (loc, text) => { await loc.fill(text); cur.typed++; };
const enter = async () => { await page.keyboard.press("Enter"); cur.taps++; await settle(); };
const scan = async (code) => {
  await page.keyboard.down("Control"); await page.keyboard.press("b"); await page.keyboard.up("Control");
  await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press("Enter");
  cur.scans++; await settle();
};
const snap = async (file) => { await page.waitForTimeout(150); await page.screenshot({ path: `${shots}/${file}.png` }); };
const toast = (text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 8000 });
const note = (t) => cur.notes.push(t);
const fold = async (loc) => { const b = await loc.boundingBox(); return b !== null && b.y + b.height <= 844 - 80; };
const story = async (id, title, start, fn) => {
  cur = { id, title, taps: 0, scans: 0, typed: 0, photos: 0, screens: 0, notes: [], ok: true };
  try {
    await page.goto(base + start);
    await page.waitForTimeout(300);
    lastUrl = page.url();
    await fn();
  } catch (e) {
    cur.ok = false;
    note("STOPPED: " + e.message.split("\n")[0]);
    await snap(`${id}-stopped`).catch(() => {});
  }
  results.push(cur);
};

await story("J1", "Find a part and record taking 2", "/", async () => {
  // Home is the inventory, with the search bar at the top (DEC-026).
  await type(page.getByLabel("Search parts"), "m3");
  await page.getByRole("link", { name: /M3 x 10 socket screws/ }).waitFor();
  const row = await page.getByRole("link", { name: /M3 x 10 socket screws/ }).textContent();
  note(`search row says: "${row}"`);
  const lastCrumb = page.getByRole("link", { name: /M3 x 10 socket screws/ }).locator("[title]").first().locator(":scope > span").last();
  note(`the bin at the end of the path is fully shown: ${await lastCrumb.evaluate((e) => e.scrollWidth <= e.clientWidth)} ("${await lastCrumb.textContent()}")`);
  await snap("J1-search");
  await tap(page.getByRole("link", { name: /M3 x 10 socket screws/ }));
  const minus = page.getByRole("button", { name: "Use one" }).first();
  note(`'Use one' visible without scrolling: ${await fold(minus)}`);
  await snap("J1-item");
  await tap(minus); await tap(minus);
  await toast("Used 2 from Bin 0001");
});

await story("J7", "Scan stickers to open things", "/", async () => {
  await scan("BIN0001");
  await page.getByRole("heading", { name: "Bin 0001" }).waitFor();
  note(`bin: count +/− visible without scrolling: ${await fold(page.getByRole("button", { name: "Add one" }).first())}`);
  await snap("J7-bin");
  await scan("BOX0001");
  await page.getByRole("heading", { name: "Grid box 1" }).waitFor();
  await snap("J7-box");
  await scan("PSU01");
  await page.getByRole("heading", { name: "12V power supply" }).waitFor();
  await snap("J7-unit");
  await scan("NEW0001");
  await page.getByRole("heading", { name: "New sticker" }).waitFor();
  await snap("J7-new");
});

await story("J2", "Put things back from the put-back bin", "/", async () => {
  await tap(page.getByRole("link", { name: "Put-back" }).first());
  await snap("J2-ready");
  await scan("BIN0001");
  await toast("M3 x 10 socket screws → Bin 0001");
  note("one-part bin: scan alone logged +1");
  await scan("BIN0003");
  await page.getByText("Which one goes back in Bin 0003?").waitFor();
  await tap(page.getByRole("button", { name: /M2 nuts/ }));
  await toast("M2 nuts → Bin 0003");
  await scan("PSU01");
  await toast("12V power supply is already in Yellow tote");
});

await story("J3a", "Move a part to a different bin, picking from the list", "/", async () => {
  await page.goto(`${base}/items/${headers.id}`); lastUrl = page.url(); cur.screens++;
  await tap(page.getByRole("button", { name: "Move" }).first());
  await tap(page.getByRole("button", { name: "Pick from list" }));
  const here = page.getByRole("button", { name: /Bin 0002 \(here now\)/ });
  await here.waitFor();
  note(`list opens in the part's own box, its bin marked 'here now' and not choosable: ${(await page.getByRole("button", { name: "Choose Bin 0002" }).count()) === 0}`);
  note(`rows say what's inside: "${await page.getByRole("button", { name: /^(?!Choose).*Bin 0001/ }).first().textContent()}"`);
  await snap("J3a-browse");
  await tap(page.getByRole("button", { name: "Choose Bin 0004" }));
  await toast("Moved to Bin 0004");
});

await story("J3b", "Move a bin to another gridded box", "/", async () => {
  await scan("BIN0005");
  await page.getByRole("heading", { name: "Bin 0005" }).waitFor();
  await tap(page.getByRole("button", { name: "Move" }));
  await scan("BOX0002");
  await toast("Moved to Grid box 2");
  await scan("BOX0002");
  await page.getByRole("heading", { name: "Grid box 2" }).waitFor();
  const tray = await page.getByText("Not placed on the grid yet").count();
  note(`moved bin waits in the box's 'not placed' tray: ${tray === 1}`);
  await snap("J3b-box2");
});

await story("J4", "Start a project kit and pull a part into it", "/", async () => {
  await tap(page.getByRole("link", { name: "Locations" }).first());
  await tap(page.getByRole("link", { name: "Start a project kit" }));
  await type(page.getByPlaceholder(/Weather station/), "Weather station");
  await tap(page.getByRole("button", { name: /^Create|^Add|^Save/ }).first());
  await page.getByRole("heading", { name: "Weather station" }).waitFor();
  await tap(page.getByRole("button", { name: "Pull in a part" }));
  await type(page.getByLabel("Search parts to pull in"), "zip");
  await tap(page.getByRole("button", { name: /Zip ties/ }).first());
  await snap("J4-pull");
  await tap(page.getByRole("button", { name: /^Pull/ }).first());
  await page.getByRole("heading", { name: "In the kit" }).waitFor();
  await snap("J4-kit");
});

await story("J5", "Browse to a box and look in a bin", "/", async () => {
  await tap(page.getByRole("link", { name: "Locations" }).first());
  await tap(page.getByRole("link", { name: /^Rack A/ }));
  await tap(page.getByRole("link", { name: /Grid box 1/ }));
  await snap("J5-box");
  await tap(page.getByRole("button", { name: "M2 nuts +1, Bin 0003" }));
  await page.getByRole("dialog", { name: "Bin 0003 in Grid box 1" }).waitFor();
  await snap("J5-pane");
});

await story("J6", "Add a new part with a photo, into a bin", "/", async () => {
  await tap(page.getByRole("link", { name: "Add item" }));
  await page.locator('input[type="file"]').first().setInputFiles(`${shots}/part.jpg`); cur.taps++; cur.photos++;
  await scan("BIN0004");
  await page.getByText("Bin 0004").first().waitFor();
  await type(page.getByPlaceholder("Later is fine"), "Hookup wire 22 AWG");
  await snap("J6-capture");
  await tap(page.getByRole("button", { name: "Save", exact: true }));
  await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  note("location stays set for the next part (good for a bin at a time)");
});

await story("J8", "Lend out the power supply, then check it back in", "/", async () => {
  await scan("PSU01");
  await page.getByRole("heading", { name: "12V power supply" }).waitFor();
  await tap(page.getByRole("button", { name: "Check out" }));
  await type(page.getByLabel("Note"), "lent to Sam");
  await tap(page.getByRole("button", { name: "Just mark out" }));
  await toast("Checked out");
  await tap(page.getByRole("link", { name: "Inventory" }).first());
  await tap(page.getByRole("button", { name: /^Checked out/ }));
  await tap(page.getByRole("link", { name: /Where they went/ }));
  await snap("J8-out");
  await tap(page.getByRole("button", { name: "Check in" }));
  await toast("Checked back in");
});

await story("J9", "Fill an empty bin from the grid (name, count, photo)", `/locations/${box1.id}`, async () => {
  const fresh = await api("POST", "/locations", { type: "bin", parentId: box1.id, binSize: "1x1", slot: { x: 0, y: 1 } });
  await page.reload(); await page.waitForTimeout(300);
  await tap(page.getByRole("button", { name: `${fresh.name}, empty`, exact: true }));
  const pane = page.getByRole("dialog");
  await pane.waitFor();
  await type(pane.getByLabel("Part name"), "M4 nuts");
  await type(pane.getByLabel("How many"), "60");
  await enter();
  await toast("M4 nuts added");
  await pane.getByLabel("Take a photo of M4 nuts").setInputFiles(`${shots}/part.jpg`); cur.taps++; cur.photos++;
  await pane.getByRole("link", { name: "Open M4 nuts" }).waitFor();
  await snap("J9-after-add");
});

await story("J11a", "Undo a wrong tap", "/", async () => {
  await page.goto(`${base}/items/${nuts.id}`); lastUrl = page.url(); cur.screens++;
  await tap(page.getByRole("button", { name: "Use one" }).first());
  await toast("Used 1");
  await tap(page.getByRole("status").getByRole("button", { name: "Undo" }));
  await toast("Undone");
});

await story("J11b", "Part put in the wrong bin: move it from the box view", `/locations/${box1.id}`, async () => {
  await tap(page.getByRole("button", { name: /^M3 x 10 socket screws, Bin 0001/ }));
  const pane = page.getByRole("dialog");
  await pane.waitFor();
  note(`pane has a way to move the part: ${(await pane.getByRole("button", { name: /Move/ }).count()) > 0}`);
  await tap(pane.getByRole("link", { name: "M3 x 10 socket screws", exact: true }));
  await tap(page.getByRole("button", { name: "Move" }).first());
  await scan("BIN0003");
  await toast("Moved to Bin 0003");
});

await story("J12", "See what's running low", "/", async () => {
  await tap(page.getByRole("button", { name: /^Running low/ }));
  await page.getByText(/Marked low or out/).waitFor();
  await snap("J12-low");
  note(`can change a level from the list: ${(await page.getByRole("radiogroup").count()) > 0}`);
});

await story("J13", "Check counts that may be off", "/", async () => {
  await tap(page.getByRole("button", { name: /^Counts to check/ }));
  await tap(page.getByRole("link", { name: /Check them one by one/ }));
  await page.getByRole("heading", { name: "Counts worth checking" }).waitFor();
  await snap("J13-review");
  await tap(page.getByRole("button", { name: /^Still/ }).first());
  await toast("Still");
});

await story("J14", "Fill in details for quick-added parts", "/", async () => {
  const filter = page.getByRole("button", { name: /^Needs details/ });
  note(`home's filter says: "${await filter.textContent()}"`);
  await tap(filter);
  await snap("J14-queue");
  // One page for the whole list (DEC-037): type a few letters of the category, Enter.
  await tap(page.getByRole("link", { name: /Fill them in on one page/ }));
  await page.getByRole("heading", { name: "Fill in details" }).waitFor();
  const rows = await page.getByRole("main").getByRole("listitem").count();
  note(`the page lists ${rows} part${rows === 1 ? "" : "s"}, each with name, category, how it's counted and how many`);
  const cat = page.getByRole("combobox", { name: "Category for M2 washers" });
  await tap(cat);
  await type(cat, "fast");
  await enter();
  await page.getByRole("listitem", { name: "M2 washers, done" }).waitFor();
  await snap("J14-fill");
  note("M2 washers done without leaving the page; the next part is right below");
});

await browser.close();
server.kill();
console.log(JSON.stringify(results, null, 1));
