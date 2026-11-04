// Taking a bin out of its box (DEC-028): to a project kit or with a note, its spot kept
// on the grid (grey and striped), shown on the kit and on the part, and put back by a tap
// or a scan in put-back.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
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
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3001", DATA_DIR: dataDir }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const rack = await api("POST", "/locations", { name: "Rack A", type: "rack", parentId: site.id });
const box = await api("POST", "/locations", { name: "Grid box 1", type: "gridded_box", parentId: rack.id });
const b1 = await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", code: "BIN0001", slot: { x: 0, y: 0 } });
const b2 = await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "2x1", code: "BIN0002", slot: { x: 1, y: 0 } });
await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", slot: { x: 3, y: 0 } });
await api("POST", "/items", { name: "M3 nuts", locationId: b1.id, qty: 50 });
await api("POST", "/items", { name: "Heat shrink", locationId: b2.id, tracking: "level", level: "plenty" });
const kit = await api("POST", "/locations", { name: "Weather station", type: "project", parentId: site.id });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const toast = (text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 8000 });
const scan = async (code) => {
  await page.keyboard.down("Control"); await page.keyboard.press("b"); await page.keyboard.up("Control");
  await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press("Enter");
};

// 1. From the box: tap the bin, Take out, tap the kit.
await page.goto(`${base}/locations/${box.id}`);
await page.getByRole("button", { name: "M3 nuts, Bin 0001" }).click();
const pane = page.getByRole("dialog", { name: "Bin 0001 in Grid box 1" });
await pane.getByRole("button", { name: "Take out" }).click();
await pane.getByRole("group", { name: "Take Bin 0001 out" }).waitFor();
check(await pane.getByText("Its spot in the box stays saved").isVisible(), "the form says the spot stays saved");
await page.screenshot({ path: `${shots}/t1-take-out-form.png` });
await pane.getByRole("button", { name: "Weather station" }).click();
await toast("Bin 0001 taken out to Weather station");
check(true, "one tap on the kit takes it out");

// 2. The pane says where it is, with Put it back.
await pane.getByRole("group", { name: "Bin 0001 is out" }).waitFor();
check((await pane.getByRole("link", { name: "Weather station" }).count()) === 1, "the pane links to the kit");
check((await pane.getByRole("button", { name: "Put it back in Grid box 1" }).count()) === 1, "and offers Put it back in Grid box 1");
await page.screenshot({ path: `${shots}/t2-pane-out.png` });
await pane.getByRole("button", { name: "Close" }).click();

// 3. The tile keeps its spot, grey and striped, saying where it went.
const tile = page.getByRole("button", { name: "M3 nuts, Bin 0001, out to Weather station" });
await tile.waitFor();
check((await tile.textContent()).replace(/\s+/g, " ").trim().toLowerCase().startsWith("out"), "tile says Out: " + (await tile.textContent()));
check((await tile.getAttribute("class")).includes("grayscale"), "tile is greyed and striped");
check(JSON.stringify((await api("GET", `/locations/${b1.id}`)).slot) === JSON.stringify({ x: 0, y: 0, rotated: false }), "its grid spot is kept");
await page.screenshot({ path: `${shots}/t3-grid.png` });

// 4. The part says its bin is out.
await page.goto(`${base}/?q=m3`);
const row = page.getByRole("link", { name: /^M3 nuts/ });
await row.waitFor();
check((await row.textContent()).includes("bin out: Weather station"), "inventory row: " + (await row.textContent()).replace(/ /g, " "));
await row.click();
await page.getByText("The bin is out: Weather station").waitFor();
check(true, "the part's page says the bin is out");

// 5. The kit lists the bin; Locations says the kit has 1 bin.
await page.goto(`${base}/locations`);
check((await page.getByRole("link", { name: /Weather station/ }).textContent()).includes("1 bin"), "project list: 1 bin");
await page.getByRole("link", { name: /Weather station/ }).click();
await page.getByRole("heading", { name: "Bins taken out to this kit" }).waitFor();
await page.screenshot({ path: `${shots}/t4-kit.png` });
check((await page.getByRole("button", { name: "Delete" }).count()) === 0, "a kit with a bin out to it can't be deleted from its page");
await page.getByRole("button", { name: "Put Bin 0001 back" }).click();
await toast("Bin 0001 is back in Grid box 1");
await page.getByRole("heading", { name: "Bins taken out to this kit" }).waitFor({ state: "detached" });
check((await api("GET", `/locations/${b1.id}`)).out === null, "put back from the kit");

// 5b. On the kit's screen, scanning a bin offers the whole bin.
await scan("BIN0001");
await page.getByRole("button", { name: "Take the whole bin" }).waitFor();
check((await page.getByText("Or pull one part from it:").count()) === 1, "a bin scan on the kit offers the whole bin, then its parts");
await page.screenshot({ path: `${shots}/t4b-kit-scan.png` });
await page.getByRole("button", { name: "Take the whole bin" }).click();
await toast("Bin 0001 taken out to Weather station");
await page.getByRole("heading", { name: "Bins taken out to this kit" }).waitFor();
await scan("BIN0001");
await page.getByText("Bin 0001 is already in this kit.").waitFor();
check(true, "scanning it again says it's already in the kit");
await page.getByRole("button", { name: "Close" }).click();
await page.getByRole("button", { name: "Put Bin 0001 back" }).click();
await toast("Bin 0001 is back in Grid box 1");

// 6. A note instead of a kit, from the bin's own page.
await page.goto(`${base}/locations/${b2.id}`);
await page.getByRole("region", { name: "Manage Bin 0002" }).getByRole("button", { name: "Take out" }).click();
await page.getByLabel("Where it is").fill("on the bench");
await page.getByRole("button", { name: "Take out", exact: true }).last().click();
await toast("Bin 0002 taken out");
await page.getByRole("group", { name: "Bin 0002 is out" }).getByText("on the bench").waitFor();
check(true, "taken out with a note: 'on the bench'");
await page.screenshot({ path: `${shots}/t5-bin-page-out.png` });

// 7. Put-back mode: scanning the bin puts it back in its spot.
await page.goto(`${base}/putback`);
await page.getByText("A whole bin you took out goes back in its spot").waitFor();
await scan("BIN0002");
await toast("Bin 0002 is back in Grid box 1");
check((await api("GET", `/locations/${b2.id}`)).out === null, "scanning it in put-back put it back");

// 8. Activity shows both.
await page.goto(`${base}/activity`);
await page.getByText(/Bin 0002 taken out/).first().waitFor();
check((await page.getByText(/Bin 0001 put back/).count()) > 0, "activity lists bins taken out and put back");

// 9. Keeping it out for good: free its spot, and a new bin can go there.
await api("POST", `/locations/${b1.id}/take-out`, { toLocationId: kit.id });
await page.goto(`${base}/locations/${box.id}`);
await page.getByRole("button", { name: "M3 nuts, Bin 0001, out to Weather station" }).click();
const pane2 = page.getByRole("dialog", { name: "Bin 0001 in Grid box 1" });
page.once("dialog", (d) => d.accept());
await pane2.getByRole("button", { name: "Free its spot" }).click();
await toast("Bin 0001's spot is free");
await pane2.getByText(/Its spot was given up/).waitFor();
await pane2.getByRole("button", { name: "Close" }).click();
await page.getByText("Not placed on the grid yet").waitFor();
check((await api("GET", `/locations/${b1.id}`)).slot === null, "the out bin gave up its spot and waits under Not placed");
const fresh = await api("POST", "/locations", { type: "bin", parentId: box.id, binSize: "1x1", slot: { x: 0, y: 0 } });
check(fresh.slot && fresh.slot.x === 0, "a new bin can go in the freed spot");
await page.reload();
await page.getByRole("button", { name: `${fresh.name}, empty` }).waitFor();
await page.screenshot({ path: `${shots}/t7-freed.png` });

// 10. Desktop: the docked pane.
const desk = await browser.newPage({ viewport: { width: 1280, height: 860 } });
desk.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await desk.goto(`${base}/locations/${box.id}`);
await desk.getByRole("button", { name: "M3 nuts, Bin 0001, out to Weather station" }).click();
await desk.getByRole("group", { name: "Bin 0001 is out" }).waitFor();
await desk.screenshot({ path: `${shots}/t6-desk.png` });
check(true, "desktop: docked pane shows the bin is out");

await browser.close();
server.kill();
