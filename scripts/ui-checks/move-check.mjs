// The one Move sheet (DEC-067): every move on a part's page (and the bin sheet) opens the same sheet,
// which asks what's moving, then where, and says exactly what will happen on its button. Covers the
// case that started it (seven stickered batteries with no place and an empty "not counted" entry),
// moving from one unit's row with a scanned sticker ticking another, some of a count, some of an
// uncounted part, a part with no place at all, Undo, and the part's ID by its name.
// usage: node scripts/ui-checks/move-check.mjs <app dir> <empty data dir> <screenshots dir>
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
const { mkdirSync } = await import("node:fs");
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

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const tote = await api("POST", "/locations", { name: "Nano Tote", type: "tote", parentId: site.id, code: "NANO01" });
const bench = await api("POST", "/locations", { name: "Workbench", type: "shelf", parentId: site.id, code: "BENCH1" });
// Colin's batteries: captured with no place, seven stickers added from the part's page, then the old
// "Add another place" made an empty, uncounted entry in the tote and left the stickered ones nowhere.
const pack = await api("POST", "/items", { name: "LiPo battery 3.7 V 2000 mAh", code: "BAT001" });
for (const c of ["BAT002", "BAT003", "BAT004", "BAT005", "BAT006", "BAT007"]) await api("POST", "/units", { itemId: pack.id, code: c });
await api("POST", "/stock/recount", { itemId: pack.id, locationId: tote.id, qty: null });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text()); });
const scan = async (code) => {
  await page.keyboard.down("Control"); await page.keyboard.press("b"); await page.keyboard.up("Control");
  await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press("Enter");
};
const toast = (text) => page.getByRole("status").filter({ hasText: text });
const sheet = () => page.getByRole("dialog");
const checked = async (name) => (await sheet().getByRole("radio", { name }).getAttribute("aria-checked")) === "true";
const moveButton = () => sheet().getByRole("button", { name: /^Move .+ to / });

// The part's page: its ID by the name, "No place yet" saying seven aren't anywhere, Move… on every row.
await page.goto(`${base}/items/${pack.id}`);
await page.locator("[data-no-place]").waitFor();
check((await page.locator("[data-part-id]").textContent()).trim() === `ID ${pack.id}`, "the part's ID sits by its name");
check((await page.locator("[data-no-place]").textContent()).includes("7 stickered ones aren't anywhere"), "No place yet says seven stickered ones aren't anywhere");
check((await page.getByText("No place yet", { exact: true }).count()) >= 7, "each unit's row says No place yet");
check((await page.getByRole("button", { name: /^Move BAT00\d$/ }).count()) === 7 && (await page.getByRole("button", { name: "Move BAT003", exact: true }).textContent()).trim() === "Move…", "every unit's row has a worded Move…");
check((await page.getByRole("button", { name: /Add another place/ }).count()) === 0, "no Add another place: Move covers it");

// From No place yet: all seven start ticked; the button waits for a place, then says it all.
await page.getByRole("button", { name: "Move: no place yet" }).click();
await sheet().waitFor();
check(await checked(/^All 7 stickered ones/), "all seven start ticked");
check((await sheet().getByRole("radio", { name: /^Pick which/ }).count()) === 1, "Pick which is offered too");
check((await sheet().getByRole("radio", { name: /^Everything it has/ }).count()) === 0, "the empty entry isn't counted as a second place: no Everything");
check((await sheet().getByRole("checkbox").count()) === 0, "the pick list stays closed until Pick which is chosen");
check((await moveButton().textContent()).trim() === "Move 7 to …" && (await moveButton().isDisabled()), "the button says what's moving and waits for where");
await scan("NANO01");
await sheet().locator("[data-move-to]").waitFor();
check((await moveButton().textContent()).trim() === "Move 7 to Nano Tote" && !(await moveButton().isDisabled()), "scanning the tote: Move 7 to Nano Tote");
await page.screenshot({ path: `${shots}/move-1-sheet.png` });
await moveButton().click();
await toast("Moved 7 to Nano Tote").waitFor();
let detail = await api("GET", `/items/${pack.id}`);
check(detail.places.length === 1 && detail.places[0].locationId === tote.id && detail.places[0].units === 7 && !detail.places[0].hasStock && detail.places[0].isHome, "all seven are in the tote, which is home, and the empty count is gone");
check(detail.unitList.every((u) => u.locationId === tote.id), "every unit is there");
await page.locator("[data-no-place]").waitFor({ state: "detached" });
check((await page.getByText("7 stickered").count()) >= 1, "the tote's card says 7 stickered");
await page.screenshot({ path: `${shots}/move-2-placed.png`, fullPage: true });
// Undo puts it all back, empty entry and all.
await toast("Moved 7 to Nano Tote").getByRole("button", { name: "Undo" }).click();
await page.locator("[data-no-place]").waitFor();
detail = await api("GET", `/items/${pack.id}`);
check(detail.unitList.every((u) => u.locationId === null) && detail.places[0].hasStock && detail.places[0].qty === null, "Undo puts them back where they were");
await api("POST", "/units/move", { unitIds: detail.unitList.map((u) => u.id), toLocationId: tote.id });

// From one unit's row: just that one starts ticked; scanning another's sticker switches to Pick which with both.
await page.goto(`${base}/items/${pack.id}`);
await page.getByRole("button", { name: "Move BAT003", exact: true }).click();
await sheet().waitFor();
check(await checked(/^Just this one BAT003/), "from a unit's row, just that one starts ticked");
check((await sheet().getByRole("radio", { name: /^All 7 stickered ones/ }).count()) === 1, "and All 7 is still there");
check((await moveButton().textContent()).trim() === "Move 1 to …", "Move 1 to …");
await scan("BAT004");
await page.waitForTimeout(300);
check(await checked(/^Pick which/), "scanning another unit's sticker switches to Pick which");
check((await sheet().getByRole("checkbox", { name: "Move BAT003" }).isChecked()) && (await sheet().getByRole("checkbox", { name: "Move BAT004" }).isChecked()) && !(await sheet().getByRole("checkbox", { name: "Move BAT005" }).isChecked()), "with that one and the scanned one ticked");
await sheet().getByRole("button", { name: "Pick from list" }).click();
await sheet().getByRole("button", { name: /Workbench/ }).first().click();
await sheet().getByRole("button", { name: "Choose Workbench" }).click();
check((await moveButton().textContent()).trim() === "Move 2 to Workbench", "picked from the list: Move 2 to Workbench");
await page.screenshot({ path: `${shots}/move-3-pick-which.png` });
await moveButton().click();
await toast("Moved 2 to Workbench").waitFor();
detail = await api("GET", `/items/${pack.id}`);
const at = (code) => detail.unitList.find((u) => u.code === code).locationId;
check(at("BAT003") === bench.id && at("BAT004") === bench.id && at("BAT005") === tote.id, "just those two went to the workbench");
// Now in two places: Everything offers to bring them together in one step.
await page.getByRole("button", { name: "Move: Workbench" }).click();
await sheet().waitFor();
check(await checked(/^All 2 in Workbench/), "from the workbench: All 2 in Workbench starts ticked");
await sheet().getByRole("radio", { name: /^Everything it has · from both places/ }).click();
await scan("NANO01");
await sheet().locator("[data-move-to]").waitFor();
check((await moveButton().textContent()).trim() === "Move everything to Nano Tote", "Everything: Move everything to Nano Tote");
await moveButton().click();
await toast("Moved everything to Nano Tote").waitFor();
detail = await api("GET", `/items/${pack.id}`);
check(detail.unitList.every((u) => u.locationId === tote.id) && detail.places.length === 1 && !detail.places[0].hasStock, "all seven back in the tote, no empty entry made");

// A counted part: some of a count.
const screws = await api("POST", "/items", { name: "Socket cap screw M3 × 10", locationId: tote.id, qty: 40 });
await page.goto(`${base}/items/${screws.id}`);
await page.getByRole("button", { name: "Move: Nano Tote" }).click();
await sheet().waitFor();
check(await checked(/^All 40 from Nano Tote/), "a counted part: All 40 from Nano Tote starts ticked");
await sheet().getByLabel("How many to move").fill("10");
check(await checked(/^Some/), "typing a number picks Some");
await scan("BENCH1");
await sheet().locator("[data-move-to]").waitFor();
check((await moveButton().textContent()).trim() === "Move 10 to Workbench", "Move 10 to Workbench");
await page.screenshot({ path: `${shots}/move-4-some.png` });
await moveButton().click();
await toast("Moved 10 to Workbench").waitFor();
const screwPlaces = (await api("GET", `/items/${screws.id}`)).places;
check(screwPlaces.find((p) => p.locationId === tote.id)?.qty === 30 && screwPlaces.find((p) => p.locationId === bench.id)?.qty === 10, "30 stay, 10 went");

// An uncounted part: some of it means it's in both places.
const ties = await api("POST", "/items", { name: "Zip ties", locationId: tote.id });
await page.goto(`${base}/items/${ties.id}`);
await page.getByRole("button", { name: "Move: Nano Tote" }).click();
await sheet().getByRole("radio", { name: /^Some of it/ }).click();
await scan("BENCH1");
await sheet().locator("[data-move-to]").waitFor();
check((await moveButton().textContent()).trim() === "Move some to Workbench", "uncounted: Move some to Workbench");
await moveButton().click();
await toast("Moved some to Workbench").waitFor();
check((await api("GET", `/items/${ties.id}`)).places.length === 2, "it's in both places");

// A part with no place at all: Move from No place yet puts it somewhere.
const loose = await api("POST", "/items", { name: "Mystery part" });
await page.goto(`${base}/items/${loose.id}`);
check((await page.locator("[data-no-place]").textContent()).includes("It isn't in any place yet"), "a part with no place says so");
await page.getByRole("button", { name: "Move: no place yet" }).click();
check(await checked(/^All of it/), "All of it starts ticked");
await scan("NANO01");
await sheet().locator("[data-move-to]").waitFor();
check((await moveButton().textContent()).trim() === "Move all of it to Nano Tote", "Move all of it to Nano Tote");
await moveButton().click();
await toast("Moved all of it to Nano Tote").waitFor();
check((await api("GET", `/items/${loose.id}`)).places.map((p) => p.locationId).join() === String(tote.id), "it's in the tote");

// Scanning to choose: the prompt says a scan picks the ones to move too; Pick which starts empty;
// a sticker scanned while All is chosen starts a selection of just that one.
await page.goto(`${base}/items/${pack.id}`);
await page.getByRole("button", { name: "Move: Nano Tote" }).click();
await sheet().waitFor();
check((await sheet().getByText("Scan where they're going, or scan the ones you want to move").count()) === 1, "the prompt says scanning picks the ones to move too");
await sheet().getByRole("radio", { name: /^Pick which/ }).click();
check((await sheet().getByRole("checkbox", { checked: true }).count()) === 0, "Pick which starts with none ticked");
check((await sheet().getByRole("button", { name: "Tick or scan the ones to move" }).isDisabled()), "with none ticked the button says to tick or scan them");
await sheet().getByRole("radio", { name: /^All 7 stickered ones/ }).click();
await scan("BAT005");
await page.waitForTimeout(300);
check(await checked(/^Pick which/), "a sticker scanned while All is chosen switches to Pick which");
check((await sheet().getByRole("checkbox", { checked: true }).count()) === 1 && (await sheet().getByRole("checkbox", { name: "Move BAT005" }).isChecked()), "with just the scanned one ticked");
await scan("BAT006");
await page.waitForTimeout(300);
check((await sheet().getByRole("checkbox", { checked: true }).count()) === 2, "a second scan adds to it");
await scan("BAT006");
await page.waitForTimeout(300);
check((await sheet().getByRole("checkbox", { checked: true }).count()) === 2, "scanning the same one again doesn't untick it");
check((await moveButton().textContent()).trim() === "Move 2 to …", "Move 2 to …");
await page.screenshot({ path: `${shots}/move-6-scan-to-pick.png` });
await page.keyboard.press("Escape");
await sheet().waitFor({ state: "detached" });

// The same sheet on a computer: a centred panel.
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${base}/items/${pack.id}`);
await page.getByRole("button", { name: "Move: Nano Tote" }).click();
await sheet().waitFor();
await page.screenshot({ path: `${shots}/move-5-desktop.png` });
await page.keyboard.press("Escape");
await sheet().waitFor({ state: "detached" });
check(true, "Escape closes the sheet");

await browser.close();
server.kill();
