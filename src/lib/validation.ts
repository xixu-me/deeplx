/**
 * Input validation and sanitization utilities for DeepLX API
 * Provides comprehensive validation for translation requests
 */

import { PAYLOAD_LIMITS } from "./config";
import { REPHRASE_TARGET_LANGS } from "./const";
import { RephraseParams } from "./types";

/**
 * Configuration constants for validation
 */
const MAX_TEXT_LENGTH = PAYLOAD_LIMITS.MAX_TEXT_LENGTH;

/**
 * Result interface for validation operations
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedInput?: any;
}

/**
 * Validate a single translation request
 * Performs comprehensive validation on request structure and parameters
 * @param input The request input to validate
 * @returns ValidationResult - Validation result with errors and sanitized input
 */

export function validateTranslationRequest(input: any): ValidationResult {
  const errors: string[] = [];

  // Check if input is an object
  if (!input || typeof input !== "object") {
    return {
      isValid: false,
      errors: ["Request body must be a valid JSON object"],
    };
  }

  // Validate text field
  if (!input.text) {
    errors.push("Text field is required");
  } else if (typeof input.text !== "string") {
    errors.push("Text field must be a string");
  } else if (input.text.trim().length === 0) {
    errors.push("Text field cannot be empty");
  } else if (input.text.length > MAX_TEXT_LENGTH) {
    errors.push(
      `Text field exceeds maximum length of ${MAX_TEXT_LENGTH} characters`
    );
  }

  // Validate source_lang (basic format validation)
  if (input.source_lang && typeof input.source_lang !== "string") {
    errors.push("Source language must be a string");
  } else if (input.source_lang && input.source_lang.length < 2) {
    errors.push("Source language code is too short");
  }

  // Validate target_lang (required and basic format validation)
  if (!input.target_lang) {
    errors.push("Target language is required");
  } else if (typeof input.target_lang !== "string") {
    errors.push("Target language must be a string");
  } else if (input.target_lang.length < 2) {
    errors.push("Target language code is too short");
  } else if (input.target_lang.toLowerCase() === "auto") {
    errors.push("Target language cannot be 'auto'");
  }

  // Create sanitized input object
  const sanitizedInput = {
    text: typeof input.text === "string" ? input.text.trim() : "",
    source_lang:
      typeof input.source_lang === "string"
        ? input.source_lang.toLowerCase()
        : "auto",
    target_lang:
      typeof input.target_lang === "string"
        ? input.target_lang.toLowerCase()
        : "en",
  };

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedInput: errors.length === 0 ? sanitizedInput : undefined,
  };
}

/**
 * Validate a rephrase request
 *
 * Stricter than translation validation because the Write backend is: it
 * accepts only a short fixed list of target languages. Checking here turns a
 * wasted session round trip into a local error that names the problem.
 * @param input The request input to validate
 * @returns ValidationResult with errors and sanitized rephrase parameters
 */
export function validateRephraseRequest(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return {
      isValid: false,
      errors: ["Request body must be a valid JSON object"],
    };
  }

  const body = input as Record<string, unknown>;
  const { text, target_lang } = body;

  if (!text) {
    errors.push("Text field is required");
  } else if (typeof text !== "string") {
    errors.push("Text field must be a string");
  } else if (text.trim().length === 0) {
    errors.push("Text field cannot be empty");
  } else if (text.length > MAX_TEXT_LENGTH) {
    errors.push(
      `Text field exceeds maximum length of ${MAX_TEXT_LENGTH} characters`
    );
  }

  // Case-insensitive so callers can send EN-US like they do to /translate,
  // but the value forwarded upstream is always the canonical casing.
  let canonicalTargetLang: RephraseParams["target_lang"];
  if (target_lang !== undefined) {
    const match =
      typeof target_lang === "string"
        ? REPHRASE_TARGET_LANGS.find(
            (lang) => lang.toLowerCase() === target_lang.toLowerCase()
          )
        : undefined;

    if (!match) {
      errors.push(
        `Target language must be one of: ${REPHRASE_TARGET_LANGS.join(", ")}`
      );
    }
    canonicalTargetLang = match;
  }

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  const sanitizedInput: RephraseParams = {
    text: (text as string).trim(),
    ...(canonicalTargetLang ? { target_lang: canonicalTargetLang } : {}),
  };

  return { isValid: true, errors, sanitizedInput };
}
