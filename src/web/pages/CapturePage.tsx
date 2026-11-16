import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import type { PutAwayState } from "./PutBackPage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, MapPin, QrCode, ScanBarcode, Sparkles, X } from "lucide-react";
import { trackingLabels, trackingModes, type CreateItem, type ItemDetail, type LocationDetail, type ScanResult, type StockLevel, type TrackingMode } from "../../shared/api";
import { api, uploadPhoto } from "../api";
import { preparePhoto } from "../lib/photo";
import { readBagCode } from "../lib/bagcode";
import { bagPartNumber, bagText, type BagCode } from "../../shared/bagcode";
import { useScanHandler } from "../scan/ScanProvider";
import { ScanTarget } from "../scan/ScanTarget";
import { useAiStatus } from "../components/AiSuggestions";
import { PickLocation } from "../components/PickLocation";
import { LevelButtons } from "../components/StockControl";
import { Button, Card, Field, inputClass, pathText } from "../components/ui";

/**
 * Quick capture (F5): sticker → photo → save, details later.
 * While open, scans fill the form: a location sticker sets where it goes,
 * a fresh sticker becomes the item's own sticker.
 * How it's counted is chosen here (DEC-055): an exact count of 1 unless changed, or
 * Plenty / low / out; a choice made here is kept when a category is picked later.
 * "Look it up with AI after saving" queues each saved part for the AI (DEC-055).
 * A shop bag's 2D barcode in the photo is read on the spot (DEC-074): its part number is saved
 * with the part, and the bag's quantity becomes the count unless one was typed.
 * Opened from Put away (`?from=putaway`, DEC-089) it is "New item": one thing, Save asks where
 * it goes when no place is set, and then it goes back to Put away with the tally.
 * What's on the form is kept for the tab until it's saved or left (DEC-091): a phone that reloads
 * the page behind the camera brings it back as it was. A photo is shrunk as soon as it's taken,
 * so the full-size one is never held.
 * More than one photo can be taken (DEC-092): the part first, then say the shop's bag; the first is
 * the part's main photo, and a bag code is read from whichever photo has one.
 */
const DRAFT = "capture.draft";
type Shot = { id: number; photo: Blob; thumb: Blob; bag: BagCode | null };
type ShotText = { photo: string; thumb: string; bag: BagCode | null };
type Draft = {
  /** The address the form was opened with; a draft only comes back to the same one. */
  search: string;
  code: string | null;
  locationId: number | null;
  name: string;
  tracking: TrackingMode;
  qty: string;
  qtyTyped: boolean;
  level: StockLevel;
  photos: ShotText[];
};
function readDraft(search: string): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? "null") as Draft | null;
    return d && d.search === search && Array.isArray(d.photos) ? d : null;
  } catch {
    return null;
  }
}
const dataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
const fromDataUrl = (u: string) => fetch(u).then((r) => r.blob());

export function CapturePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const search = params.toString();
  const [draft] = useState(() => readDraft(search));
  const [code, setCode] = useState<string | null>(draft ? draft.code : params.get("code"));
  const [locationId, setLocationId] = useState<number | null>(draft ? draft.locationId : params.get("location") ? Number(params.get("location")) : null);
  // The photos as they will be uploaded: shrunk on the spot, the originals let go. The first is the part's main photo.
  const [photos, setPhotos] = useState<Shot[]>([]);
  const [reading, setReading] = useState(0);
  const photo = photos[0] ?? null;
  const bag = photos.find((x) => x.bag)?.bag ?? null;
  const [name, setName] = useState(draft ? draft.name : (params.get("name") ?? ""));
  const putAway = params.get("from") === "putaway";
  const tally = ((useLocation().state ?? {}) as PutAwayState).tally ?? 0;
  const backToPutAway = (added?: PutAwayState["added"]) => navigate("/putback", { replace: true, state: { tally, added } satisfies PutAwayState });
  // Save pressed with no place set (from Put away): where is it going?
  const [asking, setAsking] = useState(false);
  const askBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (asking) askBox.current?.scrollIntoView({ block: "center" });
  }, [asking]);
  const [tracking, setTracking] = useState<TrackingMode>(draft?.tracking ?? "exact");
  const [qty, setQty] = useState(draft?.qty ?? "1");
  const [qtyTyped, setQtyTyped] = useState(draft?.qtyTyped ?? false);
  const [level, setLevel] = useState<StockLevel>(draft?.level ?? "plenty");
  const ai = useAiStatus();
  const [aiAfter, setAiAfterState] = useState(() => localStorage.getItem("capture.ai") !== "off");
  const setAiAfter = (on: boolean) => {
    localStorage.setItem("capture.ai", on ? "on" : "off");
    setAiAfterState(on);
  };
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ItemDetail[]>([]);

  const { data: location } = useQuery({
    queryKey: ["location", locationId],
    queryFn: () => api<LocationDetail>(`/locations/${locationId}`),
    enabled: locationId !== null,
  });

  // A photo just taken: shrunk for upload, and a shop bag's barcode looked for in the full one (DEC-074), both at once.
  const shotId = useRef(0);
  // Bumped when the form is emptied, so a photo still being read doesn't land on the next part.
  const round = useRef(0);
  const takePhoto = async (file: File | null) => {
    if (!file) return;
    const r = round.current;
    setReading((n) => n + 1);
    setError(null);
    try {
      const [shot, b] = await Promise.all([preparePhoto(file), readBagCode(file)]);
      if (r === round.current) setPhotos((list) => [...list, { id: ++shotId.current, ...shot, bag: b }]);
    } catch (e) {
      if (r === round.current) setError((e as Error).message);
    } finally {
      setReading((n) => n - 1);
    }
  };
  // The photos a draft held come back with it.
  const [restoring, setRestoring] = useState(() => (draft?.photos.length ?? 0) > 0);
  useEffect(() => {
    if (!draft?.photos.length) return;
    const r = round.current;
    void Promise.all(draft.photos.map(async (t) => ({ id: ++shotId.current, photo: await fromDataUrl(t.photo), thumb: await fromDataUrl(t.thumb), bag: t.bag })))
      .then((back) => {
        if (r === round.current) setPhotos((list) => [...back, ...list]);
      })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, [draft]);
  // Kept as it changes; gone once the screen is left (a reload doesn't run this clean-up, which is the point).
  const texts = useRef(new Map<number, ShotText>());
  useEffect(() => {
    // While a draft's photos are still being read back, don't write over them.
    if (restoring) return;
    let current = true;
    const write = (pics: ShotText[]) => {
      const d: Draft = { search, code, locationId, name, tracking, qty, qtyTyped, level, photos: pics };
      // If the tab's storage has no room, keep as many photos as fit, and the rest of the form whatever happens.
      for (let n = pics.length; n >= 0; n--) {
        try {
          sessionStorage.setItem(DRAFT, JSON.stringify({ ...d, photos: pics.slice(0, n) }));
          return;
        } catch {}
      }
    };
    void Promise.all(
      photos.map(async (x) => {
        let t = texts.current.get(x.id);
        if (!t) {
          t = { photo: await dataUrl(x.photo), thumb: await dataUrl(x.thumb), bag: x.bag };
          texts.current.set(x.id, t);
        }
        return t;
      }),
    )
      .then((pics) => current && write(pics))
      .catch(() => current && write([]));
    return () => {
      current = false;
    };
  }, [search, code, locationId, name, tracking, qty, qtyTyped, level, photos, restoring]);
  useEffect(() => () => sessionStorage.removeItem(DRAFT), []);
  // The count the bag shipped with, unless a count was typed.
  const bagQty = bag?.qty && !qtyTyped && !code && tracking === "exact" ? String(bag.qty) : null;
  const count = bagQty ?? qty;

  useScanHandler((scanned) => {
    if (picking || asking) return false; // PickLocation handles it
    setError(null);
    api<ScanResult>(`/scan/${encodeURIComponent(scanned)}`)
      .then((r) => {
        if (r.kind === "location") setLocationId(r.location.id);
        else if (r.kind === "unassigned") setCode(r.code);
        else setError(`Sticker ${scanned} is already on an item`);
      })
      .catch((e: Error) => setError(e.message));
    return true;
  });

  const save = async (place: number | null = locationId) => {
    setAsking(false);
    setSaving(true);
    setError(null);
    try {
      // A part with its own sticker is a returnable unit; it isn't counted here.
      const body: CreateItem = {
        name: name.trim() || undefined,
        code: code ?? undefined,
        locationId: place ?? undefined,
        tracking: code ? undefined : tracking,
        qty: !code && tracking === "exact" && count ? Number(count) : undefined,
        level: !code && tracking === "level" ? level : undefined,
      };
      let item = await api<ItemDetail>("/items", { method: "POST", body });
      // In the order taken: the first becomes the part's main photo.
      for (const x of photos) item = await uploadPhoto<ItemDetail>(item.id, x.photo, x.thumb);
      // What the bag's barcode said goes on the part before the AI looks, so it starts from the exact number.
      const pn = bag ? bagPartNumber(bag) : null;
      if (bag && pn) item = await api<ItemDetail>(`/items/${item.id}`, { method: "PATCH", body: { supplierPn: pn, ...(bag.supplier ? { supplier: bag.supplier } : {}) } });
      // Queued for the AI (DEC-055): looked up in the background, the answer kept for review.
      if (aiAfter && ai?.enabled && (photo || name.trim())) {
        api(`/items/${item.id}/research/queue`, { method: "POST" }).catch((e: Error) => setError(`Saved, but couldn't queue it for the AI: ${e.message}`));
      }
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["location"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      if (putAway) return backToPutAway({ itemId: item.id, locationId: place });
      setSaved((s) => [item, ...s]);
      // Ready for the next one; keep the location (cataloging a bin at a time).
      setCode(null);
      round.current++;
      texts.current.clear();
      setPhotos([]);
      setName("");
      setQty("1");
      setQtyTyped(false);
      setLevel("plenty");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-2xl">
      <h1 className="text-xl font-semibold">{putAway ? "New item" : "Quick capture"}</h1>

      {saved[0] && (
        <p className="rounded-xl bg-ok/15 px-4 py-3 text-sm text-ok" role="status">
          Saved{" "}
          <Link to={`/items/${saved[0].id}`} className="underline">
            {saved[0].name || "item"}
          </Link>
          {saved.length > 1 && ` (${saved.length} this session)`}. Scan or snap the next one.
        </p>
      )}
      {saved[0]?.similar[0] && (
        <p className="rounded-xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm" role="status" data-similar>
          You may already have this:{" "}
          <Link to={`/items/${saved[0].similar[0].id}`} className="font-semibold underline">
            {saved[0].similar[0].name || "a part"}
          </Link>
          {saved[0].similar[0].where ? ` in ${saved[0].similar[0].where}` : ""} ({saved[0].similar[0].why === "number" ? "same part number" : "same name"}).{" "}
          <Link to="/needs-details" className="text-accent underline">
            Fill in details
          </Link>{" "}
          can add this one to it.
        </p>
      )}

      {photo ? (
        <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-surface">
          <BlobImg blob={photo.photo} alt="Item photo" className="h-full w-full object-cover" />
        </div>
      ) : (
        <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface text-muted active:bg-surface-2">
          {reading > 0 || restoring ? (
            <span className="font-semibold text-text" role="status">Reading the photo…</span>
          ) : (
            <>
              <Camera size={40} className="text-accent" />
              <span className="font-semibold text-text">Take photo</span>
            </>
          )}
          <PhotoInput onFile={takePhoto} />
        </label>
      )}
      {photo && (
        <div className="flex flex-wrap items-center gap-2" data-capture-photos>
          {photos.map((x, i) => (
            <div key={x.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border">
              <BlobImg blob={x.thumb} alt={i === 0 ? "Photo 1, the main photo" : `Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  texts.current.delete(x.id);
                  setPhotos((list) => list.filter((y) => y.id !== x.id));
                }}
                aria-label={`Remove photo ${i + 1}`}
                className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-bl-lg bg-black/60 text-white"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <label className="flex h-16 min-w-16 cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border bg-surface px-3 text-sm font-semibold text-accent active:bg-surface-2">
            {reading > 0 ? (
              <span role="status">Reading…</span>
            ) : (
              <>
                <Camera size={18} /> Add another photo
              </>
            )}
            <PhotoInput onFile={takePhoto} />
          </label>
        </div>
      )}
      {!bag && (
        <p className="flex items-start gap-2 text-[13px] text-muted" data-bag-hint>
          <ScanBarcode size={16} className="mt-0.5 shrink-0" />
          <span>From Mouser or Digi-Key? {photo ? "Add a photo of" : "Include"} the bag's label: its barcode gives the part number and how many.</span>
        </p>
      )}

      {bag && (
        <p className="flex items-center gap-2 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm" role="status" data-bag-code>
          <ScanBarcode size={18} className="shrink-0 text-ok" />
          <span>
            Bag barcode read: <strong>{bagText(bag)}</strong>
            {bag.qty ? ` · ${bag.qty} in the bag` : ""}. Its part number is saved with the part.
          </span>
        </p>
      )}

      <Card className="flex flex-col divide-y divide-border">
        <Row icon={<QrCode size={18} />} label="Sticker">
          {code ? (
            <span className="flex items-center gap-1 text-sm text-ok">
              Attached
              <button onClick={() => setCode(null)} aria-label="Remove sticker" className="flex min-h-11 w-9 items-center justify-center text-muted">
                <X size={16} />
              </button>
            </span>
          ) : (
            <span className="text-sm text-muted">None. Scan one to attach</span>
          )}
        </Row>
        <Row icon={<MapPin size={18} />} label="Going in">
          {location ? (
            <button onClick={() => setPicking(true)} className="min-h-11 text-right text-sm">
              {pathText(location.path)}
            </button>
          ) : (
            <button onClick={() => setPicking(true)} className="min-h-11 text-sm text-accent">Scan bin or pick</button>
          )}
        </Row>
      </Card>

      {picking && (
        <PickLocation
          title="Scan the bin it's going in"
          onPick={(l) => {
            setLocationId(l.id);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      )}

      <Field label="Name (optional)">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Later is fine" />
      </Field>
      {code && (
        <p className="text-[13px] text-muted" data-own-sticker-note>
          With its own sticker this is one thing, so there's no count. To count several, remove the sticker.
        </p>
      )}
      {!code && (
        <div className="grid grid-cols-[1fr_7rem] items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-muted">Keep track by</span>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Keep track by">
              {trackingModes.map((t) => (
                <button
                  type="button"
                  key={t}
                  role="radio"
                  aria-checked={tracking === t}
                  onClick={() => setTracking(t)}
                  className={`min-h-11 rounded-xl border px-2 text-sm leading-tight ${tracking === t ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2"}`}
                >
                  {trackingLabels[t]}
                </button>
              ))}
            </div>
          </div>
          {tracking === "exact" ? (
            <Field label="How many?">
              <input inputMode="numeric" value={count} onChange={(e) => { setQty(e.target.value.replace(/\D/g, "")); setQtyTyped(true); }} className={`${inputClass} text-center font-mono`} placeholder="—" aria-label="How many?" />
            </Field>
          ) : (
            <span />
          )}
          {tracking === "level" && (
            <div className="col-span-2">
              <LevelButtons value={level} onPick={setLevel} compact label="How much is there" />
            </div>
          )}
        </div>
      )}
      {ai?.enabled && (
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={aiAfter} onChange={(e) => setAiAfter(e.target.checked)} className="h-5 w-5" />
          <Sparkles size={16} className="shrink-0 text-accent" />
          <span>
            Look it up with AI after saving
            <span className="block text-[12px] text-muted">In the background, one part at a time; the suggestions wait on the part for you to review.</span>
          </span>
        </label>
      )}

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      {asking && (
        <div ref={askBox}>
          <PickLocation title="Scan the bin it's going in" onPick={(l) => void save(l.id)} onCancel={() => setAsking(false)}>
            <p className="text-sm font-semibold">Where is it going?</p>
            <Button variant="ghost" onClick={() => void save(null)} className="self-start">No place yet: save anyway</Button>
          </PickLocation>
        </div>
      )}

      {!picking && !asking && <ScanTarget compact what={code ? "Scan the bin it's going in" : "Scan the bin it's going in, or its own new sticker"} />}

      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={() => (putAway && locationId === null ? setAsking(true) : void save())}
          disabled={saving || asking || reading > 0 || restoring || (!photo && !name.trim() && !code)}
          className="min-h-14 flex-1 text-lg"
        >
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => (putAway ? backToPutAway() : navigate(locationId !== null ? `/locations/${locationId}` : "/"))} className="min-h-14">
          {saved.length > 0 ? "Done" : "Cancel"}
        </Button>
      </div>
      <p className="text-center text-[13px] text-muted">
        Saved items land in{" "}
        <Link to="/needs-details" className="text-accent">
          Needs details
        </Link>{" "}
        so you can fill them in later.
      </p>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4">
      <span className="text-muted">{icon}</span>
      <span className="text-sm text-muted">{label}</span>
      <span className="flex flex-1 justify-end">{children}</span>
    </div>
  );
}

/** The file input behind a take-a-photo button. */
function PhotoInput({ onFile }: { onFile: (f: File | null) => void }) {
  return (
    <input
      type="file"
      accept="image/*"
      capture="environment"
      className="sr-only"
      onChange={(e) => {
        onFile(e.target.files?.[0] ?? null);
        // So choosing the same picture again still counts as a new photo.
        e.target.value = "";
      }}
    />
  );
}

/** A photo held in memory, drawn. */
function BlobImg({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt={alt} className={className} /> : null;
}
