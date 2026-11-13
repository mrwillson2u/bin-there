import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, MapPin, QrCode, Sparkles, X } from "lucide-react";
import { trackingLabels, trackingModes, type AiFill, type Category, type CreateItem, type GlanceResult, type ItemDetail, type LocationDetail, type ScanResult, type StockLevel, type TrackingMode } from "../../shared/api";
import { api, glancePhoto, uploadPhoto } from "../api";
import { preparePhoto } from "../lib/photo";
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
 * The moment a photo is taken the model glances at it (DEC-061): what it read as a part number,
 * and its guess at a name and category, come back as chips to confirm with a tap; nothing is
 * taken without the tap. A confirmed part number is what the full look-up starts from.
 */
type Glance = { state: "idle" | "reading" | "done" | "failed"; result: GlanceResult | null; error?: string };

export function CapturePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [code, setCode] = useState<string | null>(params.get("code"));
  const [locationId, setLocationId] = useState<number | null>(params.get("location") ? Number(params.get("location")) : null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [supplierPn, setSupplierPn] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<{ photo: Blob; thumb: Blob } | null>(null);
  const [glance, setGlance] = useState<Glance>({ state: "idle", result: null });
  const [tracking, setTracking] = useState<TrackingMode>("exact");
  const [qty, setQty] = useState("1");
  const [level, setLevel] = useState<StockLevel>("plenty");
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
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => api<Category[]>("/categories"), enabled: !!ai?.enabled });

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // The photo is resized once, here, for both the glance and the save; a glance that comes back
  // after the photo was swapped or saved is dropped.
  const aiOn = !!ai?.enabled;
  useEffect(() => {
    setPrepared(null);
    setGlance({ state: "idle", result: null });
    if (!photo) return;
    let live = true;
    preparePhoto(photo)
      .then(async (p) => {
        if (!live) return;
        setPrepared(p);
        if (!aiOn) return;
        setGlance({ state: "reading", result: null });
        try {
          const result = await glancePhoto<GlanceResult>(p.photo);
          if (live) setGlance({ state: "done", result });
        } catch (e) {
          if (live) setGlance({ state: "failed", result: null, error: (e as Error).message });
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [photo, aiOn]);
  const read = glance.result;
  const readCategory = read?.category ? (categories ?? []).find((c) => c.name === read.category) : undefined;
  const toggle = (value: string, current: string, set: (v: string) => void) => set(current === value ? "" : value);

  useScanHandler((scanned) => {
    if (picking) return false; // PickLocation handles it
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

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // A part with its own sticker is a returnable unit; it isn't counted here.
      // What was taken from the glance, as it came, carries the AI mark (DEC-061); a value typed over doesn't.
      const fromPhoto: Record<string, AiFill> = {};
      const at = new Date().toISOString();
      if (supplierPn.trim() && read?.partNumbers.includes(supplierPn.trim())) fromPhoto.supplierPn = { source: "photo", at };
      if (name.trim() && read?.name === name.trim()) fromPhoto.name = { source: "photo", at };
      if (categoryId !== null && readCategory?.id === categoryId) fromPhoto.category = { source: "photo", at };
      const body: CreateItem = {
        name: name.trim() || undefined,
        code: code ?? undefined,
        locationId: locationId ?? undefined,
        tracking: code ? undefined : tracking,
        qty: !code && tracking === "exact" && qty ? Number(qty) : undefined,
        level: !code && tracking === "level" ? level : undefined,
        supplierPn: supplierPn.trim() || undefined,
        categoryId: categoryId ?? undefined,
        aiFields: Object.keys(fromPhoto).length > 0 ? fromPhoto : undefined,
      };
      let item = await api<ItemDetail>("/items", { method: "POST", body });
      if (photo) {
        const { photo: p, thumb } = prepared ?? (await preparePhoto(photo));
        item = await uploadPhoto<ItemDetail>(item.id, p, thumb);
      }
      // Queued for the AI (DEC-055): looked up in the background, the answer kept for review.
      if (aiAfter && ai?.enabled && (photo || name.trim())) {
        api(`/items/${item.id}/research/queue`, { method: "POST" }).catch((e: Error) => setError(`Saved, but couldn't queue it for the AI: ${e.message}`));
      }
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["location"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setSaved((s) => [item, ...s]);
      // Ready for the next one; keep the location (cataloging a bin at a time).
      setCode(null);
      setPhoto(null);
      setName("");
      setSupplierPn("");
      setCategoryId(null);
      setQty("1");
      setLevel("plenty");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-2xl">
      <h1 className="text-xl font-semibold">Quick capture</h1>

      {saved[0] && (
        <p className="rounded-xl bg-ok/15 px-4 py-3 text-sm text-ok" role="status">
          Saved{" "}
          <Link to={`/items/${saved[0].id}`} className="underline">
            {saved[0].name || "item"}
          </Link>
          {saved.length > 1 && ` (${saved.length} this session)`}. Scan or snap the next one.
        </p>
      )}

      <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface text-muted active:bg-surface-2">
        {preview ? (
          <img src={preview} alt="Item photo" className="h-full w-full object-cover" />
        ) : (
          <>
            <Camera size={40} className="text-accent" />
            <span className="font-semibold text-text">Take photo</span>
          </>
        )}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </label>

      {photo && aiOn && glance.state !== "idle" && (
        <section aria-label="Read off the photo" className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm">
          {glance.state === "reading" && (
            <p className="flex items-center gap-2 text-muted" role="status">
              <Sparkles size={16} className="animate-pulse text-accent" /> Reading the label…
            </p>
          )}
          {glance.state === "failed" && <p className="text-muted">Couldn't read the photo{glance.error ? `: ${glance.error}` : ""}.</p>}
          {glance.state === "done" && read && (
            read.partNumbers.length === 0 && !read.name && !readCategory ? (
              <p className="text-muted">Nothing printed to read. Name it, or leave it for later.</p>
            ) : (
              <>
                <p className="flex items-center gap-2 text-muted">
                  <Sparkles size={16} className="text-accent" /> Read off the photo. Tap to use.
                </p>
                {read.partNumbers.length > 0 && (
                  <Chips label="Part no.">
                    {read.partNumbers.slice(0, 3).map((n) => (
                      <Chip key={n} on={supplierPn.trim() === n} label={`Use part number ${n}`} onClick={() => toggle(n, supplierPn.trim(), setSupplierPn)}>
                        {n}
                      </Chip>
                    ))}
                  </Chips>
                )}
                {read.name && (
                  <Chips label="Name">
                    <Chip on={name.trim() === read.name} label={`Use name ${read.name}`} onClick={() => toggle(read.name!, name.trim(), setName)}>
                      {read.name}
                    </Chip>
                  </Chips>
                )}
                {readCategory && (
                  <Chips label="Category">
                    <Chip on={categoryId === readCategory.id} label={`Use category ${readCategory.name}`} onClick={() => setCategoryId(categoryId === readCategory.id ? null : readCategory.id)}>
                      {readCategory.name}
                    </Chip>
                  </Chips>
                )}
              </>
            )
          )}
        </section>
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
      {(supplierPn || (read?.partNumbers.length ?? 0) > 0) && (
        <Field label="Part number">
          <input value={supplierPn} onChange={(e) => setSupplierPn(e.target.value)} className={`${inputClass} font-mono`} placeholder="As printed on it" />
        </Field>
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
              <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className={`${inputClass} text-center font-mono`} placeholder="—" aria-label="How many?" />
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

      {!picking && <ScanTarget compact what={code ? "Scan the bin it's going in" : "Scan the bin it's going in, or its own new sticker"} />}

      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving || (!photo && !name.trim() && !code)} className="min-h-14 flex-1 text-lg">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => navigate(locationId !== null ? `/locations/${locationId}` : "/")} className="min-h-14">
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

function Chips({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-[12px] text-muted">{label}</span>
      {children}
    </div>
  );
}

/** One thing read off the photo; pressed once it's in the form. */
function Chip({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={`flex min-h-10 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm ${on ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2 text-text"}`}
    >
      {on && <Check size={14} className="shrink-0" />}
      <span className="truncate">{children}</span>
    </button>
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
