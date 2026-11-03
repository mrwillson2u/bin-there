import type { ApiError } from "../shared/api";

export class RequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
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
  const res = await fetch(`/api/items/${itemId}/photos`, { method: "POST", body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new RequestError(res.status, err?.error.code ?? "INTERNAL", err?.error.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
