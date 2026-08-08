/**
 * Bearer-token gate.
 *
 * Upstream deeplx is deliberately open — its README sells "no API keys" as a
 * feature. That is fine for a throwaway instance and wrong for one on a domain
 * we own: an open translation proxy on translate.jonas-strassel.de is someone
 * else's free API, and their traffic is what gets our IP rate-limited by the
 * upstream provider. Which is exactly the failure that made us deploy this.
 *
 * So the whole API requires a key. This is the only local change to the fork,
 * kept in its own module so a `git pull` from upstream cannot silently drop it.
 */
import { createStandardResponse } from "./types";

/**
 * Reads the presented key from either header. `Authorization: Bearer <key>` is
 * what most clients send by default; `X-API-Key` is there because some
 * translation clients cannot set an Authorization header at all.
 */
function presentedKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return req.headers.get("x-api-key")?.trim() || null;
}

/**
 * Constant-time comparison.
 *
 * A plain `===` on a secret leaks its prefix through timing. The comparison is
 * cheap and the endpoint is public, so there is no reason to hand out that
 * information.
 */
function equals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Rejects a request that does not carry the key, else returns null to continue.
 *
 * Fails CLOSED: if API_KEYS is unset the service answers 503 rather than
 * serving translations to everyone. A missing secret is a deploy mistake, and
 * the safe reading of a deploy mistake is "not open for business".
 */
export function rejectUnauthorized(c: {
  env: Env;
  req: { raw: Request };
  json: (body: unknown, status: number) => Response;
}): Response | null {
  const configured = (c.env.API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (configured.length === 0) {
    return c.json(createStandardResponse(503, null), 503);
  }

  const presented = presentedKey(c.req.raw);
  if (!presented) {
    return c.json(createStandardResponse(401, null), 401);
  }

  // Several keys are allowed so one client can be revoked without breaking the
  // rest, which is the whole reason this is a list and not a single value.
  const ok = configured.some((key) => equals(key, presented));
  return ok ? null : c.json(createStandardResponse(403, null), 403);
}
