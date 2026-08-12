/**
 * Type definitions for DeepLX translation service
 * Provides comprehensive type safety for API operations and data structures
 */

import { REPHRASE_TARGET_LANGS } from "./const";

/**
 * Source language type (includes auto-detection)
 */
export type SourceLang = string | "auto";

/**
 * Target language type (excludes auto-detection)
 */
export type TargetLang = string;

/**
 * Raw response parameters from DeepL API
 * Represents the exact structure returned by the translation service
 */
export type RawResponseParams = {
  jsonrpc: string;
  id: number;
  result: {
    texts: {
      text: string;
    }[];
    lang: string;
    lang_is_confident: boolean;
    detectedLanguages: { unsupported: number } & Record<string, number>;
  };
};

/**
 * Request parameters for translation operations
 */
export type RequestParams = {
  text: string;
  source_lang: SourceLang;
  target_lang: TargetLang;
};

/**
 * Target language accepted by the rephrase endpoint
 */
export type RephraseTargetLang = (typeof REPHRASE_TARGET_LANGS)[number];

/**
 * Request parameters for rephrase operations
 *
 * No source language: DeepL Write detects it.
 */
export type RephraseParams = {
  text: string;
  target_lang?: RephraseTargetLang;
};

/**
 * Standardized response parameters for DeepLX API
 * Note: Language codes in responses are always returned in uppercase when code is 200
 * When code is not 200, source_lang and target_lang are null
 */
export type ResponseParams = {
  code: number;
  data: string | null;
  id: number;
  source_lang: string | null; // Always uppercase in responses when code is 200, null otherwise
  target_lang: string | null; // Always uppercase in responses when code is 200, null otherwise
};

/**
 * Configuration options for translation operations
 */
/**
 * Configuration options for translation operations
 */
export type Config = {
  proxyEndpoint?: string;
  customHeader?: Record<string, string>;
  clientIP?: string;
};

/**
 * Helper function to create standardized response format
 * Ensures all responses follow the same structure
 * When HTTP status code is not 200, everything is null except the unique request identifier
 */
export function createStandardResponse(
  code: number,
  data: string | null,
  id?: number,
  source_lang?: string,
  target_lang?: string
): ResponseParams {
  const responseId = id ?? Math.floor(Math.random() * 10000000000);

  // If status code is not 200, set everything to null except id
  if (code !== 200) {
    return {
      code,
      data: null,
      id: responseId,
      source_lang: null,
      target_lang: null,
    };
  }

  // For successful responses (code 200), return with actual values
  return {
    code,
    data,
    id: responseId,
    source_lang: (source_lang || "AUTO").toUpperCase(),
    target_lang: (target_lang || "EN").toUpperCase(),
  };
}

/**
 * Note: The following interfaces are defined globally in worker-configuration.d.ts:
 * - ProxyEndpoint: Proxy endpoint configuration
 * - CacheEntry: Cache entry structure
 * - RateLimitEntry: Rate limiting data structure
 */
