import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, Home, ScanLine } from "lucide-react";
import type { LocationSummary, ScanResult } from "../shared/api";
import { api } from "./api";
import { ScanProvider, useScan } from "./scan/ScanProvider";
import { HomePage } from "./pages/HomePage";
import { LocationPage } from "./pages/LocationPage";
import { LocationFormPage } from "./pages/LocationFormPage";
import { UnassignedPage } from "./pages/UnassignedPage";

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
          else setScanError(`Sticker ${code} is an item. Items arrive in milestone 2.`);
        })
        .catch((e: Error) => setScanError(e.message));
    },
    [navigate],
  );

  return (
    <ScanProvider fallback={openScanned}>
      <Shell scanError={scanError}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/locations/new" element={<LocationFormPage />} />
          <Route path="/locations/:id" element={<LocationPage />} />
          <Route path="/scan/:code" element={<UnassignedPage />} />
        </Routes>
      </Shell>
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

  const { data: top } = useQuery({
    queryKey: ["locations", null],
    queryFn: () => api<LocationSummary[]>("/locations"),
  });
  const putBack = top?.find((l) => l.type === "put_back");

  return (
    <div ref={shellRef} className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
        {scanError && <p className="mb-4 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger" role="alert">{scanError}</p>}
        <div key={location.pathname}>{children}</div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-around">
          <NavItem to="/" icon={<Home size={22} />} label="Garage" />
          <button onClick={openCamera} className="-mt-6 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg" aria-label="Scan with camera">
            <ScanLine size={28} />
          </button>
          <NavItem to={putBack ? `/locations/${putBack.id}` : "/"} icon={<Archive size={22} />} label="Put-back" />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `flex min-h-14 min-w-20 flex-col items-center justify-center gap-0.5 text-xs ${isActive ? "text-accent" : "text-muted"}`}>
      {icon}
      {label}
    </NavLink>
  );
}
