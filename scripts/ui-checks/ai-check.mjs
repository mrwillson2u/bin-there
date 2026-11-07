// AI data fill (DEC-048) with a fake model and a fake search on port 3012: the details form's
// "Suggest details with AI" button, the suggestions with where they came from, Use / Use all,
// typing over a used value, saving, and the AI marks on the part's page. Without AI_URL the
// button isn't there.
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
// The fake Ollama + SearXNG + supplier page, all one little server.
let voltageKey = "voltage"; // the Modules & boards category's Voltage field key, read once the app is up
let searches = 0;
const fake = createServer(async (req, res) => {
  const url = new URL(req.url, "http://fake");
  let body = ""; for await (const chunk of req) body += chunk;
  const json = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  if (url.pathname === "/api/tags") return json({ models: [{ name: "fake:1b" }] });
  if (url.pathname === "/api/chat") {
    const msg = JSON.parse(body).messages[0];
    if (!msg.content.startsWith("You fill in")) {
      return json({ message: { content: JSON.stringify({ markings: ["LM2596S", "IN+ IN-"], description: "A small blue DC-DC module", likelyPart: "LM2596 buck converter module", queries: ["LM2596 buck module"] }) } });
    }
    return json({ message: { content: JSON.stringify({ identified: "LM2596 adjustable step-down module (3 A)", suggestions: [
      { field: "name", value: "LM2596 buck converter module", source: "photo", confidence: "high" },
      { field: "category", value: "Modules & boards", source: "http://127.0.0.1:3012/page/lm2596", confidence: "high" },
      { field: `attributes.${voltageKey}`, value: "4–40 V in, 1.25–37 V out", source: "http://127.0.0.1:3012/page/lm2596", confidence: "high" },
      { field: "supplier", value: "Example Supplier", source: "http://127.0.0.1:3012/page/lm2596", confidence: "medium" },
      { field: "price", value: "2.49", source: "http://127.0.0.1:3012/page/lm2596", confidence: "medium" },
      { field: "url", value: "http://127.0.0.1:3012/page/lm2596", source: "http://127.0.0.1:3012/page/lm2596", confidence: "high" },
    ], notes: ["The output voltage is set by the trimmer; measure it."] }) } });
  }
  if (url.pathname === "/search") { searches++; return json({ results: [{ title: "LM2596 module", url: "http://127.0.0.1:3012/page/lm2596", content: "3A step-down" }] }); }
  if (url.pathname.startsWith("/page/")) { res.setHeader("content-type", "text/html"); return res.end("<h1>LM2596 DC-DC buck module</h1><p>Input 4-40V, output 1.25-37V, 3A. Price $2.49.</p>" + "<p>x</p>".repeat(100)); }
  res.statusCode = 404; res.end("no");
});
await new Promise((r) => fake.listen(3012, "127.0.0.1", r));
process.on("exit", () => fake.close());
const server = spawn("node", ["dist/server.js"], { cwd: app, env: { ...process.env, PORT: "3011", DATA_DIR: dataDir, AI_URL: "http://127.0.0.1:3012", AI_MODEL: "fake:1b", SEARCH_URL: "http://127.0.0.1:3012" }, stdio: "pipe" });
process.on("exit", () => server.kill());
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + "/api/health")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
const api = async (method, path, body) => {
  const r = await fetch(base + "/api" + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`); return j;
};
const check = (ok, msg) => { console.log((ok ? "PASS " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

const site = await api("POST", "/locations", { name: "Garage", type: "site" });
const tote = await api("POST", "/locations", { name: "Tote A", type: "tote", parentId: site.id });
const cats = await api("GET", "/categories");
const modules = cats.find((c) => c.name === "Modules & boards");
voltageKey = modules.fieldDefs.find((f) => f.label === "Voltage").key;
// No category yet: the AI may suggest one. The fields it can fill are the category's, so the
// part gets its category first (as Fill in details would) and the AI fills Voltage.
const item = await api("POST", "/items", { name: "Buck converter", locationId: tote.id, qty: 3, categoryId: modules.id });
// A photo on the part: without one the photo-reading step is skipped (and the fake model's markings with it).
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=800x600", "-frames:v", "1", `${shots}/part.jpg`]);
{
  const jpg = new Blob([readFileSync(`${shots}/part.jpg`)], { type: "image/jpeg" });
  const form = new FormData(); form.append("photo", jpg, "photo.jpg"); form.append("thumb", jpg, "thumb.jpg");
  const r = await fetch(`${base}/api/items/${item.id}/photos`, { method: "POST", body: form });
  if (!r.ok) throw new Error("photo upload failed " + r.status);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.goto(`${base}/items/${item.id}/edit`);
await page.getByRole("button", { name: "Suggest details with AI" }).waitFor();
check(true, "the details form offers 'Suggest details with AI' when AI_URL is set");
await page.getByRole("button", { name: "Suggest details with AI" }).click();
await page.getByText("It looks like:").waitFor({ timeout: 20000 });
const panel = page.getByRole("region", { name: "AI suggestions" });
check((await panel.getByText("LM2596 adjustable step-down module (3 A)").count()) === 1, "says what it thinks the part is");
check((await panel.getByText("LM2596S · IN+ IN-").count()) === 1, "shows what it read off the part");
const rows = panel.getByRole("listitem");
check((await rows.count()) === 6, "six suggestions (name, voltage, supplier, price, link) and one note as rows: " + (await rows.count()));
check((await panel.getByText("The output voltage is set by the trimmer; measure it.").count()) === 1, "the model's note is shown");
check((await panel.getByRole("link", { name: /127\.0\.0\.1/ }).count()) >= 5, "each page-sourced suggestion links to where it came from");
check((await page.locator('input[placeholder="DigiKey, Amazon…"]').inputValue()) === "", "nothing is filled in before Use");
await page.screenshot({ path: `${shots}/ai-1-suggestions.png`, fullPage: true });

// Use one, then Use all; the form fills in; Used shows per row.
await panel.getByRole("button", { name: "Use Price: 2.49" }).click();
check((await page.locator('input[placeholder="0.00"]').inputValue()) === "2.49", "Use puts the price in the form");
check((await panel.getByText("Used").count()) === 1, "that row says Used");
await panel.getByRole("button", { name: "Use all" }).click();
check((await panel.getByText("Used").count()) === 5, "Use all marks every row Used: " + (await panel.getByText("Used").count()));
check((await page.locator('input[placeholder="DigiKey, Amazon…"]').inputValue()) === "Example Supplier", "supplier filled in");
check((await page.locator('input[placeholder="e.g. M3 × 10 socket cap screw"]').inputValue()) === "LM2596 buck converter module", "name filled in");
check((await page.getByRole("button", { name: "Use all" }).count()) === 0, "Use all goes away once everything is used");
await page.screenshot({ path: `${shots}/ai-2-used.png`, fullPage: true });

// Typing over a used value takes its AI mark off: the supplier becomes hand-typed.
await page.locator('input[placeholder="DigiKey, Amazon…"]').fill("DigiKey");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("heading", { name: "LM2596 buck converter module" }).waitFor();
const saved = await api("GET", `/items/${item.id}`);
check(saved.categoryId === modules.id && saved.price === 2.49 && saved.supplier === "DigiKey" && saved.attributes[voltageKey] === "4–40 V in, 1.25–37 V out" && saved.url === "http://127.0.0.1:3012/page/lm2596", "saved: price, voltage, link from AI, supplier by hand");
check(Object.keys(saved.aiFields).sort().join() === `attributes.${voltageKey},name,price,url`, "the AI marks cover what was used and not the hand-typed supplier: " + Object.keys(saved.aiFields).sort().join());
check(saved.aiFields.price.source === "http://127.0.0.1:3012/page/lm2596" && saved.aiFields.name.source === "photo", "each mark says where the value came from");

// The part's page marks them.
check((await page.locator("[data-ai-mark]").count()) === 3, "AI marks on price, voltage and link: " + (await page.locator("[data-ai-mark]").count()));
check((await page.locator("[data-ai-note]").textContent()).includes("filled in by AI from"), "the details card says some were filled in by AI");
await page.screenshot({ path: `${shots}/ai-3-part.png`, fullPage: true });

// Opening the form again: the marks still hold; editing the price by hand drops it.
await page.goto(`${base}/items/${item.id}/edit`);
await page.locator('input[placeholder="0.00"]').waitFor();
await page.locator('input[placeholder="0.00"]').fill("2.50");
await page.getByRole("button", { name: "Save" }).click();
await page.getByRole("heading", { name: "LM2596 buck converter module" }).waitFor();
const again = await api("GET", `/items/${item.id}`);
check(!("price" in again.aiFields) && "url" in again.aiFields, "a price typed by hand loses its AI mark; the link keeps it");

// A part with the shop's link on record (DEC-049): the link is read and the search isn't run;
// the link itself isn't suggested back, the rest comes from its page.
const before = searches;
const linked = await api("POST", "/items", { name: "Buck converter 2", locationId: tote.id, qty: 1, categoryId: modules.id });
await api("PATCH", `/items/${linked.id}`, { url: "http://127.0.0.1:3012/page/lm2596" });
await page.goto(`${base}/items/${linked.id}/edit`);
await page.getByRole("button", { name: "Suggest details with AI" }).click();
await page.getByText("It looks like:").waitFor({ timeout: 20000 });
const panel2 = page.getByRole("region", { name: "AI suggestions" });
check(searches === before, "with a link on record the web search isn't used: " + (searches - before) + " searches");
check((await panel2.getByRole("button", { name: /^Use Link/ }).count()) === 0 && (await panel2.getByRole("button", { name: "Use Price: 2.49" }).count()) === 1, "the link on record isn't suggested back; the price from its page is");
check((await panel2.getByRole("link", { name: /127\.0\.0\.1/ }).count()) >= 1, "the page read is listed");
await page.screenshot({ path: `${shots}/ai-4-linked.png`, fullPage: true });

await browser.close();
server.kill();
fake.close();
