import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Printer, QrCode } from "lucide-react";
import type { CodesCheck } from "../../shared/api";
import {
  DEFAULT_STYLE,
  PT_PER_INCH,
  TEMPLATES,
  capacity,
  getTemplate,
  layoutPages,
  layoutSheet,
  pageSvg,
  printThenCut,
  randomCodes,
  slotsOf,
  type LabelTemplate,
} from "../../shared/labels";
import { api } from "../api";
import { Button, Card, Field, inputClass } from "../components/ui";

// Print stickers (DEC-052): sheets of QR stickers with fresh random codes, either a PDF for a
// die-cut label sheet (SheetLabels.com, Avery) or a transparent PNG for Cricut Print Then Cut on
// blank sticker vinyl. The codes aren't recorded anywhere: a sticker becomes something the first
// time it's scanned onto a bin or a part, which is how every sticker so far has worked. The
// layouts come from Colin's qr-label-creator, measurements tuned on real prints.

type Output = "sheet" | "cricut";

function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (localStorage.getItem(key) as T | null) ?? initial);
  return [
    value,
    (v: T) => {
      localStorage.setItem(key, v);
      setValue(v);
    },
  ];
}

const inches = (pt: number) => (Math.round((pt / PT_PER_INCH) * 100) / 100).toString();

function download(name: string, data: Blob | Uint8Array, type: string) {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Today's date as the device sees it (not UTC's), for the file name. */
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function PrintStickersPage() {
  const [templateName, setTemplateName] = useStored<string>("stickers.template", "SL588");
  const [output, setOutput] = useStored<Output>("stickers.output", "cricut");
  const [title, setTitle] = useStored<string>("stickers.title", DEFAULT_STYLE.title);
  const [subtitle, setSubtitle] = useStored<string>("stickers.subtitle", DEFAULT_STYLE.subtitle);
  // The Print Then Cut area for the machine and paper, from Cricut's help page "How large can I
  // Print Then Cut" (Maker on Letter: 7.44 in across, 9.94 in tall), and the corner each sensor
  // mark takes out of it (not stated; Colin measured the rectangle inside the marks at 6.77 × 9.27 in,
  // which leaves 0.335 in at each side).
  const [cutW, setCutW] = useStored<string>("stickers.cutWidth", "7.44");
  const [cutH, setCutH] = useStored<string>("stickers.cutHeight", "9.94");
  const [notchW, setNotchW] = useStored<string>("stickers.notchWidth", "0.335");
  const [notchH, setNotchH] = useStored<string>("stickers.notchHeight", "0.335");
  const [sheets, setSheets] = useState("1");
  const [skip, setSkip] = useState("0");
  const [outlines, setOutlines] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ count: number; sheets: number; template: LabelTemplate; output: Output } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = getTemplate(templateName);
  const cutArea: [number, number] = [Math.max(2, Number(cutW) || 7.44) * PT_PER_INCH, Math.max(2, Number(cutH) || 9.94) * PT_PER_INCH];
  const notch: [number, number] = [Math.max(0, Number(notchW) || 0) * PT_PER_INCH, Math.max(0, Number(notchH) || 0) * PT_PER_INCH];
  const template = output === "cricut" ? printThenCut(base, { area: cutArea, notch }) : base;
  const leftOut = output === "cricut" ? template.columns * template.rows - slotsOf(template).length : 0;
  const perSheet = slotsOf(template).length;
  const sheetCount = Math.min(20, Math.max(1, Number(sheets) || 1));
  const skipCount = output === "sheet" ? Math.min(perSheet - 1, Math.max(0, Number(skip) || 0)) : 0;
  const total = capacity(template, sheetCount, skipCount);
  const style = { ...DEFAULT_STYLE, title, subtitle };

  // The preview is the first sheet with sample codes; the real codes are drawn fresh on Make.
  const sample = useMemo(() => randomCodes(perSheet), [perSheet]);
  const preview = useMemo(
    () => pageSvg(layoutSheet(template, sample.slice(0, perSheet - skipCount), style, { skip: skipCount, background: output === "cricut", outlines: output === "sheet" && outlines })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [template, sample, skipCount, title, subtitle, output, outlines, cutW, cutH, notchW, notchH],
  );
  const previewUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`, [preview]);

  useEffect(() => {
    setDone(null);
  }, [templateName, output, sheets, skip, title, subtitle, outlines, cutW, cutH, notchW, notchH]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      // Fresh codes, and none that's already on something here (a one-in-a-trillion chance, checked anyway).
      let codes = randomCodes(total);
      for (let round = 0; round < 3; round++) {
        const { used } = await api<CodesCheck>("/stickers/check", { method: "POST", body: { codes } });
        if (used.length === 0) break;
        const fresh = randomCodes(used.length);
        codes = codes.filter((c) => !used.includes(c)).concat(fresh);
      }
      const pages = layoutPages(template, codes, style, { skip: skipCount, background: output === "cricut", outlines: output === "sheet" && outlines });
      if (output === "sheet") {
        const { pagesToPdf } = await import("../labels/pdf");
        download(`stickers-${base.name}-${stamp()}.pdf`, await pagesToPdf(pages), "application/pdf");
      } else {
        const { pageToPng } = await import("../labels/png");
        for (let i = 0; i < pages.length; i++) {
          const suffix = pages.length > 1 ? `-p${i + 1}` : "";
          download(`stickers-${base.name}-cricut-${stamp()}${suffix}.png`, await pageToPng(pages[i]!), "image/png");
        }
      }
      setDone({ count: codes.length, sheets: pages.length, template, output });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-5xl">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <QrCode size={22} className="text-accent" /> Print stickers
        </h1>
        <p className="text-[13px] text-muted">
          Sheets of QR stickers with new codes. A sticker becomes something the first time you scan it onto a bin or a part, so nothing is
          recorded here.
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-4">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">Print on</span>
            <div className="flex gap-2" role="group" aria-label="Print on">
              <Choice on={output === "cricut"} onClick={() => setOutput("cricut")} label="Sticker vinyl, Cricut" hint="A PNG for Print Then Cut" />
              <Choice on={output === "sheet"} onClick={() => setOutput("sheet")} label="Die-cut sheet" hint="A PDF, printed at 100%" />
            </div>
            <Field label={output === "cricut" ? "Label size (from a sheet template)" : "Sheet"}>
              <select value={templateName} onChange={(e) => setTemplateName(e.target.value)} className={inputClass} aria-label="Sheet template">
                {TEMPLATES.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}: {t.description}
                  </option>
                ))}
              </select>
            </Field>
            {base.url && (
              <a href={base.url} target="_blank" rel="noreferrer" className="-mt-1 text-[13px] text-accent">
                The sheet at the maker's site
              </a>
            )}
            {output === "cricut" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cut area width (in)">
                    <input inputMode="decimal" value={cutW} onChange={(e) => setCutW(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} aria-label="Cut area width (in)" />
                  </Field>
                  <Field label="Cut area height (in)">
                    <input inputMode="decimal" value={cutH} onChange={(e) => setCutH(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} aria-label="Cut area height (in)" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Corner notch width (in)">
                    <input inputMode="decimal" value={notchW} onChange={(e) => setNotchW(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} aria-label="Corner notch width (in)" />
                  </Field>
                  <Field label="Corner notch height (in)">
                    <input inputMode="decimal" value={notchH} onChange={(e) => setNotchH(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} aria-label="Corner notch height (in)" />
                  </Field>
                </div>
                <p className="-mt-1 text-[13px] text-muted">
                  The cut area is the most Design Space lets your machine Print Then Cut on your paper, from Cricut's page{" "}
                  <a href="https://help.cricut.com/hc/en-us/articles/360009429814-How-large-can-I-Print-Then-Cut" target="_blank" rel="noreferrer" className="text-accent">
                    How large can I Print Then Cut
                  </a>{" "}
                  (a Maker on Letter: 7.44 × 9.94 in). Its corners are reserved for the sensor marks, so any sticker that would touch a corner notch is left
                  out. Cricut doesn't say how big the notches are; 0.335 in is what's left around the 6.77 × 9.27 in rectangle measured inside the marks. If
                  Design Space says the image is too big, make the notches bigger.
                </p>
              </>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">Words on each sticker</span>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title">
                <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Subtitle">
                <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={inputClass} placeholder="None" />
              </Field>
            </div>
            <p className="text-[13px] text-muted">The code is printed under them, so a sticker can be typed in if it ever won't scan.</p>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">How many</span>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sheets">
                <input inputMode="numeric" pattern="[0-9]*" value={sheets} onChange={(e) => setSheets(e.target.value.replace(/\D/g, ""))} className={`${inputClass} w-24`} aria-label="Sheets" />
              </Field>
              {output === "sheet" && (
                <Field label="Skip used labels">
                  <input inputMode="numeric" pattern="[0-9]*" value={skip} onChange={(e) => setSkip(e.target.value.replace(/\D/g, ""))} className={`${inputClass} w-24`} aria-label="Skip used labels" placeholder="0" />
                </Field>
              )}
            </div>
            <p className="text-[13px] text-muted">
              {perSheet} per sheet{leftOut ? ` (${template.columns} across by ${template.rows} down, less the ${leftOut} at the corners)` : ""}
              {skipCount ? `, ${skipCount} left blank on the first` : ""}: <strong className="text-text">{total} stickers</strong>.
            </p>
            {output === "sheet" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={outlines} onChange={(e) => setOutlines(e.target.checked)} className="h-5 w-5" />
                Draw the label edges (a test print on plain paper to hold against the sheet)
              </label>
            )}
          </Card>

          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <Button type="button" variant="primary" onClick={make} disabled={busy || total < 1} className="self-start">
            <Download size={18} /> {busy ? "Making…" : output === "sheet" ? "Make the PDF" : "Make the PNG"}
          </Button>

          {done && (
            <div data-done>
            <Card className="flex flex-col gap-2 p-4">
              <p className="text-sm">
                <strong>{done.count} stickers</strong> on {done.sheets} {done.sheets === 1 ? "sheet" : "sheets"}, downloaded.
              </p>
              {done.output === "sheet" ? (
                <p className="text-[13px] text-muted">Print the PDF at 100% (actual size, no scaling) on the {base.name} sheet.</p>
              ) : (
                <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] text-muted">
                  <li>
                    In Design Space: Upload → Upload Image → the PNG. Pick Complex if asked, and Continue past background removal (it's already
                    transparent). Choose Print Then Cut image.
                  </li>
                  <li>
                    With the image selected, set its size to{" "}
                    <strong className="font-mono text-text">
                      W {inches(done.template.pageSize[0])} in × H {inches(done.template.pageSize[1])} in
                    </strong>
                    . Design Space doesn't always size uploads right.
                  </li>
                  <li>Make It, print at 100% with no scaling, load the sheet on the mat top-left, and cut.</li>
                </ol>
              )}
            </Card>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-muted">
            Preview <span className="font-normal normal-case tracking-normal">(sample codes; the real ones are drawn when you press Make)</span>
          </span>
          <div className={`rounded-xl border border-border p-2 ${output === "cricut" ? "bg-[repeating-conic-gradient(#8883_0_25%,transparent_0_50%)] bg-[length:16px_16px]" : "bg-white"}`}>
            <img src={previewUrl} alt={`Preview of a ${template.name} sheet`} className="block h-auto w-full" data-preview />
          </div>
          <p className="text-[13px] text-muted">
            {output === "cricut"
              ? `${inches(template.pageSize[0])} × ${inches(template.pageSize[1])} in, the whole cut area, white labels on a transparent background${leftOut ? ", the corners left clear for the sensor marks" : ""}.`
              : `${inches(template.pageSize[0])} × ${inches(template.pageSize[1])} in paper.`}{" "}
            Scanning a printed sticker opens the <Link to="/scan/x" className="text-accent" onClick={(e) => e.preventDefault()}>new sticker</Link> choice: a part or a bin.
          </p>
        </div>
      </div>
    </div>
  );
}

function Choice({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-12 flex-1 flex-col items-start rounded-xl border px-3 py-2 text-left ${on ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-text"}`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[12px] text-muted">{hint}</span>
    </button>
  );
}

export { Printer };
