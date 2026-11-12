// Compare vision models on the dev instance's own parts (DEC-053): the same quick look (photo
// only) through each model, with the markings read, the name and category offered and the time
// taken, as a Markdown table and a JSON file. Pull the models into the dev Ollama first.
//
//   node scripts/ai-bakeoff.mjs http://127.0.0.1:3001/api out.json gemma3:4b minicpm-v qwen3-vl:8b [-- item ids]
//
// Runs on the host with nothing installed; never against the live app (the live app has no AI).

import { writeFileSync } from "node:fs";

const [, , base, outFile, ...rest] = process.argv;
if (!base || !outFile || rest.length === 0) throw new Error("usage: node scripts/ai-bakeoff.mjs <api base> <out.json> <model>... [-- <item id>...]");
if (/:3000\b|8443/.test(base)) throw new Error("not against the live app");
const dash = rest.indexOf("--");
const models = dash < 0 ? rest : rest.slice(0, dash);
let ids = dash < 0 ? [] : rest.slice(dash + 1).map(Number);

const api = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
};

if (ids.length === 0) {
  const inv = await api("GET", "/inventory?limit=200");
  ids = (inv.items ?? inv).filter((i) => i.thumbUrl).map((i) => i.id);
}
const names = {};
for (const id of ids) names[id] = (await api("GET", `/items/${id}`)).name || `(unnamed ${id})`;

const results = [];
for (const model of models) {
  console.log(`\n### ${model}`);
  for (const id of ids) {
    const t = Date.now();
    try {
      const r = await api("POST", `/items/${id}/research`, { mode: "quick", model });
      const seconds = (Date.now() - t) / 1000;
      const name = r.suggestions.find((s) => s.field === "name")?.value ?? "";
      const category = r.suggestions.find((s) => s.field === "category")?.value ?? "";
      results.push({ model, id, item: names[id], markings: r.markings, identified: r.identified, name, category, seconds });
      console.log(`${id} ${names[id].slice(0, 24).padEnd(24)} ${seconds.toFixed(1).padStart(5)}s  ${r.markings.join(" · ").slice(0, 60).padEnd(60)}  ${name} | ${category}`);
    } catch (e) {
      results.push({ model, id, item: names[id], error: e.message, seconds: (Date.now() - t) / 1000 });
      console.log(`${id} ${names[id].slice(0, 24).padEnd(24)} failed: ${e.message.slice(0, 80)}`);
    }
  }
}
writeFileSync(outFile, JSON.stringify(results, null, 1));

// The summary: per model, the time and how many parts got a name.
console.log("\n| Model | Parts | Named | Markings read | Avg s |");
console.log("|---|---|---|---|---|");
for (const model of models) {
  const rows = results.filter((r) => r.model === model && !r.error);
  const avg = rows.reduce((a, r) => a + r.seconds, 0) / Math.max(1, rows.length);
  console.log(`| ${model} | ${rows.length} | ${rows.filter((r) => r.name).length} | ${rows.filter((r) => r.markings.length > 0).length} | ${avg.toFixed(1)} |`);
}
