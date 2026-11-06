import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, FolderKanban, Pin, Plus, Search, Settings, Warehouse, X } from "lucide-react";
import { crumbLabel, locationTypes, type LocationDetail, type LocationSummary, type LocationType, type PinnedLocation, type Pins, type ProjectSummary } from "../../shared/api";
import { api } from "../api";
import { contents, LocationList, LocationIcon } from "../components/LocationList";
import { LocationItemList } from "../components/ItemList";
import { BinChip, Button, inputClass, PlacePath, PositionTag } from "../components/ui";

const typePlurals: Record<LocationType, string> = {
  site: "Sites",
  rack: "Racks",
  gridded_box: "Gridded boxes",
  tote: "Totes",
  tub: "Tubs",
  bin: "Bins",
  shelf: "Shelves",
  project: "Project kits",
  other: "Other",
};

/**
 * Locations (DEC-026): with one site, that site's contents; with several, the list of sites.
 * Pinned places and project kits sit on top. Parts live on the Inventory screen.
 */
export function LocationsPage() {
  const { data: sites, isLoading } = useQuery({
    queryKey: ["locations", null],
    queryFn: () => api<LocationSummary[]>("/locations"),
  });
  const single = sites?.length === 1 ? sites[0]! : null;
  const { data: site } = useQuery({
    queryKey: ["location", single?.id],
    queryFn: () => api<LocationDetail>(`/locations/${single!.id}`),
    enabled: single !== null,
  });
  const { data: pins } = useQuery({ queryKey: ["pins"], queryFn: () => api<Pins>("/pins") });
  const [params, setParams] = useSearchParams();
  const all = params.get("view") === "all";
  const showAll = (on: boolean) => {
    const p = new URLSearchParams(window.location.search);
    if (on) p.set("view", "all");
    else for (const k of ["view", "type", "q"]) p.delete(k);
    setParams(p, { replace: true });
  };
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => api<ProjectSummary[]>("/projects") });

  const pinnedPlaces = pins?.locations ?? [];
  const side = pinnedPlaces.length > 0 || (projects?.length ?? 0) > 0;
  if (isLoading || !sites) return <p className="text-muted">Loading…</p>;
  if (sites.length === 0) return <FirstSite />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{single ? single.name : "Locations"}</h1>
        <Link
          to={single ? `/locations/new?parent=${single.id}` : "/locations/new"}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4"
        >
          <Plus size={18} /> Add location
        </Link>
      </div>

      <div className="flex self-start overflow-hidden rounded-xl border border-border" role="group" aria-label="Show">
        {([["By place", false], ["All places", true]] as const).map(([label, on]) => (
          <button key={label} onClick={() => showAll(on)} aria-pressed={all === on} className={`min-h-10 px-4 text-sm ${all === on ? "bg-accent/15 font-semibold text-accent" : "text-muted"}`}>
            {label}
          </button>
        ))}
      </div>

      {all ? (
        <AllPlaces />
      ) : (
      <div className={`flex flex-col gap-4 ${side ? "lg:grid lg:grid-cols-2 lg:items-start lg:gap-6" : ""}`}>
        {side && (
          <div className="flex flex-col gap-4">
            {pinnedPlaces.length > 0 && <PinnedPlaces places={pinnedPlaces} />}
            {projects && projects.length > 0 && <Projects projects={projects} newIn={single?.id ?? null} />}
          </div>
        )}

        {single ? (
          site && (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                {side && <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">In {site.name}</h2>}
                <LocationList locations={site.children.filter((c) => c.type !== "project")} empty="Nothing here yet. Add a rack, box or tote to start." />
              </section>
              {site.items.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Loose in {site.name}</h2>
                  <LocationItemList items={site.items} />
                </section>
              )}
            </div>
          )
        ) : (
          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Sites</h2>
            <LocationList locations={sites} empty="" />
          </section>
        )}
      </div>
      )}

      <div className="flex flex-wrap justify-center gap-x-6">
        {(!projects || projects.length === 0) && (
          <Link to={`/locations/new?type=project${single ? `&parent=${single.id}` : ""}`} className="flex min-h-11 items-center gap-2 text-sm text-muted">
            <FolderKanban size={16} /> Start a project kit
          </Link>
        )}
        <Link to="/locations/new?type=site" className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted">
          <Warehouse size={16} /> Add a site{single ? " (another place you keep things)" : ""}
        </Link>
      </div>

      <Link to="/settings" className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted">
        <Settings size={16} /> Settings: appearance, scanning, beep
      </Link>
    </div>
  );
}

/**
 * Every place in one list, whatever it's inside (DEC-027): the bins of every box, every tote.
 * Filter by type and find by name, by the places it's in, or by what's in it.
 */
function AllPlaces() {
  const [params, setParams] = useSearchParams();
  const type = params.get("type") as LocationType | null;
  const [text, setText] = useState(params.get("q") ?? "");
  const { data } = useQuery({ queryKey: ["locations", "all"], queryFn: () => api<PinnedLocation[]>("/locations?all=1") });
  // The chip that's on moves to the front; bring the row back to the start so it's in sight.
  const chips = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers' scrollTo returns a Promise, and an effect must return
  // nothing or a clean-up function (returning the Promise crashed the screen on the way out).
  useEffect(() => {
    chips.current?.scrollTo({ left: 0 });
  }, [type]);
  const edit = (key: string, value: string | null) => {
    const p = new URLSearchParams(window.location.search);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  };
  if (!data) return <p className="text-muted">Loading…</p>;

  const counts = new Map<LocationType, number>();
  for (const l of data) counts.set(l.type, (counts.get(l.type) ?? 0) + 1);
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = data.filter((l) => {
    if (type && l.type !== type) return false;
    if (words.length === 0) return true;
    const hay = [...l.path.map(crumbLabel), ...l.preview].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="text"
          enterKeyHint="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            edit("q", e.target.value.trim() ? e.target.value : null);
          }}
          placeholder="Find a place, or what's in it"
          aria-label="Find a place"
          autoCapitalize="none"
          autoCorrect="off"
          className={`${inputClass} w-full pl-10 pr-10`}
        />
        {text && (
          <button
            onClick={() => {
              setText("");
              edit("q", null);
            }}
            aria-label="Clear"
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted"
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div ref={chips} className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&>*]:shrink-0" role="group" aria-label="Type">
        {locationTypes
          .filter((t) => counts.has(t))
          .sort((a, b) => Number(b === type) - Number(a === type))
          .map((t) => (
            <button
              key={t}
              onClick={() => edit("type", type === t ? null : t)}
              aria-pressed={type === t}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${type === t ? "border-accent bg-accent/15 text-accent" : "border-border text-text"}`}
            >
              {typePlurals[t]} <span className="font-semibold tabular-nums text-muted">{counts.get(t)}</span>
            </button>
          ))}
      </div>
      <p className="text-[13px] text-muted" aria-live="polite">
        {type || words.length ? `${shown.length} found` : `${shown.length} place${shown.length === 1 ? "" : "s"}`}
      </p>
      {shown.length === 0 ? (
        <p className="px-1 py-6 text-center text-muted">{data.length === 0 ? "No places yet. Add a rack, box or tote to start." : "Nothing matches."}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {shown.map((l) => (
            <li key={l.id}>
              <Link to={`/locations/${l.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
                {l.type === "bin" && l.binSize ? <BinChip size={l.binSize} /> : <LocationIcon type={l.type} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {l.position && <PositionTag position={l.position} big />}
                    <span className="truncate">{l.name}</span>
                  </span>
                  <span className={`block truncate text-[13px] ${contents(l) === "Empty" ? "text-muted italic" : "text-muted"}`}>{contents(l)}</span>
                  {l.path.length > 1 && <PlacePath path={l.path.slice(0, -1)} className="text-[13px] text-muted" />}
                </span>
                <ChevronRight size={18} className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Active project kits (J4): parts pulled together for a while, each remembering its home. */
function Projects({ projects, newIn }: { projects: ProjectSummary[]; newIn: number | null }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted">
          <FolderKanban size={14} /> Projects
        </h2>
        <Link to={`/locations/new?type=project${newIn ? `&parent=${newIn}` : ""}`} className="inline-flex min-h-11 items-center gap-1 px-1 text-sm text-accent">
          <Plus size={16} /> New kit
        </Link>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {projects.map((p) => (
          <li key={p.id}>
            <Link to={`/locations/${p.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
              <FolderKanban size={20} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.name}</span>
                <span className="block truncate text-[13px] text-muted">{[p.bins > 0 && `${p.bins} bin${p.bins === 1 ? "" : "s"}`, p.items > 0 && `${p.items} part${p.items === 1 ? "" : "s"}`].filter(Boolean).join(" · ") || "Empty"}</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** First run: name the place you keep things. */
export function FirstSite() {
  const qc = useQueryClient();
  const [name, setName] = useState("Garage");
  const create = useMutation({
    mutationFn: () => api<LocationDetail>("/locations", { method: "POST", body: { name: name.trim(), type: "site" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
  return (
    <form
      className="flex flex-col gap-4 pt-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate();
      }}
    >
      <Warehouse size={40} className="text-accent" />
      <h1 className="text-xl font-semibold">Where do you keep things?</h1>
      <p className="text-muted">Name your first site. You can add more later, like a basement or a storage unit.</p>
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} aria-label="Site name" />
      {create.error && <p className="text-danger">{(create.error as Error).message}</p>}
      <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>Create site</Button>
    </form>
  );
}

/** Places you're working in right now, one tap away (F11). Pinned parts sit on top of Inventory. */
function PinnedPlaces({ places }: { places: PinnedLocation[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted">
        <Pin size={14} /> Pinned
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {places.map((l) => (
          <li key={l.id}>
            <Link to={`/locations/${l.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
              {l.binSize && <BinChip size={l.binSize} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{l.name}</span>
                {l.path.length > 1 && <PlacePath path={l.path.slice(0, -1)} className="text-[13px] text-muted" />}
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
