import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "INTERNAL",
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(c: Context, err: Error) {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  // c.req.json() on a missing or malformed body.
  if (err instanceof SyntaxError) {
    return c.json({ error: { code: "VALIDATION", message: "Request body isn't valid JSON" } }, 400);
  }
  console.error(err);
  return c.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, 500);
}

export function parseBody<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    throw new ApiError(400, "VALIDATION", msg);
  }
  return r.data;
}
