import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { House, LogOut } from "lucide-react";
import type { CheckedOutUnit } from "../../shared/api";
import { api } from "../api";
import { timeAgo } from "../components/EventList";
import { Card, pathText, PlacePath, Thumb } from "../components/ui";
import { UnitCheckIn } from "./ItemPage";

/** Everything stickered that's out right now (F10): where it went, since when, where it lives. */
export function CheckedOutPage() {
  const { data } = useQuery({ queryKey: ["items", "checked-out"], queryFn: () => api<CheckedOutUnit[]>("/units/checked-out") });
  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-3xl">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <LogOut size={22} className="text-info" /> Out right now
      </h1>
      {!data ? (
        <p className="text-muted">Loading…</p>
      ) : data.length === 0 ? (
        <Card className="p-6 text-center text-muted">Nothing is checked out. Everything stickered is home.</Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {data.map((u) => (
            <li key={u.unitId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Link to={`/items/${u.itemId}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Thumb url={u.thumbUrl} size={48} />
                <span className="min-w-0">
                  <span className="block truncate">{u.itemName || "Unnamed item"}</span>
                  <span className="block truncate text-[13px] text-info">
                    {u.path.length ? pathText(u.path) : "Out"}
                    {u.note && ` · ${u.note}`} · {timeAgo(u.at)}
                  </span>
                  {u.homePath.length > 0 ? (
                    <PlacePath path={u.homePath} className="items-center text-[13px] text-muted" before={<House size={13} className="mr-1" aria-label="Lives in" />} />
                  ) : null}
                </span>
              </Link>
              <UnitCheckIn unitId={u.unitId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
