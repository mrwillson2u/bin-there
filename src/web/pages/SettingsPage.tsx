import { useState } from "react";
import { ScanLine, SunMoon, Volume2 } from "lucide-react";
import { getTheme, setTheme, themeLabels, themes, type Theme } from "../theme";
import { getScanMethod, scanMethodHints, scanMethodLabels, scanMethods, setScanMethod, type ScanMethod } from "../settings";
import { setSound, soundOn } from "../scan/feedback";
import { Card } from "../components/ui";

// Settings for this device (DEC-043): appearance, how the Stickers screen starts, the beep.
// Reached from the sidebar and from the bottom of Locations. Nothing here is stored on the server.

export function SettingsPage() {
  const [theme, pickTheme] = useState<Theme>(getTheme);
  const [method, pickMethod] = useState<ScanMethod>(getScanMethod);
  const [sound, pickSound] = useState<boolean>(soundOn);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-[13px] text-muted">For this phone or computer only.</p>
      </div>

      <Section icon={<ScanLine size={18} />} title="Stickers screen starts with">
        <Choices
          label="Stickers screen starts with"
          options={scanMethods}
          labels={scanMethodLabels}
          value={method}
          onPick={(m) => { setScanMethod(m); pickMethod(m); }}
        />
        <p className="text-sm text-muted">{scanMethodHints[method]}</p>
      </Section>

      <Section icon={<Volume2 size={18} />} title="Scan beep">
        <Choices
          label="Scan beep"
          options={["on", "off"] as const}
          labels={{ on: "On", off: "Off" }}
          value={sound ? "on" : "off"}
          onPick={(v) => { setSound(v === "on"); pickSound(v === "on"); }}
        />
        <p className="text-sm text-muted">A high beep and a buzz when a scan goes through; a low double tone when it's refused.</p>
      </Section>

      <Section icon={<SunMoon size={18} />} title="Appearance">
        <Choices label="Appearance" options={themes} labels={themeLabels} value={theme} onPick={(t) => { setTheme(t); pickTheme(t); }} />
      </Section>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
        {icon} {title}
      </h2>
      {children}
    </Card>
  );
}

function Choices<T extends string>({ label, options, labels, value, onPick }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onPick(o)}
          className={`min-h-11 rounded-xl border px-4 ${value === o ? "border-accent bg-accent/15 font-semibold text-accent" : "border-border bg-surface-2 text-muted"}`}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
