import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, FolderKanban, Pin, Plus, SunMoon, Warehouse } from "lucide-react";
import type { LocationDetail, LocationSummary, PinnedLocation, Pins, ProjectSummary } from "../../shared/api";
import { getTheme, setTheme, themeLabels, themes, type Theme } from "../theme";
import { api } from "../api";
import { LocationList } from "../components/LocationList";
import { LocationItemList } from "../components/ItemList";
import { BinChip, Button, inputClass, PlacePath } from "../components/ui";

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

      <ThemePicker />
    </div>
  );
}

/** Dark, light, or whatever the device is set to. Remembered on this device. */
function ThemePicker() {
  const [theme, set] = useState<Theme>(getTheme);
  const pick = (t: Theme) => {
    setTheme(t);
    set(t);
  };
  return (
    <div className="flex items-center justify-center gap-2 text-sm text-muted" role="radiogroup" aria-label="Appearance">
      <SunMoon size={16} />
      {themes.map((t) => (
        <button
          key={t}
          role="radio"
          aria-checked={theme === t}
          onClick={() => pick(t)}
          className={`min-h-11 rounded-lg px-2 ${theme === t ? "font-semibold text-accent" : ""}`}
        >
          {themeLabels[t]}
        </button>
      ))}
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
                <span className="block truncate text-[13px] text-muted">{p.items === 0 ? "Empty" : `${p.items} part${p.items === 1 ? "" : "s"} in it`}</span>
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
