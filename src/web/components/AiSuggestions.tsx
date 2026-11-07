import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Sparkles } from "lucide-react";
import type { AiFill, AiStatus, ItemDetail, ResearchResult, Suggestion } from "../../shared/api";
import { api } from "../api";
import { Button } from "./ui";

// AI data fill (DEC-048). One button: "Suggest details with AI". The server reads the part's
// photos, searches the web and comes back with suggestions, each with where it came from and
// how sure it is. Nothing goes into the form until "Use" is pressed, and a used value is marked
// as filled in by AI (shown on the part's page) until it's typed over by hand.

export function useAiStatus() {
  const { data } = useQuery({ queryKey: ["ai", "status"], queryFn: () => api<AiStatus>("/ai/status"), staleTime: 60_000, retry: false });
  return data;
}

export const host = (source: string) => {
  if (source === "photo") return "the photo";
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
  }
};

const confidenceTone: Record<Suggestion["confidence"], string> = {
  high: "text-ok border-ok/50",
  medium: "text-warn border-warn/50",
  low: "text-muted border-border",
};
const confidenceWord: Record<Suggestion["confidence"], string> = { high: "sure", medium: "likely", low: "a guess" };

export function AiSuggestions({ item, used, onUse }: { item: ItemDetail; used: Record<string, AiFill>; onUse: (s: Suggestion) => void }) {
  const status = useAiStatus();
  const [result, setResult] = useState<ResearchResult | null>(null);
  const research = useMutation({
    mutationFn: () => api<ResearchResult>(`/items/${item.id}/research`, { method: "POST" }),
    onSuccess: setResult,
  });
  const usedHere = (s: Suggestion) => used[s.field] !== undefined && used[s.field]!.source === s.source;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-3" aria-label="AI suggestions">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => research.mutate()} disabled={research.isPending || status?.modelReady === false}>
          <Sparkles size={18} /> {research.isPending ? "Looking it up…" : result ? "Look again" : "Suggest details with AI"}
        </Button>
        <span className="text-[13px] text-muted">
          {status?.modelReady === false
            ? `The model (${status.model}) isn't downloaded yet.`
            : research.isPending
              ? "Reading the photos, searching the web, filling in what it finds. About a minute."
              : "Reads the photos and looks the part up. Nothing is saved until you press Use."}
        </span>
      </div>
      {research.isError && <p className="text-sm text-danger" role="alert">{(research.error as Error).message}</p>}
      {result && (
        <div className="flex flex-col gap-2" data-ai-result>
          <p className="text-sm">
            <span className="text-muted">It looks like: </span>
            {result.identified}
          </p>
          {result.markings.length > 0 && (
            <p className="text-[13px] text-muted">
              Read off the part: <span className="font-mono text-text">{result.markings.join(" · ")}</span>
            </p>
          )}
          {result.suggestions.length === 0 ? (
            <p className="text-sm text-muted">Nothing it was sure enough about to suggest.</p>
          ) : (
            <>
              <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
                {result.suggestions.map((s) => (
                  <li key={s.field} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[13px] text-muted">{s.label}</span>
                        <span className={`rounded-full border px-1.5 text-[11px] ${confidenceTone[s.confidence]}`}>{confidenceWord[s.confidence]}</span>
                      </div>
                      <div className="break-words text-sm">{s.value}</div>
                      <div className="text-[12px] text-muted">
                        from{" "}
                        {s.source === "photo" ? (
                          "the photo"
                        ) : (
                          <a href={s.source} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent">
                            {host(s.source)} <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                    {usedHere(s) ? (
                      <span className="inline-flex min-h-9 items-center gap-1 px-2 text-sm text-ok"><Check size={16} /> Used</span>
                    ) : (
                      <Button type="button" variant="ghost" className="shrink-0" onClick={() => onUse(s)} aria-label={`Use ${s.label}: ${s.value}`}>
                        Use
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {result.suggestions.some((s) => !usedHere(s)) && (
                <Button type="button" variant="ghost" className="self-start" onClick={() => result.suggestions.forEach((s) => { if (!usedHere(s)) onUse(s); })}>
                  Use all
                </Button>
              )}
            </>
          )}
          {result.notes.length > 0 && (
            <ul className="list-disc pl-5 text-[13px] text-muted">
              {result.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          {result.sources.length > 0 && (
            <p className="text-[12px] text-muted">
              Pages read: {result.sources.map((s, i) => (
                <span key={s.url}>
                  {i > 0 && ", "}
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent">{host(s.url)}</a>
                </span>
              ))}
            </p>
          )}
          <p className="text-[12px] text-muted">A small local model did this; it can be wrong. Values you use are marked as filled in by AI until you change them.</p>
        </div>
      )}
    </section>
  );
}
