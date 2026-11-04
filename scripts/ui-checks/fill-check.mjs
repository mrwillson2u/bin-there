import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
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
server.stdout.on("data", (d) => process.stdout.write("[server] " + d));
server.stderr.on("data", (d) => process.stdout.write("[server!] " + d));
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }

const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body !== undefined ? { "content-type": "application/json" } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const box = await api("POST", "/locations", { name: "Screws box", type: "gridded_box", parentId: site.id });
const bins = async () => (await api("GET", `/locations/${box.id}`)).children.filter((c) => c.type === "bin");

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text()); });
const scan = async (code) => {
  await page.keyboard.down("Control"); await page.keyboard.press("b"); await page.keyboard.up("Control");
  await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press("Enter");
};
const toast = (text) => page.getByRole("status").filter({ hasText: text }).waitFor();

const gridBox = async () => page.getByRole("group", { name: "Grid of Screws box" }).boundingBox();
const cell = async () => (await gridBox()).width / 6;
const dragTo = async (name, cx, cy, shot) => {
  const el = page.getByRole("button", { name, exact: true });
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  const b = await el.boundingBox();
  const g = await gridBox();
  const c = await cell();
  const fromX = b.x + 8, fromY = b.y + 8;
  const toX = g.x + cx * c + 8, toY = g.y + cy * c + 8;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(fromX + ((toX - fromX) * i) / 8, fromY + ((toY - fromY) * i) / 8);
  if (shot) await page.screenshot({ path: `${shots}/${shot}.png` });
  await page.mouse.up();
  await page.waitForTimeout(300);
};

// 1. An empty gridded box offers "Add bins"; the palette appears.
await page.goto(`${base}/locations/${box.id}`);
await page.getByRole("button", { name: "Add bins" }).click();
await page.getByRole("group", { name: "New bins" }).waitFor();
await page.screenshot({ path: `${shots}/f1-palette.png`, fullPage: true });
check((await page.getByRole("button", { name: /^New .* bin$/ }).count()) === 5, "palette shows five shapes");

// 2. Drag three new bins onto the grid.
await dragTo("New 1×1 bin", 0, 0, "f-drag-1x1");
await toast("Bin 0001 added");
await dragTo("New 2×1 tall bin", 1, 0);
await toast("Bin 0002 added");
await dragTo("New Front strip bin", 0, 4);
await toast("Bin 0003 added");
let b = await bins();
check(JSON.stringify(b.map((x) => [x.name, x.binSize, x.slot])) === JSON.stringify([
  ["Bin 0001", "1x1", { x: 0, y: 0, rotated: false }],
  ["Bin 0002", "2x1", { x: 1, y: 0, rotated: true }],
  ["Bin 0003", "front_strip", { x: 0, y: 4, rotated: false }],
]), "three bins created where they were dropped: " + JSON.stringify(b.map((x) => [x.name, x.slot])));
await page.screenshot({ path: `${shots}/f2-three-bins.png`, fullPage: true });

// 3. A drop off the grid makes nothing.
const palette = page.getByRole("button", { name: "New 2×2 bin", exact: true });
const pb = await palette.boundingBox();
await page.mouse.move(pb.x + 8, pb.y + 8); await page.mouse.down();
for (let i = 1; i <= 6; i++) await page.mouse.move(pb.x + 8 + i * 10, pb.y + 8 - i * 3);
await page.mouse.up();
await page.waitForTimeout(300);
check((await bins()).length === 3, "dropping a new bin off the grid adds nothing");

// 4. Tap the tall 2×1 to turn it: it's at (1,0) rotated; wide fits at (1,0)-(2,0).
const tall = page.getByRole("button", { name: /^Bin 0002, 2×1 .*tap to turn$/ });
check((await tall.count()) === 1, "placed 2×1 says it can be tapped to turn");
await tall.click();
await page.waitForTimeout(400);
b = await bins();
check(b[1].slot.rotated === false, "tapping the 2×1 turned it");

// 5. Done, then tap Bin 0001: an empty bin opens on "what goes in it".
await page.getByRole("button", { name: "Done" }).click();
await page.getByText("Tap a bin to see what's in it or add a part.").waitFor();
await page.getByRole("button", { name: "Bin 0001", exact: true }).click();
const sheet = () => page.getByRole("dialog", { name: /in Screws box$/ });
await page.getByRole("dialog", { name: "Bin 0001 in Screws box" }).waitFor();
await sheet().getByText("Nothing in it yet.").waitFor();
await sheet().getByText("What goes in it?").waitFor();
check(await sheet().getByLabel("Part name").evaluate((e) => e === document.activeElement), "empty bin: the name box is ready to type in");
check((await sheet().getByRole("button", { name: /Replace|Scan with camera|Rename bin/ }).count()) === 0, "no sticker or rename buttons in the bin pane");
await sheet().getByLabel("Part name").fill("M3 nuts");
await sheet().getByLabel("How many").fill("40");
await page.screenshot({ path: `${shots}/f3-sheet-empty.png` });
await page.keyboard.press("Enter");
await toast("M3 nuts added to Bin 0001");

// 6. With one part in it: photo spot, name, count; the add form is tucked away.
await sheet().getByRole("link", { name: "M3 nuts" }).waitFor();
check((await sheet().getByLabel("Part name").count()) === 0, "after adding, the form folds into 'Add another part'");
await sheet().getByRole("button", { name: "Add another part" }).waitFor();
check((await sheet().getByRole("button", { name: /^40\. Tap to enter a count/ }).count()) === 1, "count shows big: 40");
check((await sheet().getByRole("link", { name: "Add details" }).count()) === 1, "a quick-added part offers 'Add details'");
await page.screenshot({ path: `${shots}/f4-one-part-no-photo.png` });
await sheet().getByLabel("Take a photo of M3 nuts").setInputFiles(`${shots}/part.jpg`);
await sheet().getByRole("link", { name: "Open M3 nuts" }).waitFor();
b = await bins();
const nuts = (await api("GET", `/locations/${b[0].id}`)).items[0];
check(nuts.thumbUrl !== null, "photo taken from the pane is on the part");
await page.screenshot({ path: `${shots}/f5-one-part-photo.png` });

// Rename in place; "needs details" stays.
await sheet().getByRole("button", { name: "Rename M3 nuts" }).click();
await sheet().getByLabel("Part name").fill("M3 hex nuts");
await sheet().getByRole("button", { name: "Save" }).click();
await toast("Renamed to M3 hex nuts");
const renamed = await api("GET", `/items/${nuts.itemId}`);
check(renamed.name === "M3 hex nuts" && renamed.needsDetails === true, "renamed, still in 'needs details'");

// A second part: one tap opens the form, focused.
await sheet().getByRole("button", { name: "Add another part" }).click();
await sheet().getByText("Another part").waitFor();
check(await sheet().getByLabel("Part name").evaluate((e) => e === document.activeElement), "'Add another part' opens the form, focused");
await sheet().getByLabel("Part name").fill("M3 washers");
await sheet().getByRole("button", { name: "Add", exact: true }).click();
await toast("M3 washers added to Bin 0001");
await page.getByRole("button", { name: "M3 hex nuts +1, Bin 0001" }).waitFor();
await sheet().getByRole("listitem").nth(1).waitFor();
check((await sheet().getByRole("listitem").count()) === 2, "two parts show as a list; tile reads 'M3 hex nuts +1'");
await page.screenshot({ path: `${shots}/f6-two-parts.png` });

// 7. Scan a fresh sticker while the pane is open: it goes on this bin, but the code isn't shown.
await scan("BIN0001");
const offer = sheet().getByRole("group", { name: "New sticker scanned" });
await offer.getByText("Is it the sticker for Bin 0001?").waitFor();
check((await api("GET", `/locations/${b[0].id}`)).code === null, "scanning a new sticker in the pane asks first; nothing assigned yet");
await page.screenshot({ path: `${shots}/f6b-new-sticker-offer.png` });
await offer.getByRole("button", { name: "Put it on Bin 0001" }).click();
await toast("Sticker added to Bin 0001");
await offer.waitFor({ state: "detached" });
check((await api("GET", `/locations/${b[0].id}`)).code === "BIN0001", "'Put it on Bin 0001' assigns it");
await scan("BIN0099");
await offer.getByText("Bin 0001 already has a sticker. Use this one instead?").waitFor();
await offer.getByRole("button", { name: "Not now" }).click();
await offer.waitFor({ state: "detached" });
check((await api("GET", `/locations/${b[0].id}`)).code === "BIN0001", "'Not now' leaves the bin's sticker alone");
check(!(await sheet().textContent()).includes("BIN0001"), "the pane doesn't show the sticker code");

// Scan another bin's sticker: the pane switches to it.
await api("POST", `/locations/${b[1].id}/code`, { code: "BIN0002" });
await scan("BIN0002");
await page.getByRole("dialog", { name: "Bin 0002 in Screws box" }).waitFor();
check(true, "scanning a sibling's sticker switches the pane");

// 8. An empty bin can be removed from its pane.
await page.getByRole("button", { name: "Remove this bin" }).click();
await toast("Bin 0002 removed");
await page.getByRole("dialog").waitFor({ state: "detached" });
b = await bins();
check(b.map((x) => x.name).join() === "Bin 0001,Bin 0003", "Bin 0002 removed: " + b.map((x) => x.name).join());

// Photo first, no name: Bin 0003 gets an unnamed part with its photo.
await page.getByRole("button", { name: "Bin 0003", exact: true }).click();
await sheet().getByLabel("Add a photo of it").setInputFiles(`${shots}/part.jpg`);
await sheet().getByPlaceholder("Name (later is fine)").waitFor();
await sheet().getByRole("button", { name: "Add", exact: true }).click();
await toast("Unnamed item added to Bin 0003");
const strip = (await api("GET", `/locations/${b[1].id}`)).items[0];
check(strip && strip.name === "" && strip.thumbUrl !== null, "photo-only part saved with its photo");
await sheet().getByRole("button", { name: "Name this part" }).waitFor();
await page.getByRole("button", { name: "Unnamed item, Bin 0003" }).waitFor();
check(true, "a photo-only part shows as 'Unnamed item' on its tile");
await page.getByRole("button", { name: "Close", exact: true }).click();

// The box page: grid first, no empty "Items" section, sticker at the bottom.
check((await page.getByRole("heading", { name: /^(Items|Loose in the box)$/ }).count()) === 0, "gridded box: no empty Items section");
const manage = page.getByRole("region", { name: "Manage Screws box" });
await manage.getByText("No sticker yet").waitFor();
await page.screenshot({ path: `${shots}/f7-box-page.png`, fullPage: true });

// 9. Backing out of the new-location form, and the numbering carries on.
await manage.getByRole("link", { name: "Add inside" }).click();
await page.getByRole("heading", { name: /New location in Screws box/ }).waitFor();
await page.getByRole("button", { name: "Cancel" }).click();
await page.getByRole("heading", { name: "Screws box" }).waitFor();
check(page.url().endsWith(`/locations/${box.id}`), "Cancel on the form goes back to the box");
await page.getByRole("link", { name: "Add inside" }).click();
await page.getByRole("button", { name: "Add bin" }).waitFor();
check((await page.getByLabel(/Name \(optional/).inputValue()) === "", "bin form: name optional and blank");
await page.getByRole("button", { name: "Add bin" }).click();
await page.getByRole("heading", { name: "Bin 0004" }).waitFor();
check(true, "unnamed bin from the form becomes Bin 0004 (deleted numbers aren't reused)");
check((await page.getByText("Nothing inside yet.").count()) === 0 && (await page.getByRole("link", { name: "Add inside" }).count()) === 0, "a bin's page has no 'Inside' section or 'Add inside'");
await page.getByText("Nothing in it yet.").waitFor();
await page.screenshot({ path: `${shots}/f8-bin-page.png`, fullPage: true });
await page.getByRole("button", { name: "Rename Bin 0004" }).click();
await page.getByLabel("Name").fill("Spare bin");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("heading", { name: "Spare bin" }).waitFor();
check(true, "a bin is renamed from its own page");

// Bin 0001's own page shows its sticker, at the bottom.
await page.goto(`${base}/locations/${b[0].id}`);
await page.getByRole("region", { name: "Manage Bin 0001" }).getByText("BIN0001").waitFor();
check((await page.getByRole("button", { name: "Replace sticker" }).count()) === 1, "the bin's own page shows its sticker and 'Replace sticker'");

// The Locations screen's list says what's inside, not sticker status.
await page.goto(`${base}/locations`);
const row = page.getByRole("link", { name: /Screws box/ });
const rowText = await row.textContent();
check(rowText.includes("Gridded box · 3 inside") && !rowText.includes("no sticker"), "location row: " + rowText);

// 10. Quick capture has a way out too.
await page.goto(`${base}/capture?location=${b[0].id}`);
await page.getByRole("button", { name: "Cancel" }).click();
await page.getByRole("heading", { name: "Bin 0001" }).waitFor();
check(true, "Cancel on quick capture returns to the bin");

// Desktop: arrange mode, and a bin opened beside the grid instead of over it.
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desk.goto(`${base}/locations/${box.id}`);
await desk.getByText("Tap a bin to see what's in it or add a part.").waitFor();
await desk.getByRole("button", { name: "M3 hex nuts +1, Bin 0001" }).click();
await desk.getByRole("dialog", { name: "Bin 0001 in Screws box" }).waitFor();
check((await desk.locator(".fixed.inset-0").count()) === 0, "desktop: the bin opens beside the grid, no overlay");
check((await desk.locator('[data-selected]').count()) === 1, "desktop: the open bin is outlined on the grid");
await desk.screenshot({ path: `${shots}/f9-desktop-docked.png` });
await desk.getByRole("button", { name: "Close", exact: true }).click();
await desk.getByRole("button", { name: "Add or arrange bins" }).click();
await desk.getByRole("group", { name: "New bins" }).waitFor();
await desk.screenshot({ path: `${shots}/f10-desktop-arrange.png` });

await browser.close();
server.kill();
