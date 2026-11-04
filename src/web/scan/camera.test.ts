import { describe, expect, it } from "vitest";
import { guideRect, lensName, pickCamera } from "./camera";

const iphone = [
  { deviceId: "f", label: "Front Camera" },
  { deviceId: "dual", label: "Back Dual Wide Camera" },
  { deviceId: "triple", label: "Back Triple Camera" },
  { deviceId: "uw", label: "Back Ultra Wide Camera" },
  { deviceId: "tele", label: "Back Telephoto Camera" },
  { deviceId: "main", label: "Back Camera" },
];

describe("pickCamera", () => {
  it("prefers the plain back camera on an iPhone over the lens-hopping virtual ones", () => {
    expect(pickCamera(iphone, null)).toBe("main");
  });
  it("keeps the lens chosen before when it's still there, and forgets one that isn't", () => {
    expect(pickCamera(iphone, "uw")).toBe("uw");
    expect(pickCamera(iphone, "gone")).toBe("main");
  });
  it("takes any back-facing camera on other phones, else the first camera", () => {
    expect(pickCamera([{ deviceId: "1", label: "camera2 1, facing front" }, { deviceId: "0", label: "camera2 0, facing back" }], null)).toBe("0");
    expect(pickCamera([{ deviceId: "a", label: "" }, { deviceId: "b", label: "" }], null)).toBe("a");
    expect(pickCamera([], null)).toBeNull();
  });
});

describe("lensName", () => {
  it("gives short names", () => {
    expect(iphone.map((c, i) => lensName(c.label, i))).toEqual(["Front", "Auto lens", "Auto lens", "Ultra wide", "Telephoto", "Main"]);
    expect(lensName("", 2)).toBe("Camera 3");
  });
});

describe("guideRect", () => {
  it("is centred on the frame and sized from the view's shorter edge", () => {
    // 640×480 frame shown cover-fit in a 390×844 portrait view: scaled ×1.758, cropped left and right.
    const r = guideRect({ w: 640, h: 480 }, { w: 390, h: 844 }, 0.6, 0);
    expect(r.x + r.w / 2).toBeCloseTo(320, -1);
    expect(r.y + r.h / 2).toBeCloseTo(240, -1);
    expect(r.w).toBe(Math.round((0.6 * 390) / (844 / 480)));
    expect(r.w).toBe(r.h);
  });
  it("never leaves the frame", () => {
    const r = guideRect({ w: 200, h: 100 }, { w: 1000, h: 1000 }, 1, 1);
    expect(r).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });
});
