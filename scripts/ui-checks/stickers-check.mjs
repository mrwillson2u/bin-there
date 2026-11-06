// The Stickers screen end to end: Chromium's fake camera plays a video of a small QR
// code (BIN0007), so the real decoder, brackets and tap-to-scan all run.
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
const qr = await zx.writeBarcode("BIN0007", { format: "QRCode", scale: 4 });
writeFileSync(`${shots}/qr.png`, new Uint8Array(await qr.image.arrayBuffer()));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", `${shots}/qr.png`, "-t", "3", "-r", "10",
  "-vf", "scale=110:110:flags=neighbor,pad=640:480:265:185:white,format=yuv420p", `${shots}/qr.y4m`]);

const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3011", DATA_DIR: dataDir }, stdio: "pipe" });
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
const mk = (binSize, slot) => api("POST", "/locations", { type: "bin", parentId: box.id, binSize, slot });
const b1 = await mk("1x1", { x: 0, y: 0 });
const b2 = await mk("1x1", { x: 1, y: 0 });
const b3 = await mk("1x1", { x: 2, y: 0 });
const codeOf = async (b) => (await api("GET", `/locations/${b.id}`)).code;

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ["--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${shots}/qr.y4m`, "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["camera"] });
// Count beeps (oscillators started) and buzzes.
await ctx.addInitScript(() => {
  window.__beeps = [];
  window.__buzz = [];
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...a) { window.__beeps.push(this.frequency.value); return start.apply(this, a); };
  navigator.vibrate = (p) => { window.__buzz.push(p); return true; };
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text()); });
const scan = async (code) => {
  await page.keyboard.down("Control"); await page.keyboard.press("b"); await page.keyboard.up("Control");
  await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press("Enter");
};
const sheet = () => page.getByRole("dialog", { name: "Stickers for Screws box" });
const status = (text) => sheet().getByRole("status").filter({ hasText: text }).waitFor({ timeout: 15000 });
const scanButton = () => sheet().getByRole("button", { name: /Tap a bin first|Aim at|Put |Move |already on|Checking|is on an item/ });
const tile = (name) => sheet().getByRole("button", { name: new RegExp(`^${name}, `) });
const feedback = () => page.evaluate(() => ({ beeps: window.__beeps.slice(), buzz: window.__buzz.slice() }));

// 1. Stickers opens the camera above the grid; brackets go round the code it sees.
await page.goto(`${base}/locations/${box.id}`);
await page.getByRole("button", { name: "Stickers" }).click();
await sheet().waitFor();
await page.locator('[data-seen="BIN0007"][data-target]').waitFor({ timeout: 20000 });
await sheet().getByText("not used yet").waitFor();
check(true, "brackets and 'not used yet' show round the code in view");
check((await scanButton().textContent()).includes("Tap a bin first"), "nothing chosen: the button says to tap a bin");
await page.waitForTimeout(1200);
check((await codeOf(b1)) === null && (await codeOf(b2)) === null, "seeing a code doesn't assign it");
await page.screenshot({ path: `${shots}/s1-stickers.png` });

// 2. Scan with no bin chosen: a 'no' buzz and beep, nothing assigned.
await scanButton().click();
await status("Tap a bin first");
let fb = await feedback();
check(fb.buzz.length === 1 && Array.isArray(fb.buzz[0]) && fb.beeps.length === 2, "refused scan buzzes twice and plays the low double tone: " + JSON.stringify(fb));

// 3. Tap Bin 0002, tap Scan: BIN0007 goes on Bin 0002 with a beep and buzz; the choice clears.
await tile("Bin 0002").click();
await sheet().getByRole("button", { name: "Put BIN0007 on Bin 0002" }).waitFor();
await page.screenshot({ path: `${shots}/s2-chosen.png` });
await sheet().getByRole("button", { name: "Put BIN0007 on Bin 0002" }).click();
await status("BIN0007 is on Bin 0002");
check((await codeOf(b2)) === "BIN0007", "Bin 0002 has BIN0007");
fb = await feedback();
check(fb.buzz.length === 2 && fb.buzz[1] === 50 && fb.beeps.at(-1) === 1760, "successful scan buzzes once and beeps high");
await sheet().getByRole("button", { name: "Move BIN0007 here from Bin 0002" }).waitFor();
check((await sheet().locator("[data-selected]").getByRole("button", { name: /^Bin 0003, / }).count()) === 1, "after a scan the next bin without a sticker (Bin 0003) is chosen for you (DEC-042)");
check((await sheet().getByText("Screws box · 1 of 3 stickered").count()) === 1, "the header counts stickered bins");
await tile("Bin 0003").click();
check((await sheet().locator("[data-selected]").count()) === 0, "tapping the chosen bin unchooses it");

// 4. Pointing at Bin 0002's sticker outlines Bin 0002 and labels the code 'on Bin 0002'.
await sheet().locator('[data-seen="true"]').filter({ has: page.getByRole("button", { name: /^Bin 0002, sticker BIN0007/ }) }).waitFor();
await sheet().getByText("on Bin 0002", { exact: true }).waitFor();
check(true, "the bin that has the aimed-at sticker gets the dashed outline");

// 5. The wrong bin: tap Bin 0003, the button offers to move it; move, then Undo.
await tile("Bin 0003").click();
await sheet().getByRole("button", { name: "Move BIN0007 here from Bin 0002" }).click();
await status("BIN0007 moved from Bin 0002 to Bin 0003");
check((await codeOf(b3)) === "BIN0007" && (await codeOf(b2)) === null, "moved from Bin 0002 to Bin 0003");
await page.screenshot({ path: `${shots}/s3-moved.png` });
await sheet().getByRole("button", { name: "Undo" }).click();
await status("Undone: BIN0007 is back on Bin 0002");
check((await codeOf(b2)) === "BIN0007" && (await codeOf(b3)) === null, "Undo put it back on Bin 0002");

// 6. Tapping the bin that already has it: the button says so and does nothing.
await tile("Bin 0002").click();
await sheet().getByRole("button", { name: "BIN0007 is already on Bin 0002" }).waitFor();
await tile("Bin 0002").click();
check(true, "tapping a chosen bin again unchooses it");

// 7. The hardware scanner (DEC-042): with nothing chosen, the first scan switches to scanner mode
// and chooses the first bin without a sticker; the next scan goes straight on, and the choice moves on.
await scan("BIN0001");
await status("Bin 0001 is chosen: scan again to put BIN0001 on it");
check((await sheet().getByRole("button", { name: "Scanner", exact: true }).getAttribute("aria-pressed")) === "true" && (await page.locator("video").count()) === 0, "a hardware scan switches the screen to scanner mode: camera off, 'next up' panel instead");
await sheet().getByText("Scan the sticker for Bin 0001").waitFor();
await scan("BIN0001");
await status("BIN0001 is on Bin 0001. Next: Bin 0003");
check((await codeOf(b1)) === "BIN0001", "hardware scan with Bin 0001 chosen puts BIN0001 on it");
check((await sheet().locator("[data-selected]").getByRole("button", { name: /^Bin 0003, / }).count()) === 1, "…and Bin 0003, the next without a sticker, is chosen");
await scan("BIN0003");
await status("BIN0003 is on Bin 0003. Every bin has a sticker");
check((await codeOf(b3)) === "BIN0003" && (await sheet().locator("[data-selected]").count()) === 0, "scan, scan: the box is done and nothing is left chosen");
await page.screenshot({ path: `${shots}/s5-scanner-mode.png` });
await sheet().getByRole("button", { name: "Camera", exact: true }).click();
await page.locator("video").waitFor();
check(true, "Camera brings the preview back");
check((await tile("Bin 0001").textContent()).includes("…0001"), "tile shows the end of its code");
await page.screenshot({ path: `${shots}/s4-after.png` });

// 8. Done closes the screen.
await sheet().getByRole("button", { name: "Done" }).click();
await sheet().waitFor({ state: "detached" });
check((await page.locator("video").count()) === 0, "camera is off after Done");

// 8b. Settings (DEC-043, DEC-044): scanning on this device decides what the Stickers screen offers.
await page.goto(`${base}/locations`);
await page.getByRole("link", { name: /Settings: appearance, scanning, beep/ }).click();
await page.getByRole("heading", { name: "Settings" }).waitFor();
const scanning = () => page.getByRole("radiogroup", { name: "Scanning on this device" });
await scanning().getByRole("radio", { name: "Scanner only" }).click();
const b4 = await mk("1x1", { x: 3, y: 0 }); // a bin without a sticker, so the screen has a next one
await page.goto(`${base}/locations/${box.id}`);
check((await page.getByRole("button", { name: /^Scanner ready/ }).count()) === 1 && (await page.getByRole("button", { name: /Scan with camera/ }).count()) === 0 && (await page.getByText("Scan with camera").count()) === 0, "scanner only: the bar's camera button becomes a scanner status and 'Scan with camera' appears nowhere");
await page.getByRole("button", { name: "Stickers" }).click();
await sheet().waitFor();
check((await sheet().getByRole("group", { name: "Scan with" }).count()) === 0 && (await page.locator("video").count()) === 0 && (await sheet().getByText(`Scan the sticker for ${b4.name}`).count()) === 1, "scanner only: Stickers has no camera and no switch, just the scan target");
check((await sheet().getByRole("button", { name: "Scan with camera" }).count()) === 0 && (await sheet().getByText("Pull the scanner's trigger").count()) >= 1, "…and the target says to pull the trigger, with no camera button");
await sheet().getByRole("button", { name: "Done" }).click();
await page.goto(`${base}/settings`);
await scanning().getByRole("radio", { name: "Camera and scanner" }).click();
await page.goto(`${base}/locations/${box.id}`);
await page.getByRole("button", { name: "Stickers" }).click();
await sheet().waitFor();
check((await sheet().getByRole("group", { name: "Scan with" }).count()) === 1 && (await sheet().getByRole("button", { name: "Camera", exact: true }).getAttribute("aria-pressed")) === "true", "camera and scanner: the switch is back, on Camera as last chosen");
await sheet().getByRole("button", { name: "Scanner", exact: true }).click();
await sheet().getByRole("button", { name: "Done" }).click();
await page.getByRole("button", { name: "Stickers" }).click();
await sheet().waitFor();
check((await sheet().getByRole("button", { name: "Scanner", exact: true }).getAttribute("aria-pressed")) === "true" && (await page.locator("video").count()) === 0, "…and it remembers the switch: Scanner next time");
await sheet().getByRole("button", { name: "Camera", exact: true }).click();
await page.locator("video").waitFor();
await sheet().getByRole("button", { name: "Done" }).click();

// 9. The bin pane has no sticker controls; the bin's own page does, and its camera waits for a tap.
await page.getByRole("button", { name: "Bin 0003, empty", exact: true }).click();
const pane = page.getByRole("dialog", { name: "Bin 0003 in Screws box" });
await pane.waitFor();
check((await pane.getByRole("button", { name: /Replace|Scan with camera/ }).count()) === 0, "no sticker button in the bin pane");
await pane.getByRole("link", { name: "Open Bin 0003" }).click();
await page.getByRole("heading", { name: "Bin 0003" }).waitFor();
await page.getByRole("button", { name: /Assign sticker|Replace sticker/ }).click();
await page.getByRole("button", { name: "Scan with camera" }).first().click();
await page.getByRole("button", { name: "Scan BIN0007" }).waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);
check((await page.getByRole("button", { name: "Close camera" }).count()) === 1, "tap-mode camera stays open until Scan is tapped");
await page.screenshot({ path: `${shots}/s6-tap-camera.png` });
await page.getByRole("button", { name: "Scan BIN0007" }).click();
await page.getByRole("alert").waitFor();
check((await page.getByRole("button", { name: "Close camera" }).count()) === 0 && (await codeOf(b3)) === "BIN0003", "Scan closes the camera; BIN0007 is Bin 0002's, so it isn't taken: " + (await page.getByRole("alert").textContent()));

// 10. The bottom-bar camera (looking things up) still takes the first code it sees.
await page.getByRole("button", { name: "Cancel" }).click();
await page.getByRole("button", { name: "Scan with camera" }).first().click();
await page.waitForURL(`${base}/locations/${b2.id}`, { timeout: 20000 });
check(true, "lookup scan opens Bin 0002 without a tap");

// Desktop layout of the Stickers screen.
const desk = await ctx.newPage();
await desk.setViewportSize({ width: 1280, height: 900 });
await desk.goto(`${base}/locations/${box.id}`);
await desk.getByRole("button", { name: "Stickers" }).click();
await desk.locator('[data-seen="BIN0007"][data-target]').waitFor({ timeout: 20000 });
await desk.screenshot({ path: `${shots}/s6-desktop.png` });

await browser.close();
server.kill();
