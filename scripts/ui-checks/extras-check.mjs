// Four helpers (DEC-073 to DEC-076) with a fake model on port 3012: a row's own "Look it up with
// AI" / "Look again" on Fill in details; "You may already have this" with the button that adds a
// part captured again to the one on record, and Undo; a shop bag's 2D barcode read at capture
// and when a photo is added to a part; Tidy names on the Categories screen.
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
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
let lookUps = 0;
const fake = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fake");
  let body = ""; for await (const chunk of req) body += chunk;
  const json = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  if (url.pathname === "/api/tags") return json({ models: [{ name: "fake:1b" }] });
  if (url.pathname === "/api/chat") {
    const messages = JSON.parse(body).messages;
    if (messages[0].content.startsWith("You tidy")) {
      // Every part's line is `<id>. "<name>" (...)`; one name is rewritten, one gets an invented number, the rest stay.
      const parts = [...messages[1].content.matchAll(/^(\d+)\. "(.*?)"/gm)].map((m) => ({ id: Number(m[1]), name: m[2] }));
      return json({ message: { content: JSON.stringify({ names: parts.map((p) => ({ id: p.id, name: p.name === "nimh AA cells" ? "NiMH battery AA" : p.name === "Coin cell" ? "Coin cell CR2032" : p.name })) }) } });
    }
    if (messages[0].content.startsWith("You fill in")) {
      lookUps++;
      return json({ message: { content: JSON.stringify({ identified: "A step-down module", suggestions: [{ field: "name", value: `Buck converter module ${lookUps}`, source: "photo", confidence: "medium" }], notes: [] }) } });
    }
    return json({ message: { content: JSON.stringify({ markings: ["LM2596S"], partNumbers: [], brand: "", description: "A small blue module", likelyPart: "Buck converter module", name: "Buck converter module", category: "", queries: [] }) } });
  }
  res.statusCode = 404; res.end("no");
});
await new Promise((r) => fake.listen(3012, "127.0.0.1", r));
process.on("exit", () => fake.close());
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3011", DATA_DIR: dataDir, AI_URL: "http://127.0.0.1:3012", AI_MODEL: "fake:1b" }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };
const until = async (fn, msg, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return check(true, msg); await new Promise((r) => setTimeout(r, 150)); }
  check(false, msg);
};

// A Digi-Key bag's Data Matrix, as a picture (the same labelled-field text a real bag carries).
const GS = "\u001d", RS = "\u001e";
{
  const { writeBarcode } = await import(require.resolve("zxing-wasm/writer"));
  const r = await writeBarcode(`[)>${RS}06${GS}P1528-1150-ND${GS}1P1578${GS}30P1528-1150-ND${GS}K${GS}1K71234567${GS}Q5${GS}11ZPICK${RS}\u0004`, { format: "DataMatrix", scale: 8, withQuietZones: true });
  writeFileSync(`${shots}/bag.png`, Buffer.from(await r.image.arrayBuffer()));
}

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const tote = await api("POST", "/locations", { name: "Tote", type: "tote", parentId: site.id });
const batteries = (await api("GET", "/categories")).find((c) => c.name === "Batteries");
const have = await api("POST", "/items", { name: "LiPo battery 3.7 V 2000 mAh", categoryId: batteries.id, locationId: tote.id, qty: 4 });
await api("PATCH", `/items/${have.id}`, { supplierPn: "1528-1150-ND" });
await api("POST", "/items", { name: "nimh AA cells", categoryId: batteries.id, locationId: tote.id, qty: 8 });
await api("POST", "/items", { name: "Coin cell", categoryId: batteries.id, locationId: tote.id, qty: 3 });
const again = await api("POST", "/items", { name: "lipo battery 3.7V 2000mAh", locationId: tote.id, qty: 2 });
const board = await api("POST", "/items", { name: "Mystery board", locationId: tote.id, qty: 1 });
// A photo on the board, so the AI has something to look at.
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=800x600", "-frames:v", "1", `${shots}/part.jpg`]);
{
  const jpg = new Blob([readFileSync(`${shots}/part.jpg`)], { type: "image/jpeg" });
  const form = new FormData(); form.append("photo", jpg, "photo.jpg"); form.append("thumb", jpg, "thumb.jpg");
  const r = await fetch(`${base}/api/items/${board.id}/photos`, { method: "POST", body: form });
  if (!r.ok) throw new Error("photo upload failed " + r.status);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const row = (name) => page.getByRole("listitem", { name, exact: true });

// 1. Fill in details: each row can ask the AI itself (DEC-073).
await page.goto(`${base}/needs-details`);
await row("Mystery board").waitFor();
await row("Mystery board").getByRole("button", { name: "Look it up with AI for Mystery board" }).click();
await row("Mystery board").locator("[data-ai-guess]").waitFor({ timeout: 20000 });
check((await row("Mystery board").locator("[data-ai-guess]").textContent()).includes("Buck converter module 1"), "a row's own Look it up with AI brings the AI's guess to that row");
await row("Mystery board").getByRole("button", { name: "Look again with AI for Mystery board" }).click();
await until(async () => (await row("Mystery board").locator("[data-ai-guess]").textContent().catch(() => "")).includes("Buck converter module 2"), "Look again on the row asks again and shows the new answer");

// 2. "You may already have this" (DEC-075).
const hint = row("lipo battery 3.7V 2000mAh").locator("[data-similar]");
check((await hint.textContent()).includes("You may already have this") && (await hint.textContent()).includes("same name") && (await hint.textContent()).includes("Garage › Tote"), "a part named like one on record says so, with where that one is");
check((await hint.getByRole("link", { name: "LiPo battery 3.7 V 2000 mAh" }).getAttribute("href")) === `/items/${have.id}`, "the hint links to the part on record");
check((await row("Mystery board").locator("[data-similar]").count()) === 0, "a part unlike any other has no hint");
await page.screenshot({ path: `${shots}/x1-fill-in-details.png` });
await hint.getByRole("button", { name: "Add lipo battery 3.7V 2000mAh to LiPo battery 3.7 V 2000 mAh" }).click();
await page.getByText("Added to LiPo battery 3.7 V 2000 mAh").waitFor();
check((await api("GET", `/items/${have.id}`)).totalQty === 6, "Same part: its 2 are added to the 4 on record");
await until(async () => (await row("lipo battery 3.7V 2000mAh").count()) === 0, "the entry that was added in leaves the list");
await page.getByRole("button", { name: "Undo" }).click();
await until(async () => (await api("GET", `/items/${have.id}`)).totalQty === 4 && (await fetch(`${base}/api/items/${again.id}`)).ok, "Undo takes them back out and brings the entry back");

// 3. A shop bag's barcode at capture (DEC-074): read from the photo, the count from the bag, and the duplicate hint.
await page.goto(`${base}/capture?location=${tote.id}`);
await page.locator('input[type="file"]').setInputFiles(`${shots}/bag.png`);
const bag = page.locator("[data-bag-code]");
await bag.waitFor({ timeout: 20000 });
check((await bag.textContent()).includes("Digi-Key 1528-1150-ND (1578)") && (await bag.textContent()).includes("5 in the bag"), "the bag's barcode in the photo is read: " + (await bag.textContent()));
check((await page.getByLabel("How many?").inputValue()) === "5", "the count becomes what the bag shipped with");
await page.screenshot({ path: `${shots}/x2-capture-bag.png`, fullPage: true });
await page.getByRole("button", { name: "Save" }).click();
await page.locator("[data-similar]").waitFor();
check((await page.locator("[data-similar]").textContent()).includes("same part number"), "saved, capture says a part with this number is already on record");
const captured = (await api("GET", "/items/needs-details")).find((i) => i.supplierPn === "1528-1150-ND");
check(!!captured && captured.supplier === "Digi-Key" && captured.totalQty === 5 && captured.similar[0]?.id === have.id, "the part number, shop and count are saved with the part");
await page.screenshot({ path: `${shots}/x3-capture-saved.png`, fullPage: true });
// A typed count wins over the bag's.
await page.locator('input[type="file"]').setInputFiles(`${shots}/bag.png`);
await bag.waitFor({ timeout: 20000 });
await page.getByLabel("How many?").fill("2");
check((await page.getByLabel("How many?").inputValue()) === "2", "a count typed by hand stays");
// And on a photo added to a part that has no part number.
await page.goto(`${base}/items/${board.id}`);
await page.locator('input[type="file"]').first().setInputFiles(`${shots}/bag.png`);
await page.getByText(/Bag barcode read: Digi-Key 1528-1150-ND/).waitFor({ timeout: 20000 });
check((await api("GET", `/items/${board.id}`)).supplierPn === "1528-1150-ND", "a photo added to a part fills its part number from the bag's barcode");

// 4. Tidy names (DEC-076).
await page.goto(`${base}/categories`);
const card = page.locator('[data-category="Batteries"]');
await card.getByRole("button", { name: "Tidy the names in Batteries" }).click();
const dialog = page.locator("[data-tidy-names]");
await dialog.locator("[data-tidy-row]").first().waitFor({ timeout: 20000 });
check((await dialog.locator("[data-tidy-row]").count()) === 1, "only names that would change are listed, and one that invents a number (CR2032) is dropped");
check((await dialog.getByRole("textbox", { name: "New name for nimh AA cells" }).inputValue()) === "NiMH battery AA", "the old name beside the suggested one, editable");
await page.screenshot({ path: `${shots}/x4-tidy-names.png` });
await dialog.getByRole("checkbox", { name: "Rename nimh AA cells" }).uncheck();
check((await dialog.getByRole("button", { name: "Tick the ones to rename" }).isDisabled()) === true, "unticked, nothing would be renamed and the button says so");
await dialog.getByRole("checkbox", { name: "Rename nimh AA cells" }).check();
await dialog.getByRole("textbox", { name: "New name for nimh AA cells" }).fill("NiMH battery AA 1.2 V");
await dialog.getByRole("button", { name: "Rename the 1 ticked part" }).click();
await page.getByText("Renamed 1 part").waitFor();
const names = (await api("GET", "/items")).map((i) => i.name);
check(names.includes("NiMH battery AA 1.2 V") && names.includes("Coin cell") && !names.includes("nimh AA cells"), "the ticked part is renamed to the edited name; the others are untouched");

await browser.close();
server.kill();
fake.close();
