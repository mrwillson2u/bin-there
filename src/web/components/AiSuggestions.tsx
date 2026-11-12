import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { AiFill, AiStatus, ItemDetail, ResearchRequest, ResearchResult, Suggestion } from "../../shared/api";
import { api } from "../api";
import { Button } from "./ui";

// AI data fill (DEC-048). One button: "Suggest details with AI". The server reads the part's
// photos, searches the web and comes back with suggestions, each with where it came from and
// how sure it is. Nothing goes into the form until "Use" is pressed, and a used value is marked
// as filled in by AI (shown on the part's page) until it's typed over by hand. An answer kept on
// the part (DEC-055: queued at capture, or the last run) shows straight away, and a part in the
// queue shows its place and a Cancel.

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

// `form` is what the form holds right now (name, link, supplier, part number): the look-up uses
// that, not the saved record, so a link pasted in a moment ago is read without saving first.
export function AiSuggestions({ item, form, used, onUse }: { item: ItemDetail; form?: ResearchRequest; used: Record<string, AiFill>; onUse: (s: Suggestion) => void }) {
  const status = useAiStatus();
  const qc = useQueryClient();
  const [result, setResult] = useState<ResearchResult | null>(item.aiResult);
  // A stored answer arriving later (the queue finished while the form was open) shows too.
  useEffect(() => {
    if (item.aiResult) setResult(item.aiResult);
  }, [item.aiResult]);
  const research = useMutation({
    mutationFn: () => api<ResearchResult>(`/items/${item.id}/research`, { method: "POST", body: form ?? {} }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["item", item.id] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => api<ItemDetail>(`/items/${item.id}/research/queue`, { method: "DELETE" }),
    onSuccess: (d) => qc.setQueryData(["item", d.id], d),
  });
  const dismiss = useMutation({
    mutationFn: () => api<ItemDetail>(`/items/${item.id}/research`, { method: "DELETE" }),
    onSuccess: (d) => {
      qc.setQueryData(["item", d.id], d);
      setResult(null);
    },
  });
  const usedHere = (s: Suggestion) => used[s.field] !== undefined && used[s.field]!.source === s.source;
  const job = item.aiJob;
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-3" aria-label="AI suggestions">
      {job && job.state !== "failed" && (
        <div data-ai-job={job.state} className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <Loader2 size={18} className="shrink-0 animate-spin text-accent" aria-hidden />
          <span>{job.state === "running" ? "The AI is looking it up now…" : "Queued for the AI: it's looked up in the background, one part at a time."}</span>
          <Button type="button" variant="ghost" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancel
          </Button>
        </div>
      )}
      {job?.state === "failed" && (
        <p className="text-sm text-danger" role="alert">
          The AI couldn't look it up{job.error ? `: ${job.error}` : ""}.{" "}
          <button type="button" onClick={() => dismiss.mutate()} className="text-accent underline">Dismiss</button>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => research.mutate()} disabled={research.isPending || status?.modelReady === false || (!!job && job.state !== "failed")}>
          <Sparkles size={18} /> {research.isPending ? "Looking it up…" : result ? "Look again" : "Suggest details with AI"}
        </Button>
        <span className="text-[13px] text-muted">
          {status?.modelReady === false
            ? `The model (${status.model}) isn't downloaded yet.`
            : research.isPending
              ? "Reading the shop page, or the photos and the web, and filling in what it finds. About a minute."
              : result && item.aiResult && result === item.aiResult
                ? `Looked up ${when(item.aiResult.at)}${item.aiResult.mode === "quick" ? " (the photo alone)" : ""}. Nothing is saved until you press Use.`
                : "Reads the shop page in Link (or finds it from Supplier and Supplier part #), else the photos and the web. Nothing is saved until you press Use."}
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
