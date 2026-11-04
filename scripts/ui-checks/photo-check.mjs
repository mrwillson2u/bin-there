// Square photos (DEC-030): an upload gets a square thumbnail from its centre, the part's page
// shows the square, and "Adjust crop" moves and zooms it, keeping the original.
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
// A tall photo like the iPhone's (3:4), 900 × 1200.
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=900x1200", "-frames:v", "1", `${shots}/tall.jpg`]);
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3001", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const tote = await api("POST", "/locations", { name: "Tote", type: "tote", parentId: site.id });
const part = await api("POST", "/items", { name: "JST lead", locationId: tote.id, qty: 5 });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const size = (url) => page.evaluate((u) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.src = u; }), url);

// 1. Take a photo on the part's page.
await page.goto(`${base}/items/${part.id}`);
await page.locator('input[type="file"]').setInputFiles(`${shots}/tall.jpg`);
await page.getByRole("button", { name: "Adjust crop" }).waitFor();
let item = await api("GET", `/items/${part.id}`);
check(JSON.stringify(await size(item.photos[0].url)) === "[900,1200]", "the original keeps its shape (900 × 1200)");
check(JSON.stringify(await size(item.thumbUrl)) === "[360,360]", "the thumbnail is a 360 px square from the centre");
const frame = await page.getByRole("link", { name: "Open the whole photo" }).boundingBox();
check(Math.abs(frame.width - frame.height) < 1, `the part's page shows a square (${Math.round(frame.width)} × ${Math.round(frame.height)})`);
await page.screenshot({ path: `${shots}/c1-part.png` });

// 2. Adjust: zoom in, drag the square to the top-left corner, save.
await page.getByRole("button", { name: "Adjust crop" }).click();
const editor = page.getByRole("dialog", { name: "Crop the photo" });
const square = editor.getByRole("slider", { name: "Crop square" });
await square.waitFor();
await editor.getByLabel("Zoom").fill("65");
const b = await square.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(b.x + b.width / 2 - i * 60, b.y + b.height / 2 - i * 60);
await page.mouse.up();
await page.screenshot({ path: `${shots}/c2-editor.png` });
const oldThumb = item.thumbUrl;
await editor.getByRole("button", { name: "Save crop" }).click();
await page.getByRole("status").filter({ hasText: "Crop saved" }).waitFor();
item = await api("GET", `/items/${part.id}`);
const c = item.photos[0].crop;
check(c && c.x === 0 && c.y === 0 && c.size > 0.45 && c.size < 0.55, "crop saved at the top-left, about half the width: " + JSON.stringify(c));
check(item.thumbUrl !== oldThumb, "a new thumbnail, under a new name");
const t = await size(item.thumbUrl);
check(t[0] === t[1] && t[0] <= 360, `still a square thumbnail (${t.join(" × ")})`);
check(JSON.stringify(await size(item.photos[0].url)) === "[900,1200]", "the original is untouched");
await page.waitForTimeout(400);
await page.screenshot({ path: `${shots}/c3-part-cropped.png` });

// 3. Centre puts it back in the middle.
await page.getByRole("button", { name: "Adjust crop" }).click();
await editor.getByRole("button", { name: "Centre" }).click();
await editor.getByRole("button", { name: "Save crop" }).click();
await editor.waitFor({ state: "detached" });
item = await api("GET", `/items/${part.id}`);
const m = item.photos[0].crop;
check(m && Math.abs(m.x) < 0.001 && Math.abs(m.y - 0.125) < 0.001 && m.size === 1, "Centre: full width, middle of the photo: " + JSON.stringify(m));

// 4. Inventory tiles use the square thumbnail.
await page.goto(`${base}/`);
await page.getByRole("button", { name: "Tile view" }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}/c4-tiles.png` });

// 5. Desktop: the editor in the middle of the screen.
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await desk.goto(`${base}/items/${part.id}`);
await desk.getByRole("button", { name: "Adjust crop" }).click();
await desk.getByRole("slider", { name: "Crop square" }).waitFor();
const db = await desk.getByRole("dialog", { name: "Crop the photo" }).boundingBox();
check(db.y + db.height <= 860 && db.y >= 0, "desktop: the editor fits on screen");
await desk.screenshot({ path: `${shots}/c5-desk-editor.png` });

await browser.close();
server.kill();
