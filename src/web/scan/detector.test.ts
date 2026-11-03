import { describe, expect, it } from "vitest";
import { ScanDetector, type KeyInput, type Scan } from "./detector";

function setup(opts = {}) {
  const scans: Scan[] = [];
  const d = new ScanDetector((s) => scans.push(s), opts);
  let t = 1000;
  const press = (key: string, gap: number, mods: Partial<KeyInput> = {}) => {
    t += gap;
    return d.handleKey({ key, ctrlKey: false, altKey: false, metaKey: false, time: t, ...mods });
  };
  const type = (text: string, gap: number) => [...text].map((ch) => press(ch, gap));
  return { d, scans, press, type, now: () => t };
}

describe("prefix scans (Ctrl+B … Enter)", () => {
  it("swallows every key and emits the code", () => {
    const { scans, press, type } = setup();
    expect(press("b", 0, { ctrlKey: true })).toBe("block");
    expect(type("SNT-0042", 10)).toEqual(Array(8).fill("block"));
    expect(press("Enter", 10)).toBe("block");
    expect(scans).toEqual([{ code: "SNT-0042", method: "prefix", leaked: 0 }]);
  });

  it("works even when the scanner is slow (no timing requirement)", () => {
    const { scans, press, type } = setup();
    press("b", 0, { ctrlKey: true });
    type("AB12", 120);
    press("Enter", 120);
    expect(scans[0]?.code).toBe("AB12");
  });

  it("swallows Shift used for capitals", () => {
    const { scans, press } = setup();
    press("b", 0, { ctrlKey: true });
    expect(press("Shift", 5)).toBe("block");
    press("A", 5);
    press("Enter", 5);
    expect(scans[0]?.code).toBe("A");
  });

  it("finishes on idle if Enter never arrives", () => {
    const { d, scans, press, type, now } = setup();
    press("b", 0, { ctrlKey: true });
    type("XYZ9", 10);
    d.handleIdle(now() + 100);
    expect(scans).toHaveLength(0);
    d.handleIdle(now() + 300);
    expect(scans[0]?.code).toBe("XYZ9");
    expect(d.scanning).toBe(false);
  });

  it("ignores an empty prefix scan", () => {
    const { scans, press } = setup();
    press("b", 0, { ctrlKey: true });
    press("Enter", 10);
    expect(scans).toHaveLength(0);
  });
});

describe("burst fallback (no prefix configured)", () => {
  it("treats a fast burst ending in Enter as a scan and reports leaked chars", () => {
    const { scans, press, type } = setup();
    expect(type("123456", 8)).toEqual(Array(6).fill("pass"));
    expect(press("Enter", 8)).toBe("block");
    expect(scans).toEqual([{ code: "123456", method: "burst", leaked: 6 }]);
  });

  it("leaves human typing alone", () => {
    const { scans, press, type } = setup();
    type("m3 screw", 150);
    expect(press("Enter", 150)).toBe("pass");
    expect(scans).toHaveLength(0);
  });

  it("does not count a human word followed by a fast tail", () => {
    const { scans, press, type } = setup();
    type("ab", 200);
    type("cd", 10);
    expect(press("Enter", 10)).toBe("pass");
    expect(scans).toHaveLength(0);
  });

  it("needs a minimum length", () => {
    const { scans, press, type } = setup();
    type("ab", 5);
    expect(press("Enter", 5)).toBe("pass");
    expect(scans).toHaveLength(0);
  });

  it("does not trigger on Enter long after a fast burst", () => {
    const { scans, press, type } = setup();
    type("abcdef", 5);
    expect(press("Enter", 500)).toBe("pass");
    expect(scans).toHaveLength(0);
  });
});
