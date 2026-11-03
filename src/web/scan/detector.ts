// Separates hardware-scanner input from human typing.
// See framework/05-System-Architecture.md → "Scanner input".
//
// The scanner (Tera HW0006 Pro in Bluetooth/USB HID mode) is configured to send
// STX as Ctrl+B before every code and Enter after it. Once the prefix is seen,
// every key is swallowed until Enter, so scanned text never reaches a field.
// A timing heuristic catches scans when no prefix is configured; in that case
// the characters have already been typed, so the caller is told how many leaked.

export type KeyInput = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  /** Milliseconds, e.g. KeyboardEvent.timeStamp */
  time: number;
};

export type Scan = {
  code: string;
  method: "prefix" | "burst";
  /** Characters already inserted into the focused field (burst method only). */
  leaked: number;
};

export type DetectorOptions = {
  /** Max gap between keys in a burst. Typing on a phone is far slower. */
  burstGapMs?: number;
  /** Minimum characters for a burst to count as a scan. */
  minBurstLength?: number;
  /** In prefix mode, give up waiting for Enter after this much silence. */
  prefixIdleMs?: number;
};

const isPrefix = (k: KeyInput) => k.ctrlKey && !k.altKey && !k.metaKey && k.key.toLowerCase() === "b";
const isChar = (k: KeyInput) => k.key.length === 1 && !k.ctrlKey && !k.metaKey;

export class ScanDetector {
  private readonly burstGapMs: number;
  private readonly minBurstLength: number;
  readonly prefixIdleMs: number;

  private inPrefixScan = false;
  private prefixBuffer = "";
  private lastPrefixKeyAt = 0;

  private burst = "";
  private lastBurstKeyAt = -Infinity;

  constructor(
    private readonly onScan: (scan: Scan) => void,
    opts: DetectorOptions = {},
  ) {
    this.burstGapMs = opts.burstGapMs ?? 35;
    this.minBurstLength = opts.minBurstLength ?? 4;
    this.prefixIdleMs = opts.prefixIdleMs ?? 250;
  }

  get scanning() {
    return this.inPrefixScan;
  }

  /** Returns "block" when the key must be swallowed (preventDefault). */
  handleKey(k: KeyInput): "block" | "pass" {
    if (this.inPrefixScan) {
      this.lastPrefixKeyAt = k.time;
      if (k.key === "Enter") {
        this.finishPrefixScan();
      } else if (k.key.length === 1) {
        this.prefixBuffer += k.key;
      }
      // Modifiers (Shift for capitals) and anything else are swallowed too.
      return "block";
    }

    if (isPrefix(k)) {
      this.inPrefixScan = true;
      this.prefixBuffer = "";
      this.lastPrefixKeyAt = k.time;
      this.burst = "";
      return "block";
    }

    if (isChar(k)) {
      if (k.time - this.lastBurstKeyAt > this.burstGapMs) this.burst = "";
      this.burst += k.key;
      this.lastBurstKeyAt = k.time;
      return "pass";
    }

    if (k.key === "Enter") {
      const isBurst =
        this.burst.length >= this.minBurstLength && k.time - this.lastBurstKeyAt <= this.burstGapMs;
      const code = this.burst;
      this.burst = "";
      if (isBurst) {
        this.onScan({ code, method: "burst", leaked: code.length });
        return "block"; // don't submit the form the leaked text landed in
      }
      return "pass";
    }

    if (k.key !== "Shift") this.burst = "";
    return "pass";
  }

  /** Call when no key has arrived for prefixIdleMs; ends a scan whose Enter was lost. */
  handleIdle(now: number) {
    if (this.inPrefixScan && now - this.lastPrefixKeyAt >= this.prefixIdleMs) {
      this.finishPrefixScan();
    }
  }

  private finishPrefixScan() {
    const code = this.prefixBuffer.trim();
    this.inPrefixScan = false;
    this.prefixBuffer = "";
    if (code) this.onScan({ code, method: "prefix", leaked: 0 });
  }
}
