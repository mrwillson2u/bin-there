import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, MapPin, QrCode, X } from "lucide-react";
import type { CreateItem, ItemDetail, LocationDetail, ScanResult } from "../../shared/api";
import { api, uploadPhoto } from "../api";
import { preparePhoto } from "../lib/photo";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { PickLocation } from "../components/PickLocation";
import { Button, Card, Field, inputClass } from "../components/ui";

/**
 * Quick capture (F5): sticker → photo → save, details later.
 * While open, scans fill the form: a location sticker sets where it goes,
 * a fresh sticker becomes the item's own sticker.
 */
export function CapturePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { openCamera } = useScan();

  const [code, setCode] = useState<string | null>(params.get("code"));
  const [locationId, setLocationId] = useState<number | null>(params.get("location") ? Number(params.get("location")) : null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ItemDetail[]>([]);

  const { data: location } = useQuery({
    queryKey: ["location", locationId],
    queryFn: () => api<LocationDetail>(`/locations/${locationId}`),
    enabled: locationId !== null,
  });

  useEffect(() => {
    if (!photo) return setPreview(null);
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

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
      const body: CreateItem = {
        name: name.trim() || undefined,
        code: code ?? undefined,
        locationId: locationId ?? undefined,
        qty: qty ? Number(qty) : undefined,
      };
      let item = await api<ItemDetail>("/items", { method: "POST", body });
      if (photo) {
        const { photo: p, thumb } = await preparePhoto(photo);
        item = await uploadPhoto<ItemDetail>(item.id, p, thumb);
      }
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["location"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setSaved((s) => [item, ...s]);
      // Ready for the next one; keep the location (cataloging a bin at a time).
      setCode(null);
      setPhoto(null);
      setName("");
      setQty("");
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

      <Card className="flex flex-col divide-y divide-border">
        <Row icon={<QrCode size={18} />} label="Sticker">
          {code ? (
            <span className="flex items-center gap-1 font-mono text-sm">
              {code}
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
              {location.path.map((c) => c.name).join(" › ")}
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

      <div className={code ? "flex flex-col" : "grid grid-cols-[1fr_7rem] gap-3"}>
        <Field label="Name (optional)">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Later is fine" />
        </Field>
        {!code && (
          <Field label="How many?">
            <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} className={`${inputClass} text-center font-mono`} placeholder="—" />
          </Field>
        )}
      </div>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving || (!photo && !name.trim() && !code)} className="min-h-14 flex-1 text-lg">
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button onClick={openCamera} className="min-h-14">Scan</Button>
        <Button variant="ghost" onClick={() => navigate(locationId !== null ? `/locations/${locationId}` : "/")} className="min-h-14">
          {saved.length > 0 ? "Done" : "Cancel"}
        </Button>
      </div>
      <p className="text-center text-[13px] text-muted">Saved items land in “Needs details” so you can fill them in later.</p>
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
