import { useState } from "react";
import type { Photo } from "../../shared/api";
import { cropRect } from "../lib/photo";

/**
 * A photo shown as its square crop (DEC-030), drawn from the full photo so it's sharp at any
 * size. Fills its parent, which should be square.
 */
export function CroppedPhoto({ photo }: { photo: Pick<Photo, "url" | "crop"> }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const r = dims ? cropRect(dims.w, dims.h, photo.crop) : null;
  return (
    <span className="relative block h-full w-full overflow-hidden">
      <img
        src={photo.url}
        alt=""
        onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className={`absolute max-w-none ${r ? "" : "invisible"}`}
        style={
          r && dims
            ? {
                width: `${(dims.w / r.side) * 100}%`,
                height: `${(dims.h / r.side) * 100}%`,
                left: `${(-r.x / r.side) * 100}%`,
                top: `${(-r.y / r.side) * 100}%`,
              }
            : undefined
        }
      />
    </span>
  );
}
