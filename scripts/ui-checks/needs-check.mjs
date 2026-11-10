// Fill in details (DEC-037): every part on the Needs details list on one page, each row filled in
// where it is (name, category you can type to find, how it's counted, how many), saving as you go.
// Also the details form: the type-in category box, the amounts per place, and the warning wording.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=600x600", "-frames:v", "1", `${shots}/a.jpg`]);
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3011", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };
const until = async (fn, msg, ms = 3000) => {
  for (let t = 0; t < ms; t += 100) { if (await fn()) return check(true, msg); await new Promise((r) => setTimeout(r, 100)); }
  check(false, msg);
};

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const drawerA = await api("POST", "/locations", { name: "Drawer A", type: "bin", parentId: site.id });
const drawerB = await api("POST", "/locations", { name: "Drawer B", type: "bin", parentId: site.id });
const cats = await api("GET", "/categories");
const cat = (n) => cats.find((c) => c.name === n).id;
const unnamed = await api("POST", "/items", { locationId: drawerA.id });
{
  const jpg = readFileSync(`${shots}/a.jpg`);
  const form = new FormData();
  form.append("photo", new Blob([jpg], { type: "image/jpeg" }), "p.jpg");
  form.append("thumb", new Blob([jpg], { type: "image/jpeg" }), "t.jpg");
  await fetch(`${base}/api/items/${unnamed.id}/photos`, { method: "POST", body: form });
}
const washers = await api("POST", "/items", { name: "M3 washers", locationId: drawerB.id });
const wick = await api("POST", "/items", { name: "Solder wick", locationId: drawerA.id, qty: 5 });
const shrink = await api("POST", "/items", { name: "Heat shrink", locationId: drawerB.id, level: "plenty" });
const ties = await api("POST", "/items", { name: "Zip ties", locationId: drawerA.id });
const loose = await api("POST", "/items", {});
await api("POST", "/items", { name: "Done part", categoryId: cat("Tools") });
const get = (id) => api("GET", `/items/${id}`);

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const row = (name) => page.getByRole("listitem", { name: new RegExp(`^${name}(, done)?$`) });
const toast = (text) => page.getByRole("status").filter({ hasText: text }).first();

// 1. From Inventory's Needs details filter to the page.
await page.goto(`${base}/`);
await page.getByRole("button", { name: /^Needs details/ }).click();
await page.getByRole("link", { name: /Fill them in on one page/ }).click();
await page.getByRole("heading", { name: "Fill in details" }).waitFor();
await page.getByText("6 to go.").waitFor();
check(true, "Inventory's Needs details filter links to the page; it says 6 to go");
const labels = await page.getByRole("main").getByRole("listitem").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).filter(Boolean));
check(JSON.stringify(labels) === JSON.stringify(["Unnamed item", "M3 washers", "Solder wick", "Heat shrink", "Zip ties", "Unnamed item"]), `oldest first, the finished part left out (${labels.join(", ")})`);
check((await row("Solder wick").getByText("Drawer A").count()) === 1, "each row says where the part is");
await page.screenshot({ path: `${shots}/n1-phone-list.png`, fullPage: true });

// 2. Name the photo-only part; a name alone keeps it on the list.
const first = page.getByRole("main").getByRole("listitem").first();
await first.getByLabel("Name", { exact: true }).fill("Hex key set");
await first.getByLabel("Name", { exact: true }).press("Enter");
await until(async () => (await get(unnamed.id)).name === "Hex key set", "typing a name and Enter saves it");
check((await get(unnamed.id)).needsDetails === true && (await row("Hex key set").getAttribute("aria-label")) === "Hex key set", "a name alone isn't done (Q47)");

// 3. Category by typing: "fast" finds Fasteners, Enter picks it. Fasteners are counted by level.
const hexCat = row("Hex key set").getByRole("combobox", { name: "Category for Hex key set" });
await hexCat.click();
await hexCat.fill("fast");
const opts = await page.getByRole("option").allTextContents();
check(opts[0] === "Fasteners", `typing "fast" puts Fasteners first (${opts.slice(0, 3).join(", ")})`);
await page.screenshot({ path: `${shots}/n2-category-typed.png` });
await hexCat.press("Enter");
await until(async () => (await get(unnamed.id)).categoryId === cat("Fasteners"), "Enter picks it and saves");
const hex = await get(unnamed.id);
check(hex.needsDetails === false && hex.tracking === "level", "with a name and a category it's done, and counts by level like Fasteners");
await until(async () => (await row("Hex key set").getAttribute("aria-label")) === "Hex key set, done", "the row stays, marked done");
check((await row("Hex key set").getByRole("radio", { name: "Plenty / low / out" }).getAttribute("aria-checked")) === "true", "the row shows Plenty / low / out picked");
await page.getByText("5 to go.").waitFor();
check(true, "the count goes down to 5");

// 4. A part with a count keeps counting exactly when its new category counts by level.
const wickCat = row("Solder wick").getByRole("combobox", { name: "Category for Solder wick" });
await wickCat.click();
await wickCat.fill("sup");
await page.getByRole("option", { name: "Supplies", exact: true }).click();
await until(async () => (await get(wick.id)).categoryId === cat("Supplies"), "clicking an option picks it");
const w = await get(wick.id);
check(w.tracking === "exact" && w.places[0].qty === 5, "the typed count of 5 isn't thrown away: still an exact count");

// 5. Switch how it's counted, set a level, then a category with arrow keys.
await row("M3 washers").getByRole("radio", { name: "Plenty / low / out" }).click();
await until(async () => (await get(washers.id)).tracking === "level", "the toggle switches to plenty / low / out");
await row("M3 washers").getByRole("radio", { name: "Low", exact: true }).click();
await toast("Drawer B: Low").waitFor();
check((await get(washers.id)).places[0].level === "low", "Low saves, with a toast");
const wCat = row("M3 washers").getByRole("combobox", { name: "Category for M3 washers" });
await wCat.click();
await wCat.fill("w");
await wCat.press("ArrowDown");
const active = await page.getByRole("option", { selected: true }).textContent();
await wCat.press("Enter");
await until(async () => (await get(washers.id)).categoryId === cats.find((c) => c.name === active)?.id, `arrow down and Enter picks the next match (${active})`);
check((await get(washers.id)).tracking === "level", "a category picked after the toggle doesn't undo it");

// 6. A count, then Undo from the toast.
const tiesBox = row("Zip ties").getByLabel("How many Zip ties in Drawer A");
await tiesBox.fill("40");
await tiesBox.press("Enter");
await toast("Zip ties: 40 in Drawer A").waitFor();
check((await get(ties.id)).places[0].qty === 40, "typing 40 and Enter counts 40");
await toast("Zip ties: 40 in Drawer A").getByRole("button", { name: "Undo" }).click();
await until(async () => (await get(ties.id)).places[0].qty === null, "Undo takes the count back");
await until(async () => (await tiesBox.inputValue()) === "", "the box empties again after Undo");

// 7. A new category typed on the spot; the part has no place.
const last = page.getByRole("main").getByRole("listitem").last();
await last.getByLabel("Name", { exact: true }).fill("Mystery cable");
await last.getByLabel("Name", { exact: true }).press("Tab");
const lCat = row("Mystery cable").getByRole("combobox");
await lCat.fill("Cables");
check((await page.getByRole("option", { name: /Add “Cables” as a new category/ }).count()) === 1, "a name that isn't there offers to add it");
await lCat.press("Enter");
await until(async () => (await api("GET", "/categories")).some((c) => c.name === "Cables"), "Enter adds the category");
await until(async () => (await get(loose.id)).needsDetails === false, "and the part is done");
check((await row("Mystery cable").getByText("Not in a place yet").count()) === 1, "a part with no place says so");

// 8. Escape closes the list and leaves the category as it was.
await wickCat.click();
await wickCat.fill("res");
await wickCat.press("Escape");
check((await page.getByRole("listbox").count()) === 0 && (await wickCat.inputValue()) === "Supplies", "Escape closes the list and puts Supplies back");

// 9. More details in a popup.
await row("Heat shrink").getByRole("button", { name: "More details for Heat shrink" }).click();
const dlg = page.getByRole("dialog", { name: "Details for Heat shrink" });
await dlg.waitFor();
check((await dlg.getByRole("radiogroup", { name: "How much in Drawer B" }).count()) === 1, "the popup shows how much is in each place");
check((await dlg.getByText("No warning number needed").count()) === 1, "a plenty/low/out part says Low is its warning");
check((await dlg.getByText("Without a category it stays on the Needs details list.").count()) === 1, "the popup says a category is needed");
await page.screenshot({ path: `${shots}/n3-popup.png` });
const dCat = dlg.getByRole("combobox", { name: "Category" });
await dCat.click();
await dCat.fill("LED");
await dCat.press("Enter");
await dlg.getByLabel("Price").fill("4.50");
await dlg.getByRole("button", { name: "Save" }).click();
await toast("Saved Heat shrink").waitFor();
check((await page.getByRole("dialog").count()) === 0, "Save closes the popup");
const hs = await get(shrink.id);
check(hs.categoryId === cat("LEDs") && hs.price === 4.5 && !hs.needsDetails, "the popup saved the category and price");
await until(async () => (await row("Heat shrink").getAttribute("aria-label")) === "Heat shrink, done", "its row is marked done");
check(page.url().endsWith("/needs-details"), "still on the page");

// 10. The photo, bigger.
await row("Hex key set").getByRole("button", { name: "Show the photo of Hex key set" }).click();
await page.getByRole("dialog", { name: "Photo of Hex key set" }).getByRole("img").waitFor();
check(true, "tapping the thumbnail shows the photo");
await page.keyboard.press("Escape");
check((await page.getByRole("dialog").count()) === 0, "Escape closes it");

// 11. Finish the last one and leave; done parts are gone next time.
const zCat = row("Zip ties").getByRole("combobox");
await zCat.fill("Supplies");
await zCat.press("Tab");
await until(async () => (await get(ties.id)).categoryId === cat("Supplies"), "Tab takes the match");
await page.getByText("All done.").waitFor();
check((await page.getByRole("listitem", { name: /, done$/ }).count()) === 6, "all six rows stay on screen, done");
await page.screenshot({ path: `${shots}/n4-all-done.png`, fullPage: true });
await page.reload();
await page.getByText("Nothing needs details right now.").waitFor();
check(true, "next visit: nothing left");

// 12. The details form on its own page.
await page.goto(`${base}/items/${wick.id}/edit`);
await page.getByRole("heading", { name: "Edit item" }).waitFor();
check((await page.getByLabel(/^Warn me when it's down to/).count()) === 1, "the number box is labelled as the low-stock warning");
const count = page.getByLabel("How many in Drawer A");
check((await count.inputValue()) === "5", "the form shows how many are in each place");
await page.screenshot({ path: `${shots}/n5-edit-exact.png`, fullPage: true });
await page.getByRole("radiogroup", { name: "Keep track by" }).getByRole("radio", { name: "Plenty / low / out" }).click();
check((await page.getByRole("radiogroup", { name: "How much in Drawer A" }).getByRole("radio", { name: "Plenty", exact: true }).getAttribute("aria-checked")) === "true", "switching to plenty/low/out shows 5 becoming Plenty");
check((await page.getByLabel(/^Warn me when it's down to/).count()) === 0, "and no warning number");
await page.screenshot({ path: `${shots}/n6-edit-level.png`, fullPage: true });
await page.getByRole("radiogroup", { name: "Keep track by" }).getByRole("radio", { name: "Exact count" }).click();
await count.fill("12");
await page.getByRole("button", { name: "Save" }).click();
await toast("Saved Solder wick").waitFor();
const w2 = await get(wick.id);
check(w2.tracking === "exact" && w2.places[0].qty === 12, "Save sets the count from the form");

// Clearing the category in the form puts the part back on the list.
await page.goto(`${base}/items/${wick.id}/edit`);
const fCat = page.getByRole("combobox", { name: "Category" });
await fCat.click();
await page.getByRole("option", { name: "None", exact: true }).click();
await page.getByText("Without a category it stays on the Needs details list.").waitFor();
await page.getByRole("button", { name: "Save" }).click();
await toast("Saved Solder wick").waitFor();
check((await get(wick.id)).needsDetails === true, "saving without a category puts it back on Needs details");

// 13. Desktop: one line per part with column headings.
const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
desk.on("pageerror", (e) => errors.push(e.message));
await api("PATCH", `/items/${ties.id}`, { categoryId: null });
await desk.goto(`${base}/needs-details`);
await desk.getByRole("heading", { name: "Fill in details" }).waitFor();
const r1 = desk.getByRole("listitem", { name: "Solder wick" });
const nb = await r1.getByLabel("Name", { exact: true }).boundingBox(), cb = await r1.getByRole("combobox").boundingBox(), tb = await r1.getByRole("radiogroup").boundingBox();
check(Math.abs(nb.y - cb.y) < 2 && Math.abs(cb.y - tb.y) < 2 && nb.x < cb.x && cb.x < tb.x, "desktop: name, category and how it's counted sit on one line");
const head = await desk.getByText("Keep track by, and how many", { exact: true }).boundingBox();
check(Math.abs(head.x - tb.x) < 4, `desktop: column headings line up with the rows (${Math.round(head.x)} vs ${Math.round(tb.x)})`);
check(nb.width >= 200 && cb.width >= 200, `desktop: name and category have room (${Math.round(nb.width)}, ${Math.round(cb.width)} px)`);
await r1.getByRole("combobox").click();
await desk.screenshot({ path: `${shots}/n7-desktop.png` });
await desk.getByRole("listitem", { name: "Zip ties" }).getByRole("button", { name: /^More details/ }).click();
const dd = await desk.getByRole("dialog", { name: "Details for Zip ties" }).boundingBox();
check(dd.width >= 900 && dd.width <= 1000 && dd.x > 100, `desktop: the popup is a centred panel (${Math.round(dd.width)} px wide)`);
await desk.screenshot({ path: `${shots}/n8-desktop-popup.png` });

check(errors.length === 0, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
await browser.close();
server.kill();
