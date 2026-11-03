import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import {
  binSizeLabels,
  binSizes,
  locationTypeHints,
  locationTypeLabels,
  locationTypes,
  type BinSize,
  type LocationDetail,
  type LocationType,
} from "../../shared/api";
import { api } from "../api";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { BinChip, Breadcrumbs, Button, Field, inputClass } from "../components/ui";

const creatableTypes = locationTypes.filter((t) => t !== "project");

export function LocationFormPage() {
  const [params] = useSearchParams();
  const parentId = params.get("parent") ? Number(params.get("parent")) : null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { openCamera } = useScan();

  const { data: parent } = useQuery({
    queryKey: ["location", parentId],
    queryFn: () => api<LocationDetail>(`/locations/${parentId}`),
    enabled: parentId !== null,
  });

  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("rack");
  const [typeTouched, setTypeTouched] = useState(false);
  // Sensible default once the parent loads: bins go in gridded boxes, boxes go on racks.
  useEffect(() => {
    if (!parent || typeTouched) return;
    setType(parent.type === "gridded_box" ? "bin" : parent.type === "rack" || parent.type === "shelf" ? "gridded_box" : "bin");
  }, [parent, typeTouched]);
  const [binSize, setBinSize] = useState<BinSize>("1x1");
  const [code, setCode] = useState(params.get("code") ?? "");

  // On this screen a scan fills in the sticker instead of navigating away.
  useScanHandler((scanned) => {
    setCode(scanned);
    return true;
  });

  const create = useMutation({
    mutationFn: () =>
      api<LocationDetail>("/locations", {
        method: "POST",
        body: { name, type, parentId, code: code.trim() || null, binSize: type === "bin" ? binSize : null },
      }),
    onSuccess: (loc) => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      qc.invalidateQueries({ queryKey: ["location"] });
      navigate(`/locations/${loc.id}`, { replace: true });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        {parent && <Breadcrumbs path={[...parent.path, { id: -1, name: "" }]} />}
        <h1 className="text-xl font-semibold">New location{parent ? ` in ${parent.name}` : ""}</h1>
      </div>

      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {creatableTypes.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => {
                setType(t);
                setTypeTouched(true);
              }}
              className={`min-h-11 rounded-xl border px-3 ${t === type ? "border-accent bg-accent/15 text-accent" : "border-border bg-surface-2"}`}
            >
              {locationTypeLabels[t]}
            </button>
          ))}
        </div>
        <span className="text-[13px] text-muted" aria-live="polite">{locationTypeHints[type]}</span>
      </Field>

      {type === "bin" && (
        <Field label="Bin size">
          <div className="flex flex-wrap gap-2">
            {binSizes.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setBinSize(s)}
                aria-label={binSizeLabels[s]}
                className={`flex min-h-11 items-center rounded-xl border px-3 ${s === binSize ? "border-accent bg-accent/15" : "border-border bg-surface-2"}`}
              >
                <BinChip size={s} />
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rack A, Screws box, Tote 4" required autoFocus />
      </Field>

      <Field label="Sticker (scan it now, or leave blank)">
        <div className="flex gap-2">
          <input className={`${inputClass} flex-1 font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type" />
          <Button type="button" onClick={openCamera} aria-label="Scan with camera">
            <ScanLine size={20} />
          </Button>
        </div>
      </Field>

      {create.error && <p className="text-danger">{(create.error as Error).message}</p>}

      <Button variant="primary" type="submit" disabled={!name.trim() || create.isPending} className="mt-2">
        Save location
      </Button>
    </form>
  );
}
