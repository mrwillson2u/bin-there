import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Camera, ChevronRight, ClipboardCheck, LogOut, Pin, Plus, Search, ShoppingCart, SunMoon, Warehouse } from "lucide-react";
import type { ItemSummary, LocationDetail, LocationSummary, Pins, Stats } from "../../shared/api";
import { getTheme, setTheme, themeLabels, themes, type Theme } from "../theme";
import { api } from "../api";
import { LocationList } from "../components/LocationList";
import { LocationItemList, QtyBadge } from "../components/ItemList";
import { StockControl } from "../components/StockControl";
import { BinChip, Button, inputClass, itemName, pathText, Thumb } from "../components/ui";

/** Home: with one site, that site's contents; with several, the list of sites. */
export function HomePage() {
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
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: () => api<Stats>("/stats") });
  const { data: pins } = useQuery({ queryKey: ["pins"], queryFn: () => api<Pins>("/pins") });

  const hasPins = !!pins && (pins.items.length > 0 || pins.locations.length > 0);
  if (isLoading || !sites) return <p className="text-muted">Loading…</p>;
  if (sites.length === 0) return <FirstSite />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{single ? single.name : "Home"}</h1>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-2">
        <Link to="/search" className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 text-muted lg:flex-1">
          <Search size={18} /> Search parts…
        </Link>

        <div className="grid grid-cols-2 gap-2">
          <Link to="/capture" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 lg:px-4">
            <Camera size={18} /> Add item
          </Link>
          <Link
            to={single ? `/locations/new?parent=${single.id}` : "/locations/new"}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 lg:px-4"
          >
            <Plus size={18} /> Add location
          </Link>
        </div>
      </div>

      {stats && stats.needsDetails > 0 && (
        <Link to="/search?needs=1" className="flex min-h-12 items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 text-warn">
          <span className="flex-1">
            {stats.needsDetails} item{stats.needsDetails === 1 ? "" : "s"} need{stats.needsDetails === 1 ? "s" : ""} details
          </span>
          <ChevronRight size={18} />
        </Link>
      )}

      {stats && stats.checkedOut > 0 && (
        <Link to="/out" className="flex min-h-12 items-center gap-2 rounded-xl border border-info/40 bg-info/10 px-4 text-info">
          <LogOut size={18} />
          <span className="flex-1">{stats.checkedOut} checked out</span>
          <ChevronRight size={18} />
        </Link>
      )}

      {stats && stats.low > 0 && (
        <Link to="/low" className="flex min-h-12 items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 text-danger">
          <ShoppingCart size={18} />
          <span className="flex-1">{stats.low} running low</span>
          <ChevronRight size={18} />
        </Link>
      )}

      {stats && stats.stale > 0 && (
        <Link to="/review" className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-muted">
          <ClipboardCheck size={18} />
          <span className="flex-1">{stats.stale} count{stats.stale === 1 ? "" : "s"} worth checking</span>
          <ChevronRight size={18} />
        </Link>
      )}

      <div className={`flex flex-col gap-4 ${hasPins ? "lg:grid lg:grid-cols-2 lg:items-start lg:gap-6" : ""}`}>
        {hasPins && <Pinned pins={pins!} />}

        {single ? (
          site && (
            <div className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Locations</h2>
                <LocationList locations={site.children} empty="Nothing here yet. Add a rack, box or tote to start." />
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

      <Link to="/locations/new?type=site" className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted">
        <Warehouse size={16} /> Add a site{single ? " (another place you keep things)" : ""}
      </Link>

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

/** First run: name the place you keep things. */
function FirstSite() {
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

/** What you're working with right now, one tap away (F11). */
function Pinned({ pins }: { pins: Pins }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-muted">
        <Pin size={14} /> Pinned
      </h2>
      {pins.locations.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {pins.locations.map((l) => (
            <li key={l.id}>
              <Link to={`/locations/${l.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-surface-2">
                {l.binSize && <BinChip size={l.binSize} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{l.name}</span>
                  {l.path.length > 1 && <span className="block truncate text-[13px] text-muted">{pathText(l.path.slice(0, -1))}</span>}
                </span>
                <ChevronRight size={18} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pins.items.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {pins.items.map((i) => (
            <PinnedItem key={i.id} item={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** A pinned part with − / + right on Home, for the place you take it from (its home, if it has one). */
function PinnedItem({ item }: { item: ItemSummary }) {
  const stocked = item.places.filter((p) => p.hasStock);
  const place = stocked.find((p) => p.isHome) ?? stocked[0];
  const others = item.places.length - (place ? 1 : 0);
  const placeName = place?.path.at(-1)?.name ?? "";
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Link to={`/items/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Thumb url={item.thumbUrl} size={44} />
          <span className="min-w-0">
            <span className={`block truncate ${item.name ? "" : "italic text-muted"}`}>{itemName(item.name)}</span>
            <span className="block truncate text-[13px] text-muted">
              {place ? placeName : "No location"}
              {others > 0 && ` · +${others} more place${others === 1 ? "" : "s"}`}
            </span>
          </span>
        </Link>
        {place && item.tracking === "exact" ? (
          <StockControl compact itemId={item.id} locationId={place.locationId} placeName={placeName} tracking="exact" qty={place.qty} level={null} />
        ) : (
          !place && item.totalQty !== null && <QtyBadge qty={null} level={null} units={item.totalQty} tracking="exact" />
        )}
      </div>
      {place && item.tracking === "level" && (
        <StockControl compact itemId={item.id} locationId={place.locationId} placeName={placeName} tracking="level" qty={null} level={place.level} />
      )}
    </li>
  );
}
