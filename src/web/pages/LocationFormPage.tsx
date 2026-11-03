import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, ScanLine } from "lucide-react";
import {
  binSizeLabels,
  binSizes,
  locationTypeHints,
  locationTypeLabels,
  locationTypes,
  type BinSize,
  type LocationDetail,
  type LocationSummary,
  type LocationType,
} from "../../shared/api";
import { api } from "../api";
import { useScan, useScanHandler } from "../scan/ScanProvider";
import { PickLocation } from "../components/PickLocation";
import { BinChip, Breadcrumbs, Button, Field, inputClass, pathText } from "../components/ui";

const creatableTypes = locationTypes.filter((t) => t !== "project");
const insideTypes = creatableTypes.filter((t) => t !== "site");

export function LocationFormPage() {
  const [params] = useSearchParams();
  const fixedParent = params.get("parent") ? Number(params.get("parent")) : null;
  const navigate = useNavigate();
  const { data: sites } = useQuery({ queryKey: ["locations", null], queryFn: () => api<LocationSummary[]>("/locations") });
  const [chosenParent, setChosenParent] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  // With one site, new things go in it unless you choose otherwise.
  const parentId = fixedParent ?? chosenParent ?? (sites?.length === 1 ? sites[0]!.id : null);
  const qc = useQueryClient();
  const { openCamera } = useScan();

  const { data: parent } = useQuery({
    queryKey: ["location", parentId],
    queryFn: () => api<LocationDetail>(`/locations/${parentId}`),
    enabled: parentId !== null,
  });

  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>(params.get("type") === "site" ? "site" : "rack");
  const [typeTouched, setTypeTouched] = useState(params.get("type") === "site");
  // Sensible default once the parent loads: racks go in sites, boxes on racks, bins in gridded boxes.
  useEffect(() => {
    if (!parent || typeTouched) return;
    setType(
      parent.type === "site" ? "rack"
      : parent.type === "gridded_box" ? "bin"
      : parent.type === "rack" || parent.type === "shelf" ? "gridded_box"
      : "bin",
    );
  }, [parent, typeTouched]);
  const isSite = type === "site";
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
        body: { name, type, parentId: isSite ? null : parentId, code: code.trim() || null, binSize: type === "bin" ? binSize : null },
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
    <form onSubmit={submit} className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-2xl">
      <div className="flex flex-col gap-1">
        {parent && !isSite && <Breadcrumbs path={[...parent.path, { id: -1, name: "" }]} />}
        <h1 className="text-xl font-semibold">{isSite ? "New site" : `New location${parent ? ` in ${parent.name}` : ""}`}</h1>
      </div>

      {!isSite && fixedParent === null && (
        <Field label="Inside">
          <button type="button" onClick={() => setPicking(true)} className={`${inputClass} flex items-center gap-2 text-left`}>
            <MapPin size={18} className="text-muted" />
            <span className={`flex-1 ${parent ? "" : "text-muted"}`}>{parent ? pathText(parent.path) : "Choose where it goes"}</span>
            <span className="text-sm text-accent">Change</span>
          </button>
        </Field>
      )}
      {picking && (
        <PickLocation
          title="Scan or pick what it goes inside"
          onPick={(l) => {
            setChosenParent(l.id);
            setPicking(false);
          }}
          onCancel={() => setPicking(false)}
        />
      )}

      <Field label="Type">
        <div className="flex flex-wrap gap-2">
          {(fixedParent === null ? creatableTypes : insideTypes).map((t) => (
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
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder={isSite ? "e.g. Garage, Basement, Office" : "e.g. Rack A, Screws box, Tote 4"} required autoFocus />
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

      <Button variant="primary" type="submit" disabled={!name.trim() || (!isSite && parentId === null) || create.isPending} className="mt-2">
        {isSite ? "Save site" : "Save location"}
      </Button>
    </form>
  );
}
