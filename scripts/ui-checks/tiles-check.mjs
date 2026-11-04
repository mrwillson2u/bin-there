// Bin tiles show photos (DEC-036): photo framed in the bin's colour on square tiles (name strip
// when big), thumbnail beside the name on wide tiles, above it on tall ones; names when a bin has
// no photo; and a per-box "Tiles show: Photos / Names" switch.
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
for (const [f, src] of [["a", "testsrc=size=600x600"], ["b", "smptebars=size=600x600"], ["c", "rgbtestsrc=size=600x600"]]) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", src, "-frames:v", "1", `${shots}/${f}.jpg`]);
}
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3001", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const photo = async (itemId, f) => {
  const jpg = readFileSync(`${shots}/${f}.jpg`);
  const form = new FormData();
  form.append("photo", new Blob([jpg], { type: "image/jpeg" }), "p.jpg");
  form.append("thumb", new Blob([jpg], { type: "image/jpeg" }), "t.jpg");
  await fetch(`${base}/api/items/${itemId}/photos`, { method: "POST", body: form });
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const box = await api("POST", "/locations", { name: "Modules", type: "gridded_box", parentId: site.id });
const bin = (binSize, x, y, rotated) => api("POST", "/locations", { type: "bin", parentId: box.id, binSize, slot: { x, y, rotated } });
const [sq, plain, wide, tall, two] = [await bin("1x1", 0, 0), await bin("1x1", 1, 0), await bin("2x1", 2, 0), await bin("2x1", 4, 0, true), await bin("1x1", 0, 1)];
const part = async (name, loc, f) => { const p = await api("POST", "/items", { name, locationId: loc.id, qty: 3 }); if (f) await photo(p.id, f); return p; };
await part("ESP32", sq, "a");
await part("M3 nuts", plain);
await part("Arduino Nano", wide, "b");
await part("LED strip", tall, "c");
await part("Buck converter", two, "b");
await part("Boost converter", two);

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const tile = (p, name) => p.getByRole("button", { name: new RegExp(`, ${name}$`) });
await page.goto(`${base}/locations/${box.id}`);
await page.getByRole("heading", { name: "Modules" }).waitFor();
await page.waitForTimeout(600);

const t1 = tile(page, sq.name);
check((await t1.locator("img").count()) === 1 && (await t1.textContent()).trim() === "", "small square tile on a phone: just the photo");
const tb = await t1.boundingBox(), ib = await t1.locator("img").boundingBox();
check(ib.x - tb.x >= 2 && ib.y - tb.y >= 2, `the bin's colour frames the photo (${Math.round(ib.x - tb.x)} px)`);
check((await tile(page, plain.name).locator("img").count()) === 0 && (await tile(page, plain.name).textContent()).includes("M3 nuts"), "a bin without a photo shows its name");
check((await tile(page, wide.name).locator("img").count()) === 1 && (await tile(page, wide.name).textContent()).includes("Arduino Nano"), "wide tile: thumbnail and name");
const wImg = await tile(page, wide.name).locator("img").boundingBox();
check(Math.abs(wImg.width - wImg.height) < 2, "wide tile's thumbnail is square, beside the name");
check((await tile(page, tall.name).locator("img").count()) === 1 && (await tile(page, tall.name).textContent()).includes("LED strip"), "tall tile: photo above the name");
check((await tile(page, two.name).textContent()).trim() === "+1", "a bin with two parts shows its photo and +1");
await page.screenshot({ path: `${shots}/t1-photos-phone.png` });

// Switch this box to names; it sticks.
await page.getByRole("group", { name: "Tiles show" }).getByRole("button", { name: "Names" }).click();
await page.waitForTimeout(300);
check((await t1.locator("img").count()) === 0 && (await t1.textContent()).includes("ESP32"), "Names: the tile shows ESP32 instead");
await page.screenshot({ path: `${shots}/t2-names-phone.png` });
await page.reload();
await page.getByRole("heading", { name: "Modules" }).waitFor();
check((await page.getByRole("group", { name: "Tiles show" }).getByRole("button", { name: "Names" }).getAttribute("aria-pressed")) === "true", "the box remembers Names");
await page.getByRole("group", { name: "Tiles show" }).getByRole("button", { name: "Photos" }).click();
await page.waitForTimeout(300);

// Desktop: a 1×1 is big enough for a name strip.
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await desk.goto(`${base}/locations/${box.id}`);
await desk.getByRole("heading", { name: "Modules" }).waitFor();
await desk.waitForTimeout(600);
check((await tile(desk, sq.name).locator("img").count()) === 1 && (await tile(desk, sq.name).textContent()).includes("ESP32"), "desktop: 1×1 tile has the photo and a name strip");
const twoText = (await tile(desk, two.name).textContent()).trim();
check(twoText.startsWith("Buck converter") && twoText.endsWith("+1"), "the strip names the part whose photo it shows: " + twoText);
await desk.screenshot({ path: `${shots}/t3-photos-desk.png` });

await browser.close();
server.kill();
