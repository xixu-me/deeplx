/**
 * Optional API key authentication for DeepLX
 *
 * DeepLX is open by default. Setting the `API_KEYS` secret turns on a bearer
 * token gate, which is what self-hosters on their own domain need: an open
 * translation endpoint is someone else's free API, and their traffic is what
 * gets the deployment's IP rate-limited upstream.
 *
 * Leaving `API_KEYS` unset changes nothing about how the service behaves.
 */
import { createStandardResponse } from "./types";

/**
 * Minimal Hono context surface required to authenticate a request
 */
type AuthContext = {
  env: Env;
  req: { raw: Request; method: string };
  json: (body: unknown, status: number) => Response;
};

/**
 * Collect the keys presented by the client
 *
 * `Authorization: Bearer <key>` is what most clients send by default;
 * `X-API-Key` is accepted because some translation clients cannot set an
 * Authorization header. Both are read so that a client sending an unrelated
 * Authorization header can still authenticate with `X-API-Key`.
 *
 * @param request The incoming request
 * @returns Every key the request presented, possibly empty
 */
function getPresentedKeys(request: Request): string[] {
  const keys: string[] = [];

  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const bearer = authorization.slice(7).trim();
    if (bearer) keys.push(bearer);
  }

  const apiKeyHeader = request.headers.get("x-api-key")?.trim();
  if (apiKeyHeader) keys.push(apiKeyHeader);

  return keys;
}

/**
 * Compare two strings without leaking their common prefix through timing
 *
 * Note that, like every practical implementation, this reveals whether the
 * lengths match. That is not worth defending against for a random key.
 *
 * @param a First string
 * @param b Second string
 * @returns Whether the strings are equal
 */
function timingSafeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

/**
 * Reject a request that fails API key authentication
 *
 * Returns null when the request may proceed, which is always the case while
 * `API_KEYS` is unset. CORS preflights are exempt because browsers send them
 * without credentials, and rejecting them would break browser clients before
 * they ever get to send the key. Multiple keys are supported so a single
 * client can be revoked without rotating the others.
 *
 * @param c Hono context
 * @returns A 401 response for an unauthenticated request, otherwise null
 */
export function rejectUnauthorized(c: AuthContext): Response | null {
  const configuredKeys = (c.env.API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);

  if (configuredKeys.length === 0) return null;
  if (c.req.method === "OPTIONS") return null;

  const presentedKeys = getPresentedKeys(c.req.raw);
  const isAuthorized = configuredKeys.some((configured) =>
    presentedKeys.some((presented) => timingSafeEquals(configured, presented))
  );

  if (isAuthorized) return null;

  return c.json(createStandardResponse(401, null), 401);
}
