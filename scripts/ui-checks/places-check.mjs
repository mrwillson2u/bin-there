// Adding several places in a run (DEC-058): Add several from Locations or a place; name it and
// scan its sticker (saved with it, the next name counts up) or save it without one; the settings
// stay between saves and can change; places fill a rack's positions in order; Done.
// usage: node scripts/ui-checks/places-check.mjs <app dir> <empty data dir> <screenshots dir>
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
const shelf = await api("POST", "/locations", { name: "Shelf", type: "shelf", parentId: site.id, rackSize: 3 });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
// The hardware scanner: Ctrl+B, the code, Enter.
const scan = async (code) => {
  await page.keyboard.down("Control"); await page.keyboard.press("b"); await page.keyboard.up("Control");
  await page.keyboard.type(code, { delay: 5 }); await page.keyboard.press("Enter");
};
const addedRows = () => page.getByRole("region", { name: "Added" }).getByRole("listitem");

// 1. From Locations: Add several opens the run in the one site.
await page.goto(`${base}/locations`);
await page.getByRole("link", { name: "Add several" }).click();
await page.getByRole("heading", { name: "Add places in Garage" }).waitFor();
check(true, "Add several from Locations opens the run in the one site");
check((await page.getByRole("button", { name: "Save without a sticker" }).isDisabled()) === true, "nothing can be saved without a name");

// 2. Name, type Tote, a scan saves with that sticker and the next name is ready.
await page.getByRole("button", { name: "Tote", exact: true }).click();
await page.getByRole("textbox", { name: "Name", exact: true }).fill("Mini tote 1");
check((await page.getByText("Number goes up: the next one is").textContent()).includes("Mini tote 2"), "the switch says what the next name will be");
await scan("TOTE0000001");
await addedRows().first().waitFor();
check((await page.getByRole("textbox", { name: "Name", exact: true }).inputValue()) === "Mini tote 2", "a scan saved it; the name counted up to Mini tote 2");
const t1 = (await api("GET", "/scan/TOTE0000001"));
check(t1.kind === "location" && t1.location.name === "Mini tote 1" && t1.location.type === "tote", "Mini tote 1 is a tote with that sticker");
await page.screenshot({ path: `${shots}/places-1-after-first.png`, fullPage: true });

// 3. Save without a sticker keeps the run going; a third by scan.
await page.getByRole("button", { name: "Save without a sticker" }).click();
await page.getByText("Added (2)").waitFor();
check((await page.getByRole("textbox", { name: "Name", exact: true }).inputValue()) === "Mini tote 3", "saved without a sticker; Mini tote 3 is ready");
await scan("TOTE0000003");
await page.getByText("Added (3)").waitFor();
const rows = await addedRows().allTextContents();
check(rows[0].includes("Mini tote 3") && rows[0].includes("TOTE0000003") && rows[1].includes("Mini tote 2") && rows[1].includes("no sticker"), "the list shows each with its sticker or none: " + rows.join(" | "));

// 4. A used sticker is refused and the name stays.
await scan("TOTE0000001");
await page.getByRole("alert").waitFor();
check((await page.getByRole("alert").textContent()).includes("already assigned") && (await page.getByRole("textbox", { name: "Name", exact: true }).inputValue()) === "Mini tote 4", "a sticker already in use is refused; the name waits");

// 5. Change the type mid-run: the settings stay editable; the number switch off gives an empty name.
await page.getByRole("button", { name: "Gridded box", exact: true }).click();
await page.getByRole("textbox", { name: "Name", exact: true }).fill("Parts case");
await page.getByRole("checkbox", { name: /Number goes up/ }).uncheck();
await page.getByRole("button", { name: "Save without a sticker" }).click();
await page.getByText("Added (4)").waitFor();
check((await page.getByRole("textbox", { name: "Name", exact: true }).inputValue()) === "Parts case", "with the number switch off the same name is ready again");
const kids = await api("GET", `/locations/${site.id}`);
check(kids.children.find((c) => c.name === "Parts case")?.type === "gridded_box", "the type changed mid-run was used");

// 5b. Change the place mid-run: the next one goes in the shelf, in its first position.
await page.getByRole("button", { name: /^Change where/ }).click();
await page.getByRole("button", { name: "Pick from list" }).click();
await page.getByRole("button", { name: "Choose Shelf" }).click();
await page.getByText("Goes in this position of Shelf").waitFor();
await page.getByRole("textbox", { name: "Name", exact: true }).fill("Bench box");
await page.getByRole("button", { name: "Save without a sticker" }).click();
await page.getByText("Added (5)").waitFor();
const bench = (await api("GET", `/locations/${shelf.id}`)).children.find((c) => c.name === "Bench box");
check(bench?.position === "1", "the place changed mid-run was used: Bench box is in position 1 of Shelf");

// 6. Done goes to the parent.
await page.getByRole("button", { name: "Done" }).click();
await page.waitForURL(`${base}/locations/${shelf.id}`);
check(true, "Done goes to the place the last one was added in");

// 7. In a shelf with 3 positions: each new place takes the next free position; the 4th gets none.
await page.goto(`${base}/locations/${shelf.id}`);
await page.getByRole("link", { name: "Add several" }).first().click();
await page.getByRole("heading", { name: "Add places in Shelf" }).waitFor();
await page.getByRole("button", { name: "Tote", exact: true }).click();
check((await page.getByText("Goes in this position of Shelf").count()) === 1, "the first goes in the next free position");
await page.getByRole("textbox", { name: "Name", exact: true }).fill("Box A");
for (let i = 0; i < 2; i++) {
  await page.getByRole("button", { name: "Save without a sticker" }).click();
  await page.getByText(`Added (${i + 1})`).waitFor();
}
await page.getByText("Every position of Shelf is taken").waitFor();
check(true, "once every position is taken it says so");
await page.getByRole("button", { name: "Save without a sticker" }).click();
await page.getByText("Added (3)").waitFor();
const onShelf = (await api("GET", `/locations/${shelf.id}`)).children.map((c) => [c.name, c.position]);
check(JSON.stringify(onShelf) === JSON.stringify([["Bench box", "1"], ["Box A", "2"], ["Box A 2", "3"], ["Box A 3", null]]), "positions 2, 3, then none: " + JSON.stringify(onShelf));
await page.screenshot({ path: `${shots}/places-2-shelf.png`, fullPage: true });

// 8. Desktop look.
await page.setViewportSize({ width: 1280, height: 900 });
await page.screenshot({ path: `${shots}/places-3-desktop.png`, fullPage: true });

await browser.close();
server.kill();
