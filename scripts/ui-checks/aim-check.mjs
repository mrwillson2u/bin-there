// The camera takes only the sticker on the aim mark (DEC-095). Chromium's fake camera plays a
// video: first with one sticker near the top of the view (outside the white corners), which must
// not be taken; then with that one and a second in the middle, where the middle one is taken.
import { createRequire } from "node:module";
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
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

const zx = await import(require.resolve("zxing-wasm/full", { paths: [app] }));
for (const code of ["BOXABOVE", "BOXAIMED"]) {
  const qr = await zx.writeBarcode(code, { format: "QRCode", scale: 4 });
  writeFileSync(`${shots}/${code}.png`, new Uint8Array(await qr.image.arrayBuffer()));
}
// A 640 x 480 frame. The phone's view shows its middle; the aim square is about 156 px there.
const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args]);
ff(["-loop", "1", "-i", `${shots}/BOXABOVE.png`, "-t", "3", "-r", "10", "-vf", "scale=110:110:flags=neighbor,pad=640:480:265:15:white,format=yuv420p", `${shots}/above.y4m`]);
ff(["-loop", "1", "-i", `${shots}/BOXABOVE.png`, "-loop", "1", "-i", `${shots}/BOXAIMED.png`, "-t", "3", "-r", "10", "-filter_complex",
  "[0]scale=110:110:flags=neighbor,pad=640:480:265:15:white[a];[1]scale=90:90:flags=neighbor[b];[a][b]overlay=275:195,format=yuv420p", `${shots}/both.y4m`]);

const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3011", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const above = await api("POST", "/locations", { name: "Box above", type: "gridded_box", parentId: site.id, code: "BOXABOVE" });
const aimed = await api("POST", "/locations", { name: "Box aimed at", type: "gridded_box", parentId: site.id, code: "BOXAIMED" });

const open = async (video) => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME,
    args: ["--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${shots}/${video}`, "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  await page.goto(`${base}/`);
  await page.getByRole("button", { name: /^Scan with camera/ }).filter({ visible: true }).first().click();
  return { browser, page };
};

// 1. Only the box above is in view, outside the white corners: it gets brackets, but it isn't taken.
{
  const { browser, page } = await open("above.y4m");
  await page.locator('[data-seen="BOXABOVE"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  check((await page.getByLabel("Close camera").count()) === 1 && new URL(page.url()).pathname === "/", "a sticker outside the white corners is seen but not taken: the camera stays open");
  await page.screenshot({ path: `${shots}/aim-1-above.png` });
  await browser.close();
}

// 2. Both in view, the smaller one in the middle: the one in the corners is the one opened.
{
  const { browser, page } = await open("both.y4m");
  await page.waitForURL(/\/locations\/\d+/, { timeout: 15000 });
  check(new URL(page.url()).pathname === `/locations/${aimed.id}`, `with the box above also in view, the sticker in the white corners is the one opened (not ${above.name})`);
  await page.screenshot({ path: `${shots}/aim-2-opened.png` });
  await browser.close();
}
server.kill();
