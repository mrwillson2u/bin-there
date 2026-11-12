// Categories (DEC-056): the Categories screen, reached from Locations; adding a category with
// fields, renaming a field (the part keeps its value under the new label), removing a field that
// holds values (the warning), deleting a category refused while parts use it and allowed after.
// usage: node scripts/ui-checks/categories-check.mjs <app dir> <empty data dir> <screenshots dir>
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
const tote = await api("POST", "/locations", { name: "Tote", type: "tote", parentId: site.id });
const cats = await api("GET", "/categories");
const wire = cats.find((c) => c.name === "Wire & connectors");
const gauge = wire.fieldDefs.find((f) => f.label === "Gauge");
const plug = await api("POST", "/items", { name: "DC plug", locationId: tote.id, categoryId: wire.id, qty: 2 });
await api("PATCH", `/items/${plug.id}`, { attributes: { [gauge.key]: "20 AWG" } });

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.goto(`${base}/locations`);
await page.getByRole("link", { name: "Categories" }).click();
await page.getByRole("heading", { name: "Categories" }).waitFor();
check((await page.locator("[data-category]").count()) === cats.length, `every category is listed: ${cats.length}`);
const wireCard = page.locator('[data-category="Wire & connectors"]');
check((await wireCard.getByText("1 part").count()) === 1, "a category says how many parts use it");

// Add a category with two fields.
await page.getByLabel("New category").fill("Relays");
await page.getByRole("button", { name: "Add", exact: true }).first().click();
const relays = page.locator('[data-category="Relays"]');
await relays.waitFor();
await relays.getByLabel("New field for Relays").fill("Coil voltage");
await relays.getByLabel("New field for Relays").press("Enter");
await relays.getByLabel("Field 1 of Relays").waitFor();
await relays.getByLabel("New field for Relays").fill("Contacts");
await relays.getByLabel("New field for Relays").press("Enter");
await relays.getByLabel("Field 2 of Relays").waitFor();
const relaysCat = (await api("GET", "/categories")).find((c) => c.name === "Relays");
check(relaysCat.fieldDefs.map((f) => [f.key, f.label]).join(";") === "coil_voltage,Coil voltage;contacts,Contacts", "a new category with two fields, keys from the labels: " + JSON.stringify(relaysCat.fieldDefs));
// Reorder: Contacts up.
await relays.getByRole("button", { name: "Move Contacts up" }).click();
await page.waitForTimeout(300);
check((await api("GET", "/categories")).find((c) => c.name === "Relays").fieldDefs[0].label === "Contacts", "a field moved up");
// Its usual way of counting.
await relays.getByRole("radio", { name: "Plenty / low / out" }).click();
await page.waitForTimeout(300);
check((await api("GET", "/categories")).find((c) => c.name === "Relays").defaultTracking === "level", "the usual way of counting is saved");

// Rename a field in a category with values: the part keeps its value under the new label.
const gaugeInput = wireCard.getByLabel("Field 1 of Wire & connectors");
check((await gaugeInput.inputValue()) === "Gauge", "the field shows its label");
await gaugeInput.fill("Wire gauge");
await gaugeInput.press("Enter");
await page.waitForTimeout(400);
const plugAfter = await api("GET", `/items/${plug.id}`);
check(plugAfter.fieldDefs[0].label === "Wire gauge" && plugAfter.attributes[gauge.key] === "20 AWG", "renamed: the part's form field is 'Wire gauge' and its value is kept");
await page.goto(`${base}/items/${plug.id}/edit`);
check((await page.getByLabel("Wire gauge").inputValue()) === "20 AWG", "the part's form shows the renamed field with its value");
check((await page.getByRole("link", { name: "Manage categories and their fields" }).count()) === 1, "the form links to the Categories screen");

// A choice field (DEC-059): Type becomes a Choice with options; the part's form offers them in a drop-down.
await page.goto(`${base}/categories`);
await wireCard.getByRole("radio", { name: "Choice" }).nth(1).click();
const opts = wireCard.getByRole("textbox", { name: "Options for Type" });
await opts.waitFor();
await opts.fill("DC barrel, USB-C, JST");
await opts.press("Enter");
await page.waitForTimeout(400);
const typeField = (await api("GET", "/categories")).find((c) => c.id === wire.id).fieldDefs.find((f) => f.label === "Type");
check(typeField.type === "choice" && typeField.options.join() === "DC barrel,USB-C,JST", "Type is a choice field with three options: " + JSON.stringify(typeField));
await page.goto(`${base}/items/${plug.id}/edit`);
const typeSelect = page.getByRole("combobox", { name: "Type", exact: true });
check((await typeSelect.locator("option").allTextContents()).join("|") === "|DC barrel|USB-C|JST", "the part's form offers the options in a drop-down: " + JSON.stringify(await typeSelect.locator("option").allTextContents()));
await typeSelect.selectOption("USB-C");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForURL(`${base}/items/${plug.id}`);
check((await api("GET", `/items/${plug.id}`)).attributes[typeField.key] === "USB-C", "the chosen option is saved on the part");
await page.goto(`${base}/categories`);
await page.locator('[data-category="Wire & connectors"]').waitFor();

// Remove a field that holds values: a warning, then removal; the value stays stored, unseen.
await page.goto(`${base}/categories`);
await wireCard.getByRole("button", { name: "Remove Wire gauge from Wire & connectors" }).click();
check((await wireCard.getByRole("alert").textContent()).includes("1 part has a value in Wire gauge"), "removing a field with values warns first");
await wireCard.getByRole("button", { name: "Remove anyway" }).click();
await page.waitForTimeout(400);
const plugTrim = await api("GET", `/items/${plug.id}`);
check(plugTrim.fieldDefs.map((f) => f.label).join() === "Type" && plugTrim.fieldDefs[0].type === "choice" && plugTrim.attributes[gauge.key] === "20 AWG", "the field is gone from the form; the value is still stored; the choice field stays a choice");
await page.screenshot({ path: `${shots}/cat-1-desktop.png`, fullPage: true });

// Delete: refused while parts use the category, allowed once they don't.
check((await wireCard.getByRole("button", { name: "Delete category" }).isDisabled()) === true, "delete is off while parts use the category");
await api("PATCH", `/items/${plug.id}`, { categoryId: relaysCat.id });
await page.reload();
await page.getByRole("heading", { name: "Categories" }).waitFor();
page.once("dialog", (d) => d.accept());
await page.locator('[data-category="Wire & connectors"]').getByRole("button", { name: "Delete category" }).click();
await page.locator('[data-category="Wire & connectors"]').waitFor({ state: "detached", timeout: 10000 });
check(!(await api("GET", "/categories")).some((c) => c.name === "Wire & connectors"), "an unused category can be deleted");

// Phone layout.
await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.getByRole("heading", { name: "Categories" }).waitFor();
await page.screenshot({ path: `${shots}/cat-2-phone.png`, fullPage: true });

await browser.close();
server.kill();
