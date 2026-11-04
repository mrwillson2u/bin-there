import { describe, expect, it } from "vitest";
import { boundsOf, frameToView, guideRect, lensName, pickCamera, pickTarget, visibleRect } from "./camera";

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

describe("frame to view", () => {
  it("maps the frame's middle to the view's middle, and the visible part edge to edge", () => {
    const video = { w: 1920, h: 1080 };
    const view = { w: 360, h: 300 };
    expect(frameToView({ x: 960, y: 540 }, video, view)).toEqual({ x: 180, y: 150 });
    const v = visibleRect(video, view);
    expect(v.h).toBe(1080);
    expect(v.w).toBe(1296);
    expect(frameToView({ x: v.x, y: v.y }, video, view)).toEqual({ x: 0, y: 0 });
    expect(boundsOf([{ x: 3, y: 9 }, { x: 7, y: 1 }, { x: 5, y: 5 }])).toEqual({ x: 3, y: 1, w: 4, h: 8 });
  });
});

describe("pickTarget", () => {
  const view = { w: 300, h: 300 };
  const at = (text: string, x: number, y: number) => ({ text, box: { x: x - 10, y: y - 10, w: 20, h: 20 } });
  it("takes the sticker nearest the aim mark", () => {
    expect(pickTarget([at("LEFT", 40, 150), at("MID", 160, 140), at("RIGHT", 280, 150)], view)?.text).toBe("MID");
  });
  it("ignores a sticker whose middle is off-screen, and is null with nothing seen", () => {
    expect(pickTarget([at("OFF", -5, 150)], view)).toBeNull();
    expect(pickTarget([], view)).toBeNull();
  });
});
