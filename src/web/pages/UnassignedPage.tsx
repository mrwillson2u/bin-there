import { Link, useParams } from "react-router-dom";
import { QrCode } from "lucide-react";
import { Card } from "../components/ui";

export function UnassignedPage() {
  const code = useParams().code ?? "";
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-2 p-6 text-center">
        <QrCode size={36} className="text-warn" />
        <h1 className="text-lg font-semibold">New sticker</h1>
        <p className="font-mono text-muted">{code}</p>
        <p className="text-sm text-muted">This sticker isn't assigned to anything yet.</p>
      </Card>
      <Link
        to={`/locations/new?code=${encodeURIComponent(code)}`}
        className="flex min-h-12 items-center justify-center rounded-xl bg-accent font-semibold text-accent-fg"
      >
        Make it a new location
      </Link>
      <p className="text-center text-[13px] text-muted">
        To put it on an existing location, open that location and tap “Assign sticker”.
        Items come in the next milestone.
      </p>
    </div>
  );
}
