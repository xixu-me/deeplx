/**
 * Cloudflare Workers Environment Bindings
 * Defines all required and optional environment bindings for DeepLX
 */
interface Env {
  /** KV namespace for translation caching */
  CACHE_KV: KVNamespace;

  /** KV namespace for rate limiting data */
  RATE_LIMIT_KV: KVNamespace;

  /** Analytics Engine dataset for metrics collection */
  ANALYTICS: AnalyticsEngineDataset;

  /** Comma-separated list of proxy URLs (optional) */
  PROXY_URLS?: string;

  /** Comma-separated list of proxy weights (optional) */
  PROXY_WEIGHTS?: string;

  /** Enables the /debug endpoint only when set to an explicit truthy value */
  DEBUG_MODE?: string;

  /**
   * Comma-separated accepted API keys, set as a secret. Local addition to the
   * fork: upstream ships no auth. Unset means the service refuses every
   * request rather than serving an open proxy; see lib/apiKey.ts.
   */
  API_KEYS?: string;
}

/**
 * Cache entry structure for translation storage
 */
interface CacheEntry {
  /** Translated text content */
  data: string;

  /** Timestamp when translation was cached */
  timestamp: number;

  /** Source language code (uppercase) */
  source_lang: string;

  /** Target language code (uppercase) */
  target_lang: string;

  /** Optional unique request identifier */
  id?: number;
}

/**
 * Rate limiting entry structure for token bucket algorithm
 */
interface RateLimitEntry {
  /** Current number of available tokens */
  tokens: number;

  /** Timestamp of last token refill */
  lastRefill: number;
}

/**
 * Proxy endpoint configuration
 */
interface ProxyEndpoint {
  /** Proxy URL endpoint */
  url: string;
}
