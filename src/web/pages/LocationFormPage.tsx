import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, ScanLine } from "lucide-react";
import {
  rackLabel,
  holdsPositions,
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
import { DEFAULT_GRID } from "../../shared/grid";
import { api } from "../api";
import { useScanHandler } from "../scan/ScanProvider";
import { ScanTarget } from "../scan/ScanTarget";
import { PickLocation } from "../components/PickLocation";
import { BinChip, Breadcrumbs, Button, Field, inputClass, pathText, PositionTag } from "../components/ui";

const creatableTypes = locationTypes;
const insideTypes = creatableTypes.filter((t) => t !== "site");
const isType = (v: string | null): v is LocationType => locationTypes.includes(v as LocationType);

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

  const { data: parent } = useQuery({
    queryKey: ["location", parentId],
    queryFn: () => api<LocationDetail>(`/locations/${parentId}`),
    enabled: parentId !== null,
  });

  const [name, setName] = useState("");
  const askedType = params.get("type");
  const [type, setType] = useState<LocationType>(isType(askedType) ? askedType : "rack");
  const [typeTouched, setTypeTouched] = useState(isType(askedType));
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
  // Racks and shelves: how many numbered positions (DEC-034). From an empty position: which one it goes in.
  const [rackSize, setRackSize] = useState("");
  // Gridded boxes: cells across and down (DEC-047). Blank means the Allit case, 6 × 4.
  const [grid, setGrid] = useState({ cols: "", rows: "" });
  const gridValue = () => {
    const cols = Math.min(12, Math.max(1, Number(grid.cols) || DEFAULT_GRID.cols));
    const rows = Math.min(8, Math.max(1, Number(grid.rows) || DEFAULT_GRID.rows));
    return { cols, rows };
  };
  const slotParam = params.get("slot");
  const rackSlot = fixedParent !== null && slotParam !== null && /^\d+$/.test(slotParam) ? Number(slotParam) : null;
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
        body: {
          name: name.trim() || undefined,
          type,
          parentId: isSite ? null : parentId,
          code: code.trim() || null,
          binSize: type === "bin" ? binSize : null,
          ...(holdsPositions(type) && Number(rackSize) >= 1 ? { rackSize: Math.min(200, Number(rackSize)) } : {}),
          ...(rackSlot !== null ? { rackSlot } : {}),
          ...(type === "gridded_box" ? { grid: gridValue() } : {}),
        },
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
        <h1 className="text-xl font-semibold">
          {isSite ? "New site" : type === "project" ? "New project kit" : `New location${parent ? ` in ${parent.name}` : ""}`}
        </h1>
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

      {rackSlot !== null && parent?.rack && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <PositionTag position={rackLabel(parent.rack.labels, rackSlot)} big /> Goes in this position of {parent.name}
        </p>
      )}

      {holdsPositions(type) && (
        <Field label="Numbered positions (optional)">
          <input
            className={`${inputClass} w-28`}
            value={rackSize}
            onChange={(e) => setRackSize(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="e.g. 12"
          />
          <span className="text-[13px] text-muted">If it has numbered slots, how many. They're numbered 1, 2, 3… and you can rename them.</span>
        </Field>
      )}

      {type === "gridded_box" && (
        <Field label="Grid size">
          <div className="flex items-center gap-2">
            <input className={`${inputClass} w-20 text-center`} value={grid.cols} onChange={(e) => setGrid({ ...grid, cols: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder={String(DEFAULT_GRID.cols)} aria-label="Cells across" />
            <span className="text-muted">×</span>
            <input className={`${inputClass} w-20 text-center`} value={grid.rows} onChange={(e) => setGrid({ ...grid, rows: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder={String(DEFAULT_GRID.rows)} aria-label="Rows down" />
          </div>
          <span className="text-[13px] text-muted">Cells across × rows down, not counting the front strip. The Allit case is 6 × 4. You can change it later on the box's page.</span>
        </Field>
      )}

      <Field label={type === "bin" ? "Name (optional: bins are numbered, and show what's in them)" : "Name"}>
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={isSite ? "e.g. Garage, Basement, Office" : type === "project" ? "e.g. Weather station, Robot arm" : type === "bin" ? "Leave blank for the next ID, like Bin 0042" : "e.g. Rack A, Screws box, Tote 4"}
          required={type !== "bin"}
          autoFocus
        />
      </Field>

      <Field label="Sticker (scan it now, or leave blank)">
        <input className={`${inputClass} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Scan or type" />
      </Field>
      <ScanTarget compact what="Scan its sticker to fill that in" />

      {create.error && <p className="text-danger">{(create.error as Error).message}</p>}

      <div className="mt-2 flex gap-2">
        <Button variant="primary" type="submit" disabled={(!name.trim() && type !== "bin") || (!isSite && parentId === null) || create.isPending} className="flex-1">
          {isSite ? "Save site" : type === "project" ? "Create kit" : type === "bin" ? "Add bin" : "Save location"}
        </Button>
        <Button type="button" onClick={() => navigate(parentId !== null ? `/locations/${parentId}` : "/")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
