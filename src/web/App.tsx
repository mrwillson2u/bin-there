import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Archive, Boxes, History, ScanLine, Search, Warehouse } from "lucide-react";
import type { ScanResult } from "../shared/api";
import { api } from "./api";
import { ScanProvider, useScan } from "./scan/ScanProvider";
import { InventoryPage } from "./pages/InventoryPage";
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
            {/* The running-low list is a filter on Inventory now (DEC-026). */}
            <Route path="/low" element={<Navigate to="/?low=1" replace />} />
          </Routes>
        </Shell>
      </ToastProvider>
    </ScanProvider>
  );
}

function Shell({ children, scanError }: { children: React.ReactNode; scanError: string | null }) {
  const { openCamera, lastScan } = useScan();
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
        <div className="mx-auto flex max-w-2xl items-center justify-around">
          {/* Inventory has its own search bar at the top, so the phone bar has room for Locations. */}
          <NavItem to="/" icon={<Boxes size={22} />} label="Inventory" />
          <NavItem to="/locations" end={false} icon={<Warehouse size={22} />} label="Locations" />
          <button onClick={openCamera} className="-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg" aria-label="Scan with camera">
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
        <span className="flex-1" />
        <button onClick={openCamera} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-fg">
          <ScanLine size={20} /> Scan with camera
        </button>
        <p className="px-1 pt-2 text-center text-xs text-muted">Or just scan with the scanner: it works on any screen.</p>
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
