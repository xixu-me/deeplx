/**
 * DeepL Write (rephrase) via the free session backend
 *
 * Mirrors what the deepl.com/write app does: start a session, then drive a
 * SignalR WebSocket until the server sends the improved text back. No API key.
 */

import { REPHRASE_SESSION_URL, REPHRASE_SOCKET_ORIGIN } from "../const";
import { createErrorResponse } from "../errorHandler";
import {
  Config,
  createStandardResponse,
  RephraseParams,
  ResponseParams,
} from "../types";
import {
  appendRequest,
  HANDSHAKE,
  isHandshakeAck,
  PARTICIPATE,
  parseStartSessionResponse,
  PING,
  readImprovedText,
  readVersion,
  signalrInvoke,
  startSessionBody,
} from "./deeplWriteProtocol";

/** The whole exchange is several round trips; cap it rather than hang a request. */
const REPHRASE_TIMEOUT = 20000;

class RephraseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RephraseError";
  }
}

/**
 * Browser-ish headers. This is the backend the web app talks to, and it
 * rejects requests that do not look like they came from deepl.com.
 */
const BROWSER_HEADERS = {
  Origin: REPHRASE_SOCKET_ORIGIN,
  Referer: `${REPHRASE_SOCKET_ORIGIN}/`,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
} as const;

/**
 * Rephrase text using DeepL's free Write backend
 * @param params - Rephrase parameters (text, target_lang)
 * @param config - Configuration options
 * @returns Rephrase response in DeepLX format
 */
export async function rephraseWithDeepL(
  params: RephraseParams,
  config?: Config & { env?: Env; clientIP?: string }
): Promise<ResponseParams> {
  try {
    const { text, target_lang } = params;
    const lang = target_lang || "en-GB";

    const sessionResponse = await fetch(REPHRASE_SESSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        ...BROWSER_HEADERS,
        ...config?.customHeader,
      },
      // concat() returns an exactly-sized view, so its buffer is the payload.
      body: startSessionBody().buffer as ArrayBuffer,
    });

    if (!sessionResponse.ok) {
      throw new RephraseError(
        `DeepL Write session request failed with status ${sessionResponse.status}`,
        sessionResponse.status
      );
    }

    const { socketPath } = parseStartSessionResponse(
      new Uint8Array(await sessionResponse.arrayBuffer())
    );

    const improved = await runSession(socketPath, text, lang);

    return createStandardResponse(
      200,
      improved,
      Math.floor(Math.random() * 10000000000),
      "AUTO",
      lang.toUpperCase()
    );
  } catch (error) {
    console.error("Error in DeepL rephrase:", error);

    const errorResponse = createErrorResponse(error, {
      endpoint: "/rephrase",
      clientIP: config?.clientIP || "unknown",
    });

    return errorResponse.response;
  }
}

/**
 * Drive the session socket until the server returns the improved text.
 *
 * The server drips several frames: capabilities first (which carry the version
 * the append must be based on), then the rewrite. We send once the version is
 * known and resolve on the first target-field text that comes back.
 */
async function runSession(
  socketPath: string,
  text: string,
  lang: string
): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();

  // Workers reach WebSockets through fetch with an Upgrade header rather than
  // a WebSocket constructor.
  const socketUrl = new URL(socketPath, REPHRASE_SESSION_URL);

  let settled = false;
  let sent = false;
  let version: number | null = null;
  let socket: WebSocket | null = null;

  const finish = (action: () => void) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try {
      socket?.close();
    } catch {
      // Closing is best effort; the result is already decided.
    }
    action();
  };

  const timer = setTimeout(
    () =>
      finish(() =>
        reject(new RephraseError("Timed out waiting for DeepL Write result", 504))
      ),
    REPHRASE_TIMEOUT
  );

  try {
    const response = await fetch(socketUrl.toString(), {
      headers: { Upgrade: "websocket", ...BROWSER_HEADERS },
    });

    socket = response.webSocket;
    if (!socket) {
      throw new RephraseError(
        `DeepL Write socket upgrade failed with status ${response.status}`,
        502
      );
    }

    socket.accept();

    socket.addEventListener("message", (event) => {
      const frame =
        typeof event.data === "string"
          ? new TextEncoder().encode(event.data)
          : new Uint8Array(event.data as ArrayBuffer);

      if (isHandshakeAck(frame)) {
        socket?.send(PING);
        socket?.send(PARTICIPATE);
        return;
      }

      const reported = readVersion(frame);
      if (reported !== null) version = reported;

      if (!sent && version !== null) {
        sent = true;
        socket?.send(
          signalrInvoke("AppendRequest", appendRequest(text, lang, version), 1)
        );
        return;
      }

      if (sent) {
        const improved = readImprovedText(frame);
        // The source field echoes the caller's own text back; only a genuine
        // rewrite counts as the answer.
        if (improved && improved !== text) {
          finish(() => resolve(improved));
        }
      }
    });

    socket.addEventListener("error", () =>
      finish(() => reject(new RephraseError("DeepL Write socket error", 502)))
    );

    socket.addEventListener("close", () =>
      finish(() =>
        reject(new RephraseError("DeepL Write socket closed early", 502))
      )
    );

    socket.send(HANDSHAKE);
  } catch (error) {
    finish(() => reject(error));
  }

  return promise;
}
