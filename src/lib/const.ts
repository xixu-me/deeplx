/**
 * App constants for DeepLX translation service
 * Contains API endpoints, language definitions, and other immutable values
 */

/**
 * DeepL API endpoint URL
 */
export const API_URL = "https://www2.deepl.com/jsonrpc";

/**
 * Number of alternative translations to request
 */
export const REQUEST_ALTERNATIVES = 0;

/**
 * DeepL Write session endpoint.
 *
 * Not the documented /v2/write/rephrase API, which needs a Pro key: this is
 * the free backend the deepl.com/write app itself uses. A session is opened
 * here, then driven over a WebSocket on the same host.
 */
export const REPHRASE_SESSION_URL =
  "https://ita-free.www.deepl.com/v2/startSession";

/**
 * Origin the free Write backend expects. It refuses requests that do not look
 * like they came from the web app.
 */
export const REPHRASE_SOCKET_ORIGIN = "https://www.deepl.com";

/**
 * Target languages the free Write backend advertises when a session opens.
 * Far narrower than the translation language set, so it is checked rather
 * than passed through.
 */
export const REPHRASE_TARGET_LANGS = [
  "de",
  "en-GB",
  "en-US",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pt-BR",
  "pt-PT",
  "zh-Hans",
] as const;
