import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronLeft, ChevronRight, Crop, Plus, Star, Trash2, X } from "lucide-react";
import type { ItemDetail, Photo } from "../../shared/api";
import { api } from "../api";
import { CroppedPhoto } from "./CroppedPhoto";
import { CropEditor } from "./CropEditor";
import { useAddPhoto } from "./PhotoSpot";
import { useToast } from "./Toast";
import { Button } from "./ui";

// A part's photos on its page (DEC-031). The main photo is the one shown in lists, tiles and
// the bin pane; the others are for another angle, the label or a pinout. Tap a photo in the
// strip to see it big; tap the big one for the whole photo, with Crop, Use as main and Delete.

function usePhotoAction(itemId: number) {
  const qc = useQueryClient();
  const toast = useToast();
  return (message: string) =>
    ({
      onSuccess: (item: ItemDetail) => {
        qc.setQueryData(["item", itemId], item);
        for (const key of ["items", "location", "pins"]) qc.invalidateQueries({ queryKey: [key] });
        toast.show({ message });
      },
      onError: (e: Error) => toast.show({ message: e.message, tone: "error" }),
    }) as const;
}

export function PartPhotos({ item }: { item: ItemDetail }) {
  const { add, busy } = useAddPhoto(item.id);
  const photos = item.photos;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cropping, setCropping] = useState<Photo | null>(null);
  const [viewing, setViewing] = useState(false);
  const handlers = usePhotoAction(item.id);
  const makeMain = useMutation({ mutationFn: (id: number) => api<ItemDetail>(`/photos/${id}/main`, { method: "PUT" }), ...handlers("Main photo changed") });

  // A photo just added is shown big, so you see where it went and can make it the main one.
  const known = useRef(new Set(photos.map((p) => p.id)));
  useEffect(() => {
    const fresh = photos.find((p) => !known.current.has(p.id));
    known.current = new Set(photos.map((p) => p.id));
    if (fresh) setSelectedId(fresh.id);
  }, [photos]);

  const selected = photos.find((p) => p.id === selectedId) ?? photos[0];
  const picker = (label: string, wide: boolean) => (
    <label
      className={`flex h-14 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-accent ${wide ? "px-3" : "w-14"} ${busy ? "opacity-50" : ""}`}
    >
      {wide ? <Camera size={18} /> : <Plus size={20} />}
      {wide && <span aria-hidden>{busy ? "Uploading…" : label}</span>}
      <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={label} disabled={busy} onChange={(e) => add(e.target.files?.[0])} />
    </label>
  );

  if (!selected) {
    return (
      <label className={`flex aspect-square w-full max-w-72 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border text-accent ${busy ? "opacity-50" : ""}`}>
        <Camera size={32} />
        <span className="font-semibold">{busy ? "Uploading…" : "Take a photo"}</span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo" disabled={busy} onChange={(e) => add(e.target.files?.[0])} />
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-square w-full max-w-72 overflow-hidden rounded-2xl bg-surface-2">
        <button type="button" onClick={() => setViewing(true)} aria-label="See the whole photo" className="block h-full w-full">
          <CroppedPhoto photo={selected} />
        </button>
        <button
          type="button"
          onClick={() => setCropping(selected)}
          className="absolute bottom-2 right-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/65 px-3 text-sm font-medium text-white"
        >
          <Crop size={16} /> Crop
        </button>
        {photos.length > 1 && selected.main && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-xs font-medium text-white">
            <Star size={12} className="fill-warn text-warn" /> Main
          </span>
        )}
      </div>

      <div className="flex max-w-72 items-center gap-2 overflow-x-auto [scrollbar-width:none]" aria-label="Photos">
        {photos.length > 1 &&
          photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              aria-pressed={p.id === selected.id}
              aria-label={`Photo ${i + 1}${p.main ? ", the main photo" : ""}`}
              className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ${p.id === selected.id ? "outline outline-2 outline-accent" : "opacity-75"}`}
            >
              <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
              {p.main && <Star size={14} className="absolute left-1 top-1 fill-warn text-warn drop-shadow" aria-hidden />}
            </button>
          ))}
        {picker("Add another photo", photos.length === 1)}
      </div>

      <div className="max-w-72 text-[13px] text-muted">
        {photos.length === 1 ? (
          "Add more for another angle, the label or a pinout."
        ) : selected.main ? (
          "The main photo is the one shown in lists and bins."
        ) : (
          <Button variant="ghost" className="-ml-1 px-1" onClick={() => makeMain.mutate(selected.id)} disabled={makeMain.isPending}>
            <Star size={16} /> Use as main photo
          </Button>
        )}
      </div>

      {cropping && <CropEditor itemId={item.id} photo={cropping} onClose={() => setCropping(null)} />}
      {viewing && (
        <PhotoViewer
          item={item}
          startId={selected.id}
          onClose={(id) => {
            setViewing(false);
            if (id !== null) setSelectedId(id);
          }}
          onCrop={(p) => {
            setViewing(false);
            setCropping(p);
          }}
        />
      )}
    </div>
  );
}

/** The whole photo, full screen, with what you can do to it. */
function PhotoViewer({ item, startId, onClose, onCrop }: { item: ItemDetail; startId: number; onClose: (shownId: number | null) => void; onCrop: (p: Photo) => void }) {
  const photos = item.photos;
  const [index, setIndex] = useState(Math.max(0, photos.findIndex((p) => p.id === startId)));
  const photo = photos[Math.min(index, photos.length - 1)];
  const handlers = usePhotoAction(item.id);
  const makeMain = useMutation({ mutationFn: (id: number) => api<ItemDetail>(`/photos/${id}/main`, { method: "PUT" }), ...handlers("Main photo changed") });
  const remove = useMutation({
    mutationFn: (id: number) => api<ItemDetail>(`/photos/${id}`, { method: "DELETE" }),
    ...handlers("Photo deleted"),
    onSettled: () => onClose(null),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(photo?.id ?? null);
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, photos.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, photo, photos.length]);

  if (!photo) return null;
  const nav = "flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-0";
  return (
    <section role="dialog" aria-label="Photo" data-sheet className="fixed inset-0 z-50 flex flex-col bg-black pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 px-4 py-2 text-white">
        <span className="flex-1 text-sm">
          {photos.length > 1 ? `Photo ${index + 1} of ${photos.length}` : "Photo"}
          {photo.main && photos.length > 1 && " · main"}
        </span>
        <button type="button" onClick={() => onClose(photo.id)} aria-label="Close" className="flex h-11 w-11 items-center justify-center">
          <X size={22} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <img src={photo.url} alt="" className="absolute inset-0 h-full w-full object-contain" />
        {photos.length > 1 && (
          <>
            <button type="button" className={`${nav} absolute left-2 top-1/2 -translate-y-1/2`} onClick={() => setIndex((i) => i - 1)} disabled={index === 0} aria-label="Previous photo">
              <ChevronLeft size={24} />
            </button>
            <button type="button" className={`${nav} absolute right-2 top-1/2 -translate-y-1/2`} onClick={() => setIndex((i) => i + 1)} disabled={index === photos.length - 1} aria-label="Next photo">
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2 px-4 py-3">
        <Button onClick={() => onCrop(photo)}>
          <Crop size={18} /> Crop
        </Button>
        {!photo.main && (
          <Button onClick={() => makeMain.mutate(photo.id)} disabled={makeMain.isPending}>
            <Star size={18} /> Use as main photo
          </Button>
        )}
        <Button
          variant="danger"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(photos.length > 1 && photo.main ? "Delete the main photo? The next one becomes the main photo." : "Delete this photo?")) remove.mutate(photo.id);
          }}
        >
          <Trash2 size={18} /> Delete photo
        </Button>
      </div>
    </section>
  );
}
