import { Link, useParams } from "react-router-dom";
import { MapPin, Plus, QrCode } from "lucide-react";
import { Card } from "../components/ui";

export function UnassignedPage() {
  const code = useParams().code ?? "";
  return (
    <div className="flex flex-col gap-4 lg:mx-auto lg:w-full lg:max-w-2xl">
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <QrCode size={36} className="text-warn" />
        <h1 className="text-lg font-semibold">New sticker</h1>
        <p className="font-mono text-muted">{code}</p>
        <p className="text-sm text-muted">This sticker isn't on anything yet. What is it on?</p>
      </Card>
      <Link
        to={`/capture?code=${encodeURIComponent(code)}`}
        className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent text-lg font-semibold text-accent-fg"
      >
        <Plus size={22} /> An item (quick capture)
      </Link>
      <Link
        to={`/locations/new?code=${encodeURIComponent(code)}`}
        className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 font-semibold"
      >
        <MapPin size={20} /> A bin, box or tote
      </Link>
      <p className="text-center text-[13px] text-muted">
        To put it on something that already exists, open it and use “Assign sticker” or “Add another stickered one”.
      </p>
    </div>
  );
}
