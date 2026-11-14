import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Archive, Boxes, History, Menu, QrCode, ScanLine, Search, Settings, Tags, Warehouse } from "lucide-react";
import type { ScanResult } from "../shared/api";
import { api } from "./api";
import { ScanProvider, useScan } from "./scan/ScanProvider";
import { useLiveUpdates } from "./live";
import { cameraAllowed, useScanMethod } from "./settings";
import { IN_PHONE_BAR, MENU, moveMenuItem, setMenuOrder, useMenuOrder, type MenuId } from "./menu";
import { InventoryPage } from "./pages/InventoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PrintStickersPage } from "./pages/PrintStickersPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { LocationsPage } from "./pages/LocationsPage";
import { LocationPage } from "./pages/LocationPage";
import { LocationFormPage } from "./pages/LocationFormPage";
import { UnassignedPage } from "./pages/UnassignedPage";
import { ItemPage } from "./pages/ItemPage";
import { ItemEditPage } from "./pages/ItemEditPage";
import { CapturePage } from "./pages/CapturePage";
import { SearchPage } from "./pages/SearchPage";
import { ActivityPage } from "./pages/ActivityPage";
import { PutBackPage } from "./pages/PutBackPage";
import { CheckedOutPage } from "./pages/CheckedOutPage";
import { ReviewPage } from "./pages/ReviewPage";
import { NeedsDetailsPage } from "./pages/NeedsDetailsPage";
import { ToastProvider } from "./components/Toast";
import { ScreenErrorBoundary } from "./components/ScreenErrorBoundary";

export function App() {
  const navigate = useNavigate();
  const [scanError, setScanError] = useState<string | null>(null);
  useLiveUpdates();

  // Default scan behavior (J7): open whatever was scanned.
  const openScanned = useCallback(
    (code: string) => {
      setScanError(null);
      api<ScanResult>(`/scan/${encodeURIComponent(code)}`)
        .then((r) => {
          if (r.kind === "location") navigate(`/locations/${r.location.id}`);
          else if (r.kind === "unassigned") navigate(`/scan/${encodeURIComponent(r.code)}`);
          else navigate(`/items/${r.itemId}`);
        })
        .catch((e: Error) => setScanError(e.message));
    },
    [navigate],
  );

  return (
    <ScanProvider fallback={openScanned}>
      <ToastProvider>
        <Shell scanError={scanError}>
          <Routes>
            <Route path="/" element={<InventoryPage />} />
            <Route path="/locations" element={<LocationsPage />} />
            <Route path="/locations/new" element={<LocationFormPage />} />
            <Route path="/locations/:id" element={<LocationPage />} />
            <Route path="/scan/:code" element={<UnassignedPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/capture" element={<CapturePage />} />
            <Route path="/items/:id" element={<ItemPage />} />
            <Route path="/items/:id/edit" element={<ItemEditPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/putback" element={<PutBackPage />} />
            <Route path="/out" element={<CheckedOutPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/needs-details" element={<NeedsDetailsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/stickers/print" element={<PrintStickersPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            {/* The running-low list is a filter on Inventory now (DEC-026). */}
            <Route path="/low" element={<Navigate to="/?low=1" replace />} />
          </Routes>
        </Shell>
      </ToastProvider>
    </ScanProvider>
  );
}

function Shell({ children, scanError }: { children: React.ReactNode; scanError: string | null }) {
  const { openCamera, lastScan, target } = useScan();
  // The bar is the one place that always says what a scan does right now (DEC-044): a screen's
  // target in the scan colour, or plain "scan to open". On a scanner-only device the camera button
  // becomes a status, since there's nothing to open.
  const method = useScanMethod();
  const camera = cameraAllowed(method);
  const location = useLocation();
  // Visual confirmation of each scan. Restart the CSS animation without remounting the page,
  // so forms keep their state when a scan fills them in.
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = shellRef.current;
    if (!lastScan || !el) return;
    el.classList.remove("scan-flash");
    void el.offsetWidth;
    el.classList.add("scan-flash");
  }, [lastScan]);

  return (
    <div ref={shellRef} className="flex min-h-dvh flex-col lg:pl-56">
      {/* Top: clear of the status bar and the Dynamic Island's blur, not just the inset edge. Bottom: room for the bar, and for the scan strip when one is up (DEC-044). */}
      <main className={`mx-auto w-full max-w-2xl flex-1 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:max-w-6xl lg:px-8 lg:pb-10 lg:pt-6 ${target ? "pb-40" : "pb-28"}`}>
        {/* Phone: the menu for what the bar doesn't hold (DEC-070, Q119), in a row of its own so it
            never sits on a screen's own buttons (the part page's Pin and Edit). */}
        <div className="mb-2 flex min-h-10 items-center justify-between lg:hidden">
          <span className="text-sm font-semibold text-muted">Bin→There</span>
          <PhoneMenu />
        </div>
        {scanError && <p className="mb-4 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger" role="alert">{scanError}</p>}
        {/* Above the per-screen remount, so it also catches a screen that fails while closing. */}
        <ScreenErrorBoundary resetKey={location.pathname}>
          <div key={location.pathname}>{children}</div>
        </ScreenErrorBoundary>
      </main>

      {/* Phone: bottom bar with the big scan button in thumb reach. */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {target && (
          /* The round button rises 24 px into whatever is above it, so the strip keeps its words above that. */
          <p className="flex items-center justify-center gap-1.5 bg-scan px-3 pb-7 pt-1.5 text-center text-[13px] font-semibold text-white" role="status" aria-label={`A scan now: ${target}`}>
            <ScanLine size={14} /> {target}
          </p>
        )}
        <div className="mx-auto flex max-w-2xl items-center justify-around">
          {/* Inventory has its own search bar at the top, so the phone bar has room for Locations. */}
          <NavItem to="/" icon={<Boxes size={22} />} label="Inventory" />
          <NavItem to="/locations" end={false} icon={<Warehouse size={22} />} label="Locations" />
          {/* Outlined: a scan opens what you scanned. Filled: a scan does what the strip says (DEC-044). */}
          <button
            onClick={openCamera}
            disabled={!camera}
            className={`-mt-6 flex h-16 w-16 items-center justify-center rounded-full shadow-lg ${target ? "bg-scan text-white" : "border-[3px] border-scan bg-surface text-scan"}`}
            aria-label={camera ? (target ? `Scan with camera: ${target}` : "Scan with camera: open what you scan") : target ? `Scanner: ${target}` : "Scanner ready: scan a sticker to open it"}
            title={camera ? undefined : "This device scans with the hardware scanner (Settings)"}
          >
            <ScanLine size={28} />
          </button>
          <NavItem to="/activity" icon={<History size={22} />} label="Activity" />
          <NavItem to="/putback" icon={<Archive size={22} />} label="Put-back" />
        </div>
      </nav>

      {/* Desktop / Pi screen: sidebar. The hardware scanner works on any screen. */}
      <nav className="fixed inset-y-0 left-0 hidden w-56 flex-col gap-1 border-r border-border bg-surface px-3 py-5 lg:flex">
        <div className="mb-4 px-3 text-lg font-semibold">Bin→There</div>
        <SideMenu />
        <span className="flex-1" />
        {/* The same block in both states (DEC-044): filled magenta while a scan does what a screen says,
            outlined when a scan just opens what you scanned. The camera button only where the camera is allowed. */}
        <div
          className={`flex flex-col gap-2 rounded-xl border p-3 ${target ? "border-scan bg-scan/15" : "border-scan/50"}`}
          role="status"
          aria-label={target ? `A scan now: ${target}` : "A scan now: opens what you scan"}
        >
          <p className={`flex items-center gap-2 text-sm font-semibold ${target ? "text-scan" : "text-text"}`}>
            <ScanLine size={18} className="shrink-0 text-scan" /> {target ?? "Scan any sticker to open it"}
          </p>
          {camera && (
            <button onClick={openCamera} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-scan text-sm font-semibold text-white">
              Scan with camera
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

/**
 * The phone's menu (DEC-070, Q119): Search, Categories, Print stickers and Settings, the sidebar's
 * entries the bottom bar doesn't hold, in the menu's order (DEC-078). It closes on a pick, a tap outside, Escape or a new screen.
 */
function PhoneMenu() {
  const { order } = useMenuOrder();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium ${open ? "border-accent text-accent" : "border-border text-text"}`}
      >
        <Menu size={18} /> Menu
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <nav aria-label="Menu" className="absolute right-0 top-full z-40 mt-2 flex w-56 flex-col gap-0.5 rounded-2xl border border-border bg-surface p-1.5 shadow-xl">
            {order
              .filter((id) => !IN_PHONE_BAR.includes(id))
              .map((id) => MENU.find((m) => m.id === id)!)
              .map((m) => (
                <SideItem key={m.id} to={m.to} end={m.end} icon={menuIcons[m.id]} label={m.label} />
              ))}
          </nav>
        </>
      )}
    </div>
  );
}

const menuIcons: Record<MenuId, React.ReactNode> = {
  inventory: <Boxes size={20} />,
  locations: <Warehouse size={20} />,
  search: <Search size={20} />,
  putback: <Archive size={20} />,
  activity: <History size={20} />,
  categories: <Tags size={20} />,
  stickers: <QrCode size={20} />,
  settings: <Settings size={20} />,
};

/**
 * The sidebar's entries (issue #3, DEC-078), in this device's order. Drag one to move it: a line
 * shows where it will land. Alt with the up or down arrow moves the focused one, for keyboards.
 * Settings has the way back to the usual order.
 */
function SideMenu() {
  const { order } = useMenuOrder();
  const [dragging, setDragging] = useState<MenuId | null>(null);
  // Where the dragged entry would land: before this one, or "end".
  const [over, setOver] = useState<MenuId | "end" | null>(null);
  const drop = () => {
    if (dragging && over) setMenuOrder(moveMenuItem(order, dragging, over === "end" ? null : over));
    setDragging(null);
    setOver(null);
  };
  return (
    <div
      className="flex flex-col gap-1"
      data-side-menu
      onDragOver={(e) => {
        if (dragging) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        drop();
      }}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
    >
      {order.map((id, i) => {
        const m = MENU.find((x) => x.id === id)!;
        return (
          <div
            key={id}
            draggable
            title="Drag to reorder"
            data-menu-item={id}
            className={`relative cursor-grab active:cursor-grabbing ${dragging === id ? "opacity-40" : ""}`}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", id);
              setDragging(id);
            }}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              // The top half lands before this entry, the bottom half before the next.
              const box = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > box.top + box.height / 2;
              setOver(after ? (order[i + 1] ?? "end") : id);
            }}
            onKeyDown={(e) => {
              if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
              e.preventDefault();
              const j = e.key === "ArrowUp" ? i - 1 : i + 1;
              if (j < 0 || j >= order.length) return;
              const next = [...order];
              [next[i], next[j]] = [next[j]!, next[i]!];
              setMenuOrder(next);
            }}
          >
            {dragging && over === id && dragging !== id && <span aria-hidden className="absolute inset-x-2 -top-[3px] h-0.5 rounded bg-accent" />}
            <SideItem to={m.to} end={m.end} icon={menuIcons[id]} label={m.label} />
            {dragging && over === "end" && i === order.length - 1 && dragging !== id && <span aria-hidden className="absolute inset-x-2 -bottom-[3px] h-0.5 rounded bg-accent" />}
          </div>
        );
      })}
    </div>
  );
}

function SideItem({ to, icon, label, end = true }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      draggable={false}
      className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 ${isActive ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-text"}`}
    >
      {icon}
      {label}
    </NavLink>
  );
}

function NavItem({ to, icon, label, end = true }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex min-h-14 min-w-16 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? "text-accent" : "text-muted"}`}>
      {icon}
      {label}
    </NavLink>
  );
}
