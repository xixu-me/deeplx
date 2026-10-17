/**
 * Tests for optional API key authentication
 */

import { rejectUnauthorized } from "../../src/lib/apiKey";

function createContext(
  apiKeys: string | undefined,
  headers: HeadersInit = {},
  method = "POST"
) {
  return {
    env: { API_KEYS: apiKeys } as Env,
    req: {
      raw: new Request("https://example.com/translate", { method, headers }),
      method,
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), { status }),
  };
}

describe("API Key Module", () => {
  describe("rejectUnauthorized", () => {
    it("should allow requests when no API keys are configured", () => {
      expect(rejectUnauthorized(createContext(undefined))).toBeNull();
      expect(rejectUnauthorized(createContext(""))).toBeNull();
      expect(rejectUnauthorized(createContext(" , "))).toBeNull();
    });

    it("should allow an unauthenticated request while auth is disabled", () => {
      const context = createContext(undefined, { authorization: "Bearer any" });

      expect(rejectUnauthorized(context)).toBeNull();
    });

    it("should accept a valid bearer token", () => {
      const context = createContext("secret", {
        authorization: "Bearer secret",
      });

      expect(rejectUnauthorized(context)).toBeNull();
    });

    it("should accept a case-insensitive bearer scheme", () => {
      const context = createContext("secret", {
        authorization: "bearer secret",
      });

      expect(rejectUnauthorized(context)).toBeNull();
    });

    it("should accept a valid X-API-Key header", () => {
      const context = createContext("secret", { "x-api-key": "secret" });

      expect(rejectUnauthorized(context)).toBeNull();
    });

    it("should accept X-API-Key alongside an unrelated Authorization header", () => {
      const context = createContext("secret", {
        authorization: "Basic dXNlcjpwYXNz",
        "x-api-key": "secret",
      });

      expect(rejectUnauthorized(context)).toBeNull();
    });

    it("should accept X-API-Key alongside an invalid bearer token", () => {
      const context = createContext("secret", {
        authorization: "Bearer wrong",
        "x-api-key": "secret",
      });

      expect(rejectUnauthorized(context)).toBeNull();
    });

    it("should accept any key from a configured list", () => {
      const context = createContext("first, second , third", {
        "x-api-key": "second",
      });

      expect(rejectUnauthorized(context)).toBeNull();
    });

    it("should exempt CORS preflight requests", () => {
      const context = createContext("secret", {}, "OPTIONS");

      expect(rejectUnauthorized(context)).toBeNull();
    });

    it("should reject a request with no credentials", () => {
      expect(rejectUnauthorized(createContext("secret"))?.status).toBe(401);
    });

    it("should reject an incorrect key", () => {
      const context = createContext("secret", { "x-api-key": "wrong" });

      expect(rejectUnauthorized(context)?.status).toBe(401);
    });

    it("should reject a key that only prefixes a configured key", () => {
      const context = createContext("secret", { "x-api-key": "sec" });

      expect(rejectUnauthorized(context)?.status).toBe(401);
    });

    it("should reject an empty bearer token", () => {
      const context = createContext("secret", { authorization: "Bearer " });

      expect(rejectUnauthorized(context)?.status).toBe(401);
    });

    it("should reject a non-bearer authorization scheme", () => {
      const context = createContext("secret", { authorization: "Basic secret" });

      expect(rejectUnauthorized(context)?.status).toBe(401);
    });

    it("should return a standard error body", async () => {
      const response = rejectUnauthorized(createContext("secret"));

      expect(await response!.json()).toMatchObject({ code: 401, data: null });
    });
  });
});
