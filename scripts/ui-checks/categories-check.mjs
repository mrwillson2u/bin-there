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
const until = async (fn, msg, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return check(true, msg); await new Promise((r) => setTimeout(r, 150)); }
  check(false, msg);
};

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
// Reached from the sidebar on a computer (DEC-070).
await page.locator("nav").getByRole("link", { name: "Categories" }).click();
await page.getByRole("heading", { name: "Categories" }).waitFor();
check((await page.locator("[data-category]").count()) === cats.length, `every category is listed: ${cats.length}`);
const wireCard = page.locator('[data-category="Wire & connectors"]');
check((await wireCard.getByText("1 part").count()) === 1, "a category says how many parts use it");

// Add a category with two fields.
// The box at the top finds categories as you type and adds a new one (issue #4, DEC-079).
const find = page.getByLabel("Find or add a category");
check((await find.getAttribute("placeholder")) === "Find a category, or type a new name to add it", "the top box says it finds and adds");
await find.fill("wire");
check((await page.locator("[data-category]").count()) === 1 && (await wireCard.count()) === 1, "typing filters the categories by name as you type");
check((await page.locator("[data-category-find]").textContent()).includes("Press Add to create a new category named “wire”"), "a name that isn't a category yet says Add will create it");
await find.fill("WIRE & connectors");
check((await page.getByRole("button", { name: "Add a new category" }).isDisabled()) === true && !(await page.locator("[data-category-find]").textContent()).includes("Press Add"), "a name that already exists can't be added again");
await find.fill("Relays");
check((await page.locator("[data-category]").count()) === 0 && (await page.locator("[data-category-find]").textContent()).includes("No category has “Relays” in its name"), "a name nothing matches shows no categories and says so");
await page.screenshot({ path: `${shots}/cat-0-find-or-add.png` });
await page.getByRole("button", { name: "Add Relays as a new category" }).click();
await until(async () => (await page.locator("[data-category]").count()) === cats.length + 1, "Add creates it, clears the box and shows every category again");
// The new category's card is in view, outlined, with its name ready to edit; a rename there sticks.
const freshCard = page.locator("[data-fresh]");
await freshCard.waitFor();
check((await freshCard.getAttribute("data-category")) === "Relays" && (await freshCard.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight; })), "the new category's card is scrolled into view and marked as new");
check(await page.getByLabel("Name of Relays").evaluate((el) => el === document.activeElement), "its name is selected, ready to edit");
// At a person's pace: keys with no gaps between them read as the hardware scanner.
await page.keyboard.type("Relay modules", { delay: 70 });
await page.keyboard.press("Enter");
await until(async () => (await api("GET", "/categories")).some((c) => c.name === "Relay modules"), "typing straight away renames the new category");
await page.screenshot({ path: `${shots}/cat-0b-new-category.png` });
await page.getByLabel("Name of Relay modules").fill("Relays");
await page.getByLabel("Name of Relay modules").press("Enter");
await until(async () => (await api("GET", "/categories")).some((c) => c.name === "Relays"), "and it can be renamed again");
const relays = page.locator('[data-category="Relays"]');
await relays.waitFor();
await relays.getByLabel("New field for Relays").fill("Coil voltage");
await relays.getByLabel("New field for Relays").press("Enter");
await relays.getByLabel("Field 1 of Relays").waitFor();
await relays.getByLabel("New field for Relays").fill("Contacts");
await relays.getByLabel("New field for Relays").press("Enter");
await relays.getByLabel("Field 2 of Relays").waitFor();
const relaysCat = (await api("GET", "/categories")).find((c) => c.name === "Relays");
check(relaysCat.fieldDefs.map((f) => f.label).join(";") === "Coil voltage;Contacts" && relaysCat.fieldDefs.every((f) => /^f\d+$/.test(f.key)), "a new category with two fields, each with an ID for a key (DEC-071): " + JSON.stringify(relaysCat.fieldDefs));
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
const plug2 = await api("POST", "/items", { name: "Barrel jack", locationId: tote.id, categoryId: wire.id, qty: 1 });
await api("PATCH", `/items/${plug2.id}`, { attributes: { [gauge.key]: "22 AWG" } });
await page.goto(`${base}/items/${plug.id}/edit`);
check((await page.getByLabel("Wire gauge").inputValue()) === "20 AWG", "the part's form shows the renamed field with its value");
// Values other parts of the kind hold are offered as you type (DEC-060): the box has a list, with both gauges.
const listId = await page.getByLabel("Wire gauge").getAttribute("list");
await page.locator(`datalist[id="${listId}"] option`).first().waitFor({ state: "attached" });
const offered = await page.locator(`datalist[id="${listId}"] option`).evaluateAll((os) => os.map((o) => o.value));
check(offered.join() === "20 AWG,22 AWG", "the gauge box offers the values already used: " + offered.join(", "));
check((await page.getByRole("link", { name: "Manage categories and their fields" }).count()) === 1, "the form links to the Categories screen");

// A field belongs to one category (DEC-072); custom fields are a part's own (DEC-071).
await page.goto(`${base}/categories`);
await wireCard.getByLabel("New field for Wire & connectors").fill("pin count");
await wireCard.getByLabel("New field for Wire & connectors").press("Enter");
await wireCard.getByLabel("Field 3 of Wire & connectors").waitFor();
check((await wireCard.getByLabel("Field 3 of Wire & connectors").inputValue()) === "Pin count", "a new field's name follows the convention: pin count becomes Pin count");
const pinKey = (await api("GET", "/categories")).find((c) => c.id === wire.id).fieldDefs.find((f) => f.label === "Pin count").key;
check(/^f\d+$/.test(pinKey), "its key is an ID, not its name: " + pinKey);
await api("PATCH", `/items/${plug.id}`, { attributes: { [gauge.key]: "20 AWG", [pinKey]: "2" } });
// The same name in another category is simply that category's own field: no question asked.
const relaysCard = page.locator('[data-category="Relays"]');
await relaysCard.getByLabel("New field for Relays").fill("pin count");
await relaysCard.getByLabel("New field for Relays").press("Enter");
await relaysCard.getByLabel("Field 3 of Relays").waitFor();
const relaysNow = (await api("GET", "/categories")).find((c) => c.name === "Relays");
const relayPin = relaysNow.fieldDefs.find((f) => f.label === "Pin count").key;
check(relayPin !== pinKey, "a Pin count in Relays is Relays's own field, separate from the one in Wire & connectors");
check((await page.getByText(/universal/i).count()) === 0 && (await page.locator("[data-field-kind], [data-same-name]").count()) === 0, "the Categories screen has nothing about universal fields: just each category's fields");
await page.screenshot({ path: `${shots}/cat-2c-own-fields.png` });
// Changing a part's category on its form: it holds values in the old category's fields, so a dialog asks.
await page.goto(`${base}/items/${plug.id}/edit`);
const formCat = page.getByRole("combobox", { name: "Category" });
const toRelays = async () => {
  await formCat.click();
  await formCat.fill("Relays");
  await formCat.press("Enter");
};
await toRelays();
const dialog = page.locator("[data-category-change]");
await dialog.waitFor();
check((await dialog.getByRole("heading", { name: "Change category to Relays?" }).count()) === 1, "changing the category of a part with category values asks first");
check((await dialog.locator('[data-leaving="Pin count"]').textContent()).includes("goes into Pin count in Relays"), "a value the new category has a same-named field for says it goes there");
check((await dialog.locator('[data-leaving="Wire gauge"]').textContent()).includes("becomes a custom field"), "a value with nowhere to go says it becomes a custom field");
const buttons = await dialog.getByRole("button").allTextContents();
check(buttons.join("|") === "Change category, keep these 2 values|Change category, delete these 2 values|Cancel, stay in Wire & connectors", "three buttons, each saying its result: " + buttons.join(" | "));
await page.screenshot({ path: `${shots}/cat-2d-category-change.png` });
await dialog.getByRole("button", { name: /^Cancel/ }).click();
check((await dialog.count()) === 0 && (await page.getByLabel("Wire gauge").inputValue()) === "20 AWG", "Cancel leaves the part in its category with its values");
await toRelays();
await dialog.getByRole("button", { name: /keep these 2 values/ }).click();
const customBox = page.locator("[data-custom-fields]");
check((await customBox.getByText("Custom fields · only on this part").count()) === 1, "the form's custom section says it's only on this part");
check((await page.getByLabel("Pin count", { exact: true }).inputValue()) === "2", "kept: the Pin count is in Relays's Pin count");
check((await customBox.getByRole("textbox", { name: "Value of Wire gauge" }).inputValue()) === "20 AWG", "kept: the Wire gauge is a custom field, shown straight away");
// A custom field: named by the convention; a name that's already a field says so.
await customBox.getByRole("button", { name: "Add a custom field" }).click();
const newName = customBox.getByRole("textbox", { name: "Custom field name" }).last();
await newName.fill("pin count");
check((await customBox.getByRole("note").textContent()).includes("already one of this part's fields"), "a custom name that's already one of the part's fields says so");
await newName.fill("cable colour");
await newName.blur();
await customBox.getByRole("textbox", { name: "Value of Cable colour" }).fill("Black");
await page.screenshot({ path: `${shots}/cat-2e-custom-fields.png`, fullPage: true });
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("heading", { name: "DC plug" }).waitFor();
const moved = await api("GET", `/items/${plug.id}`);
check(moved.categoryId === relaysNow.id && JSON.stringify(moved.attributes) === JSON.stringify({ [relayPin]: "2" }), "saved in Relays with only Relays's fields: " + JSON.stringify(moved.attributes));
check(moved.custom["Cable colour"] === "Black" && moved.custom["Wire gauge"] === "20 AWG", "saved: the kept value and the new custom field are on the part");
check((await page.getByText("Cable colour").count()) === 1 && (await page.getByText("Wire gauge").count()) === 1, "the part's page shows both");
// The same question on Fill in details, where the category saves as it's picked; Delete drops the values.
const bare = await api("POST", "/items", { locationId: tote.id, categoryId: wire.id, qty: 1 });
await api("PATCH", `/items/${bare.id}`, { attributes: { [gauge.key]: "18 AWG" } });
await page.goto(`${base}/needs-details`);
const rowCat = page.getByRole("combobox", { name: /^Category for/ });
await rowCat.click();
await rowCat.fill("Relays");
await rowCat.press("Enter");
await dialog.waitFor();
check((await api("GET", `/items/${bare.id}`)).categoryId === wire.id, "on Fill in details nothing is saved until the dialog is answered");
await dialog.getByRole("button", { name: "Change category, delete this value" }).click();
await page.waitForTimeout(400);
const dropped = await api("GET", `/items/${bare.id}`);
check(dropped.categoryId === relaysNow.id && Object.keys(dropped.attributes).length === 0 && Object.keys(dropped.custom).length === 0, "Delete: the category changed and the old value is gone");
// A part with no values in its category's fields changes category with no dialog.
await rowCat.click();
await rowCat.fill("Wire");
await rowCat.press("Enter");
await page.waitForTimeout(400);
check((await dialog.count()) === 0 && (await api("GET", `/items/${bare.id}`)).categoryId === wire.id, "with nothing to lose, the category just changes");
// Tidy up for the steps below.
await api("PATCH", `/items/${bare.id}`, { categoryId: null });
await api("DELETE", `/items/${bare.id}`);
await api("PATCH", `/items/${plug.id}`, { categoryId: wire.id, categoryValues: "delete", custom: {} });
await api("PATCH", `/items/${plug.id}`, { attributes: { [gauge.key]: "20 AWG" } });
for (const cat of [wire.id, relaysNow.id]) {
  const defs = (await api("GET", "/categories")).find((c) => c.id === cat).fieldDefs;
  await api("PATCH", `/categories/${cat}`, { fieldDefs: defs.filter((f) => f.label !== "Pin count").map((f) => ({ key: f.key, label: f.label })) });
}

// A choice field (DEC-059): Type becomes a Choice with options; the part's form offers them in a drop-down.
await page.goto(`${base}/categories`);
await wireCard.getByRole("radio", { name: "Choice" }).nth(1).click();
const opts = wireCard.getByRole("textbox", { name: "Options for Type" });
await opts.waitFor();
// The options box sits right under its field's name, lined up with it (Colin, 2026-11-13).
{
  const nameBox = await wireCard.getByRole("textbox", { name: /^Field 2 of / }).boundingBox();
  const optBox = await opts.boundingBox();
  const kindBox = await wireCard.getByRole("radiogroup", { name: "Kind of Type" }).boundingBox();
  check(optBox.y > nameBox.y && optBox.y < kindBox.y && Math.abs(optBox.x - nameBox.x) < 8, "the options box is right under the field's name, above the Text / Choice switch");
}
await page.screenshot({ path: `${shots}/cat-2b-options-under-name.png` });
await opts.fill("DC barrel, USB-C, JST");
await opts.press("Enter");
await page.waitForTimeout(400);
const typeField = (await api("GET", "/categories")).find((c) => c.id === wire.id).fieldDefs.find((f) => f.label === "Type");
check(typeField.type === "choice" && typeField.options.join() === "DC barrel,USB-C,JST", "Type is a choice field with three options: " + JSON.stringify(typeField));
await page.goto(`${base}/items/${plug.id}/edit`);
await page.getByText("Wire & connectors fields").waitFor();
const typeSelect = page.getByRole("combobox", { name: "Type", exact: true });
check((await typeSelect.locator("option").allTextContents()).join("|") === "|DC barrel|USB-C|JST", "the part's form offers the options in a drop-down: " + JSON.stringify(await typeSelect.locator("option").allTextContents()));
await typeSelect.selectOption("USB-C");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForURL(`${base}/items/${plug.id}`);
check((await api("GET", `/items/${plug.id}`)).attributes[typeField.key] === "USB-C", "the chosen option is saved on the part");
await page.goto(`${base}/categories`);
await page.locator('[data-category="Wire & connectors"]').waitFor();

// A per-unit field (DEC-062): "Each stickered one has its own" on Type; the part's form drops it,
// each stickered unit's row on the part's page gets it, and each keeps its own value.
await wireCard.getByRole("checkbox", { name: "Each stickered one has its own Type" }).check();
await page.waitForTimeout(400);
check((await api("GET", "/categories")).find((c) => c.id === wire.id).fieldDefs.find((f) => f.label === "Type").perUnit === true, "the field is marked per unit");
const pack = await api("POST", "/items", { name: "LiPo pack", locationId: tote.id, categoryId: wire.id, code: "BAT001" });
await api("POST", "/units", { itemId: pack.id, code: "BAT002", locationId: tote.id });
await page.goto(`${base}/items/${pack.id}`);
const unitType1 = page.getByRole("combobox", { name: "Type of BAT001" });
await unitType1.waitFor();
check((await page.getByRole("combobox", { name: "Type of BAT002" }).count()) === 1, "each stickered unit's row has its own Type box");
await unitType1.selectOption("USB-C");
await page.waitForTimeout(400);
const packUnits = (await api("GET", `/items/${pack.id}`)).unitList;
check(packUnits[0].attributes[typeField.key] === "USB-C" && !packUnits[1].attributes[typeField.key], "the value is saved on that unit alone");
check((await page.getByRole("combobox", { name: "Type of BAT002" }).inputValue()) === "", "the other unit's box stays empty");
await page.screenshot({ path: `${shots}/cat-3-per-unit.png`, fullPage: true });
await page.goto(`${base}/items/${pack.id}/edit`);
await page.getByText("Wire & connectors fields").waitFor();
const formTypes = await page.getByRole("combobox", { name: "Type", exact: true }).count();
const formGauges = await page.getByRole("combobox", { name: "Wire gauge" }).count(); // a text field with its suggestion list reads as a combobox
check(formTypes === 0 && formGauges === 1, `the part's form shows the part's fields but not the per-unit one (Type boxes ${formTypes}, gauge boxes ${formGauges})`);
await page.screenshot({ path: `${shots}/cat-4-form-without-it.png`, fullPage: true });
await page.goto(`${base}/categories`);
await page.locator('[data-category="Wire & connectors"]').waitFor();
await wireCard.getByRole("checkbox", { name: "Each stickered one has its own Type" }).uncheck();
await page.waitForTimeout(400);
await api("PATCH", `/items/${pack.id}`, { categoryId: relaysCat.id });

// Remove a field that holds values: a warning, then removal; the value stays stored, unseen.
await page.goto(`${base}/categories`);
await wireCard.getByRole("button", { name: "Remove Wire gauge from Wire & connectors" }).click();
check((await wireCard.getByRole("alert").textContent()).includes("2 parts have a value in Wire gauge"), "removing a field with values warns first, with the count");
await wireCard.getByRole("button", { name: "Remove anyway" }).click();
await page.waitForTimeout(400);
const plugTrim = await api("GET", `/items/${plug.id}`);
check(plugTrim.fieldDefs.map((f) => f.label).join() === "Type" && plugTrim.fieldDefs[0].type === "choice" && plugTrim.attributes[gauge.key] === "20 AWG", "the field is gone from the form; the value is still stored; the choice field stays a choice");
await page.screenshot({ path: `${shots}/cat-1-desktop.png`, fullPage: true });

// Delete: refused while parts use the category, allowed once they don't.
check((await wireCard.getByRole("button", { name: "Delete category" }).isDisabled()) === true, "delete is off while parts use the category");
await api("PATCH", `/items/${plug.id}`, { categoryId: relaysCat.id });
await api("PATCH", `/items/${plug2.id}`, { categoryId: relaysCat.id });
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
