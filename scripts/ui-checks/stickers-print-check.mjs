// Print stickers (DEC-052): the screen makes a PDF for a die-cut sheet and a PNG for the Cricut,
// with fresh codes that aren't on anything; the PNG's codes really scan; a used code is swapped.
// usage: node scripts/ui-checks/stickers-print-check.mjs <app dir> <empty data dir> <screenshots dir>
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
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
const { PDFDocument } = require("pdf-lib");
const { readBarcodes } = require("zxing-wasm/reader");
const { readFileSync, mkdirSync } = await import("node:fs");
const [, , app, dataDir, shots] = process.argv;
mkdirSync(shots, { recursive: true });
const base = "http://127.0.0.1:3011";
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3011", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };
const CODE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/;

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
await api("POST", "/locations", { name: "Tote", type: "tote", parentId: site.id, code: "EddY9xhVRwAg" });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

// Reached from Locations.
await page.goto(`${base}/locations`);
await page.getByRole("link", { name: "Print stickers" }).click();
await page.getByRole("heading", { name: "Print stickers" }).waitFor();
check((await page.getByRole("button", { name: /Sticker vinyl, Cricut/ }).getAttribute("aria-pressed")) === "true", "the Cricut vinyl is the first choice");
check((await page.getByText("42 per sheet").count()) === 1, "SL588 re-gridded for the 6.75 × 9.25 in cut area: 42 per sheet");
// A bigger cut area (a newer machine, from Cricut's page) fits more; it's remembered on the device.
await page.getByLabel("Cut area width (in)").fill("7.44");
await page.getByLabel("Cut area height (in)").fill("9.94");
check((await page.getByText("45 per sheet").count()) === 1, "7.44 × 9.94 in fits 45");
await page.reload();
await page.getByRole("heading", { name: "Print stickers" }).waitFor();
check((await page.getByText("45 per sheet").count()) === 1, "the cut area is remembered");
await page.getByLabel("Cut area width (in)").fill("6.75");
await page.getByLabel("Cut area height (in)").fill("9.25");
check((await page.getByText("42 per sheet").count()) === 1, "back to 42");
const preview = page.locator("img[data-preview]");
check((await preview.getAttribute("src")).startsWith("data:image/svg+xml"), "a preview of the sheet is drawn");
await page.screenshot({ path: `${shots}/st1-cricut.png`, fullPage: true });

// The Cricut PNG: one download, 300 dpi of a 6 × 8.94 in image, transparent, and its codes scan.
let dl = page.waitForEvent("download");
await page.getByRole("button", { name: "Make the PNG" }).click();
const png = await dl;
check(/^stickers-SL588-cricut-\d{4}-\d{2}-\d{2}\.png$/.test(png.suggestedFilename()), "the PNG is named for the sheet and the day: " + png.suggestedFilename());
const pngPath = `${shots}/${png.suggestedFilename()}`;
await png.saveAs(pngPath);
const pngBytes = readFileSync(pngPath);
const dims = { w: pngBytes.readUInt32BE(16), h: pngBytes.readUInt32BE(20), colour: pngBytes[25] };
check(dims.w === 1688 && dims.h === 2625 && dims.colour === 6, `the PNG is 1688 × 2625 px (5.625 × 8.75 in at 300 dpi) with an alpha channel: ${JSON.stringify(dims)}`);
const found = await readBarcodes(new Blob([pngBytes]), { formats: ["QRCode"], maxNumberOfSymbols: 60 });
const codes = found.map((r) => r.text);
check(codes.length === 42 && codes.every((c) => CODE.test(c)) && new Set(codes).size === codes.length, `the PNG's codes scan: ${codes.length} found, all 12-character codes, all different`);
const scan = await api("GET", `/scan/${codes[0]}`);
check(scan.kind === "unassigned", "a printed code isn't on anything yet: " + scan.kind);
await page.locator("[data-done]").waitFor();
check((await page.getByText("W 5.63 in × H 8.75 in").count()) === 1, "the size to type into Design Space is shown");
await page.screenshot({ path: `${shots}/st2-cricut-done.png`, fullPage: true });

// The die-cut sheet PDF: two sheets, ten skipped, Letter pages.
await page.getByRole("button", { name: /Die-cut sheet/ }).click();
check((await page.getByText("76 per sheet").count()) === 1, "SL588 as a sheet: 76 per sheet");
await page.getByLabel("Sheets").fill("2");
await page.getByLabel("Skip used labels").fill("10");
check((await page.getByText("142 stickers").count()) === 1, "two sheets less ten skipped is 142");
await page.getByLabel("Title", { exact: true }).fill("Workshop");
dl = page.waitForEvent("download");
await page.getByRole("button", { name: "Make the PDF" }).click();
const pdf = await dl;
check(/^stickers-SL588-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.suggestedFilename()), "the PDF is named for the sheet and the day");
const pdfPath = `${shots}/${pdf.suggestedFilename()}`;
await pdf.saveAs(pdfPath);
const doc = await PDFDocument.load(readFileSync(pdfPath));
const sizes = doc.getPages().map((p) => [Math.round(p.getWidth()), Math.round(p.getHeight())]);
check(JSON.stringify(sizes) === "[[612,792],[612,792]]", "two Letter pages: " + JSON.stringify(sizes));
check((await page.getByText("142 stickers on 2 sheets").count()) === 1, "142 stickers on 2 sheets, says the page");
await page.screenshot({ path: `${shots}/st3-sheet-done.png`, fullPage: true });

// A used code is swapped for a fresh one: every check call that returns a used code gets a new batch.
const used = await api("POST", "/stickers/check", { codes: ["EddY9xhVRwAg", "zzzzzzzzzzzz"] });
check(JSON.stringify(used.used) === '["EddY9xhVRwAg"]', "the server says which codes are taken");

// Phone layout.
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}/stickers/print`);
await page.getByRole("heading", { name: "Print stickers" }).waitFor();
await page.screenshot({ path: `${shots}/st4-phone.png`, fullPage: true });
check((await page.locator("img[data-preview]").boundingBox()).width > 300, "the preview fills the phone's width");

await browser.close();
server.kill();
