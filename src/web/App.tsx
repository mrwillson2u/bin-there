import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Archive, Boxes, History, ScanLine, Search, Settings, Warehouse } from "lucide-react";
import type { ScanResult } from "../shared/api";
import { api } from "./api";
import { ScanProvider, useScan } from "./scan/ScanProvider";
import { cameraAllowed, scannerExpected, useScanMethod } from "./settings";
import { InventoryPage } from "./pages/InventoryPage";
import { SettingsPage } from "./pages/SettingsPage";
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
  const scanner = scannerExpected(method);
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
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] lg:max-w-6xl lg:px-8 lg:pb-10 lg:pt-6">
        {scanError && <p className="mb-4 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger" role="alert">{scanError}</p>}
        {/* Above the per-screen remount, so it also catches a screen that fails while closing. */}
        <ScreenErrorBoundary resetKey={location.pathname}>
          <div key={location.pathname}>{children}</div>
        </ScreenErrorBoundary>
      </main>

      {/* Phone: bottom bar with the big scan button in thumb reach. */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {target && (
          <p className="flex items-center justify-center gap-1.5 bg-scan px-3 py-1 text-center text-[13px] font-semibold text-white" role="status" aria-label={`A scan now: ${target}`}>
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
        <div className="mb-4 px-3 text-lg font-semibold">Bin There</div>
        <SideItem to="/" icon={<Boxes size={20} />} label="Inventory" />
        <SideItem to="/locations" end={false} icon={<Warehouse size={20} />} label="Locations" />
        <SideItem to="/search" icon={<Search size={20} />} label="Search" />
        <SideItem to="/putback" icon={<Archive size={20} />} label="Put-back" />
        <SideItem to="/activity" icon={<History size={20} />} label="Activity" />
        <SideItem to="/settings" icon={<Settings size={20} />} label="Settings" />
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
          {scanner && <p className="text-xs text-muted">{camera ? "…or pull the scanner's trigger." : "Pull the scanner's trigger."}</p>}
        </div>
      </nav>
    </div>
  );
}

function SideItem({ to, icon, label, end = true }: { to: string; icon: React.ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
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
