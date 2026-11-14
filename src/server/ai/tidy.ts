import type { Chat } from "./ollama";
import { NAMING } from "./research";

// Tidy a category's names (DEC-076): the names typed over months, rewritten to the one naming
// convention (DEC-065) so parts of a kind read alike. Text only, no photos, one request per batch.
// The model only reorders and tidies what is already known about each part: a number in a
// suggested name must already be in the part's name or one of its field values, or the
// suggestion is dropped. Nothing is renamed here; the owner approves each on the screen.

export type TidyPart = { id: number; name: string; fields: Record<string, string> };
export type TidySuggestion = { id: number; name: string; suggestion: string };

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const BATCH = 25;

const schema = {
  type: "object",
  properties: { names: { type: "array", items: { type: "object", properties: { id: { type: "integer" }, name: { type: "string" } }, required: ["id", "name"] } } },
  required: ["names"],
};

/** A suggested name that adds nothing the part's record doesn't hold. */
export function grounded(part: TidyPart, suggestion: string): boolean {
  const known = squash([part.name, ...Object.values(part.fields)].join(" "));
  return (suggestion.match(/[A-Za-z]*\d[\w.\-/]*/g) ?? []).every((token) => known.includes(squash(token)));
}

export async function tidyNames(chat: Chat, category: string, parts: TidyPart[]): Promise<TidySuggestion[]> {
  const out: TidySuggestion[] = [];
  for (let i = 0; i < parts.length; i += BATCH) {
    const batch = parts.slice(i, i + BATCH);
    const lines = batch.map((p) => {
      const fields = Object.entries(p.fields).map(([k, v]) => `${k}: ${v}`).join("; ");
      return `${p.id}. "${p.name}"${fields ? ` (${fields})` : ""}`;
    });
    const raw = await chat({
      messages: [
        {
          role: "system",
          content: `You tidy the names of parts in a home workshop's inventory so that parts of one kind read alike. ${NAMING} Use only what is given for each part: its current name and its details. Never add a value, brand or number that isn't there, and never drop a part number or model that is in the current name. Keep units as written. If a name already reads this way, return it unchanged. Answer in JSON: {"names":[{"id":<the part's number>,"name":"<its name>"}]}, one entry per part.`,
        },
        { role: "user", content: `Category: ${category}\nParts:\n${lines.join("\n")}` },
      ],
      schema,
      temperature: 0,
    });
    let parsed: { names?: { id?: unknown; name?: unknown }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("The AI's answer couldn't be read");
    }
    for (const n of parsed.names ?? []) {
      const part = batch.find((p) => p.id === n.id);
      const suggestion = typeof n.name === "string" ? n.name.trim().replace(/\s+/g, " ") : "";
      if (!part || !suggestion || suggestion.length > 120 || suggestion === part.name || out.some((o) => o.id === part.id)) continue;
      if (!grounded(part, suggestion)) continue;
      out.push({ id: part.id, name: part.name, suggestion });
    }
  }
  return out;
}
