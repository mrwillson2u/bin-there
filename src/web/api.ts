import type { ApiError } from "../shared/api";
import { clientId } from "./live";

export class RequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: { "X-Client": clientId, ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(res.status, err?.error.code ?? "INTERNAL", err?.error.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Upload a photo + thumbnail (already resized on the device; see lib/photo.ts). */
export async function uploadPhoto<T>(itemId: number, photo: Blob, thumb: Blob): Promise<T> {
  const form = new FormData();
  form.append("photo", photo, "photo.jpg");
  form.append("thumb", thumb, "thumb.jpg");
  const res = await fetch(`/api/items/${itemId}/photos`, { method: "POST", body: form, headers: { "X-Client": clientId } });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(res.status, err?.error.code ?? "INTERNAL", err?.error.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Save a photo's square crop with the thumbnail cut from it on the device (DEC-030). */
export async function savePhotoCrop<T>(photoId: number, crop: unknown, thumb: Blob): Promise<T> {
  const form = new FormData();
  form.append("crop", JSON.stringify(crop));
  form.append("thumb", thumb, "thumb.jpg");
  const res = await fetch(`/api/photos/${photoId}/crop`, { method: "PUT", body: form, headers: { "X-Client": clientId } });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(res.status, err?.error.code ?? "INTERNAL", err?.error.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
