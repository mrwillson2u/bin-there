// Where a part is, told as directions (DEC-038): the part page's place card lists the walk with
// the place you go to in bold, a rack's level in words and as a thin stack, the box as a small
// map with this bin the only one in colour, the bin's spot in words, and its number last and
// small. Tapping the map opens the box with that bin outlined. A bin's own page shows the same.
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
const weight = (loc) => loc.evaluate((e) => Number(getComputedStyle(e).fontWeight));
const fontPx = (loc) => loc.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));

// Garage › Grid-Box Rack (3 levels) › level 3 · Grid box 3 › a red 1×1 on the front row, 2nd from the left.
const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const rack = await api("POST", "/locations", { name: "Grid-Box Rack", type: "rack", parentId: site.id, rackSize: 3 });
const box = await api("POST", "/locations", { name: "Grid box 3", type: "gridded_box", parentId: rack.id, rackSlot: 2 });
const bin = (binSize, x, y, rotated = false) => api("POST", "/locations", { type: "bin", parentId: box.id, binSize, slot: { x, y, rotated } });
await bin("2x1", 0, 0); await bin("2x1", 2, 0); await bin("1x1", 0, 3); await bin("2x2", 4, 2); await bin("front_strip", 0, 4);
const here = await bin("1x1", 1, 3);
const nine = await api("POST", "/items", { name: "9V connector", locationId: here.id, tracking: "level", level: "low" });
// A tote on the rack: no map to draw.
const tote = await api("POST", "/locations", { name: "Tote A", type: "tote", parentId: rack.id, rackSlot: 0 });
const fuses = await api("POST", "/items", { name: "Spare fuses", locationId: tote.id, qty: 5 });
// A big rack: too many levels to draw, so it reads "level 7 of 25".
const big = await api("POST", "/locations", { name: "Big rack", type: "rack", parentId: site.id, rackSize: 25 });
const bigBox = await api("POST", "/locations", { name: "Relay box", type: "gridded_box", parentId: big.id, rackSlot: 6 });
const bigBin = await api("POST", "/locations", { type: "bin", parentId: bigBox.id, binSize: "2x1", slot: { x: 5, y: 1, rotated: true } });
const relay = await api("POST", "/items", { name: "Relay module", locationId: bigBin.id, qty: 2 });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

// The part page: the walk as lines, bold on the box, the map, the words, the number last.
await page.goto(`${base}/items/${nine.id}`);
await page.getByRole("heading", { name: "9V connector" }).waitFor();
const map = page.getByRole("img", { name: /^Map of Grid box 3/ });
await map.waitFor();
check((await map.getAttribute("aria-label")) === "Map of Grid box 3: Red 1×1 bin, front row, 2nd from the left", "the map says where the bin is: " + (await map.getAttribute("aria-label")));
check((await page.getByText("Red 1×1 bin, front row, 2nd from the left").count()) === 1, "the bin's spot is written beside the map");
const rackLine = page.getByRole("link", { name: "Grid-Box Rack", exact: true });
check((await rackLine.count()) === 1 && (await page.getByText("level 3 of 3", { exact: true }).count()) === 1, "the rack stop says its level in words");
const stops = await page.locator("[data-stop]").evaluateAll((els) => els.map((e) => e.dataset.stop));
check(stops.join(",") === "1,2,3,here", "the walk is a numbered route: site, rack, box, then the bin as the dot (" + stops.join(",") + ")");
const route = page.getByRole("list", { name: "How to get there" });
const stopX = await route.locator("[data-stop] > span[aria-hidden]:first-child").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
check(new Set(stopX).size <= 2 && Math.max(...stopX) - Math.min(...stopX) <= 6, "the stops line up down the left (" + stopX.join(",") + ")");
check((await page.getByRole("img", { name: "level 3 of 3 in Grid-Box Rack" }).count()) === 1, "a thin stack shows the rack's levels with the right one filled");
const boxLine = page.getByRole("link", { name: "Grid box 3", exact: true });
check((await weight(boxLine)) >= 600, `the box, the place you walk to, is the bold line (weight ${await weight(boxLine)})`);
check((await weight(rackLine)) < 600 && (await fontPx(rackLine)) < (await fontPx(boxLine)), "the rack line is lighter and smaller than the box line");
check((await page.getByRole("link", { name: "Garage", exact: true }).count()) === 1, "the site is the first stop");
const number = page.getByText(here.name, { exact: true });
check((await number.count()) === 1 && (await weight(number)) < 600 && (await fontPx(number)) < (await fontPx(boxLine)), "the bin's number is there, but small and not bold");
const tiles = map.locator("span");
check((await tiles.count()) === 6 && (await map.locator("[data-here]").count()) === 1, "every bin is on the map and exactly one is marked");
const hereTile = map.locator("[data-here]");
const [mb, hb] = [await map.boundingBox(), await hereTile.boundingBox()];
check(hb.x > mb.x + mb.width * 0.1 && hb.x < mb.x + mb.width * 0.3 && hb.y > mb.y + mb.height * 0.55, `the marked bin sits where it is on the real grid (${Math.round(hb.x - mb.x)},${Math.round(hb.y - mb.y)} px in)`);
const colors = await hereTile.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e.previousElementSibling).backgroundColor]);
check(colors[0] !== colors[1] && colors[0].startsWith("rgb(239") && / 0\.25\)$/.test(colors[1]), `the marked bin is red and the others are faint grey (${colors.join(" vs ")})`);
await page.screenshot({ path: `${shots}/w1-part-phone.png` });

// Tapping the map opens the box with that bin outlined.
await page.getByRole("link", { name: `Open Grid box 3 with ${here.name} marked` }).click();
await page.getByRole("heading", { name: "Grid box 3" }).waitFor();
check(page.url().includes(`bin=${here.id}`), "the map opens the box's page: " + page.url());
check((await page.locator("[data-selected]").getByRole("button", { name: `9V connector, ${here.name}` }).count()) === 1 && (await page.locator("[data-selected]").count()) === 1, "the bin is outlined on the grid, and only it");
await page.screenshot({ path: `${shots}/w2-box-marked.png` });

// A bin's own page shows the same directions (no number: the heading is the number).
await page.goto(`${base}/locations/${here.id}`);
await page.getByRole("heading", { name: here.name }).waitFor();
await page.getByRole("img", { name: /^Map of Grid box 3/ }).waitFor();
check((await page.getByText("Red 1×1 bin, front row, 2nd from the left").count()) === 1 && (await page.getByText(here.name, { exact: true }).count()) === 1, "the bin's page has the map and words, and its number only once (the heading)");
await page.screenshot({ path: `${shots}/w3-bin-page.png` });

// A part in a tote: lines only, the tote bold, no map.
await page.goto(`${base}/items/${fuses.id}`);
await page.getByRole("heading", { name: "Spare fuses" }).waitFor();
await page.getByRole("link", { name: "Tote A", exact: true }).waitFor();
check((await page.getByRole("img", { name: /^Map of/ }).count()) === 0 && (await weight(page.getByRole("link", { name: "Tote A", exact: true }))) >= 600, "a tote: no map, the tote is the bold line");
check((await page.getByText("level 1 of 3", { exact: true }).count()) === 1, "its rack stop says level 1 of 3");
check((await page.locator("[data-stop]").evaluateAll((els) => els.map((e) => e.dataset.stop))).join(",") === "1,2,here", "a tote is a three-stop route ending in a dot");

// A big rack: words instead of a stack; a tall 2×1 on the far right.
await page.goto(`${base}/items/${relay.id}`);
await page.getByRole("heading", { name: "Relay module" }).waitFor();
await page.getByText("level 7 of 25", { exact: true }).waitFor();
check((await page.getByRole("img", { name: /in Big rack$/ }).count()) === 0, "25 levels are too many to draw: it says 'level 7 of 25' instead");
check((await page.getByText("Yellow 2×1 bin, 3rd row from the front, far right").count()) === 1, "a tall 2×1 at the right edge is described by its left column and row");
const relayMap = page.getByRole("img", { name: /^Map of Relay box/ });
const rb = await relayMap.locator("[data-here]").boundingBox();
check(rb.height > rb.width * 1.6, "the tall 2×1 is drawn tall on the map");
await page.screenshot({ path: `${shots}/w4-big-rack.png` });

// Desktop: the card keeps the map beside the words.
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await desk.goto(`${base}/items/${nine.id}`);
await desk.getByRole("heading", { name: "9V connector" }).waitFor();
const dm = desk.getByRole("img", { name: /^Map of Grid box 3/ });
await dm.waitFor();
const [dmb, dwb] = [await dm.boundingBox(), await desk.getByText("Red 1×1 bin, front row, 2nd from the left").boundingBox()];
check(dwb.y >= dmb.y + dmb.height - 2 && dmb.width >= 140, "desktop: the map hangs off the box's stop and the bin's words are the next stop");
await desk.screenshot({ path: `${shots}/w5-part-desk.png` });

await browser.close();
server.kill();
