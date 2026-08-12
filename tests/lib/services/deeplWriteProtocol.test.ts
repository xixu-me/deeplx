/**
 * Wire-format tests for the free DeepL Write protocol
 *
 * The byte layouts here were captured from the real deepl.com/write app. They
 * are an undocumented contract, so these tests exist to make a silent drift in
 * our encoder loud, and to prove the decoder tolerates the frames the server
 * actually sends.
 */

import { describe, expect, it } from "@jest/globals";
import {
  appendRequest,
  isHandshakeAck,
  parseStartSessionResponse,
  readImprovedText,
  readVersion,
  signalrInvoke,
  startSessionBody,
} from "../../../src/lib/services/deeplWriteProtocol";

const hex = (b: Uint8Array) =>
  [...b].map((c) => c.toString(16).padStart(2, "0")).join(" ");

describe("DeepL Write protocol", () => {
  describe("startSessionBody", () => {
    it("should request a Write-mode session with an empty document", () => {
      // 08 02 = sessionMode SESSION_MODE_WRITE; the server 500s on anything else.
      expect(hex(startSessionBody())).toBe("08 02 12 06 0a 04 08 05 12 00 1a 00");
    });
  });

  describe("parseStartSessionResponse", () => {
    it("should read the socket path out of the response", () => {
      const path = "/v2/sessions?s=abc&p=2&i=xyz";
      const body = Uint8Array.from([
        0x0a, 0x03, 0x61, 0x62, 0x63, // field 1: session id
        0x2a, path.length, ...new TextEncoder().encode(path), // field 5: socket path
      ]);

      expect(parseStartSessionResponse(body)).toEqual({ socketPath: path });
    });

    it("should reject a response with no socket path", () => {
      const body = Uint8Array.from([0x0a, 0x03, 0x61, 0x62, 0x63]);

      expect(() => parseStartSessionResponse(body)).toThrow(/socket path/);
    });
  });

  describe("signalrInvoke", () => {
    it("should wrap the payload in a length-prefixed MessagePack invocation", () => {
      const frame = signalrInvoke("AppendRequest", Uint8Array.from([0xaa]), 1);

      // length prefix, then fixarray(5) / type=1 / headers / invocation id "1"
      expect(frame[0]).toBe(frame.length - 1);
      expect(hex(frame.subarray(1, 6))).toBe("95 01 80 a1 31");
      expect(Buffer.from(frame.subarray(7, 20)).toString()).toBe(
        "AppendRequest"
      );
      // fixarray(1), ext8, size, hub payload type 4
      expect(hex(frame.subarray(20, 24))).toBe("91 c7 01 04");
      expect(frame[24]).toBe(0xaa);
    });
  });

  describe("appendRequest", () => {
    it("should carry the text and echo the base version", () => {
      const body = appendRequest("hello", "en-GB", 30);
      const bytes = hex(body);

      expect(Buffer.from(body).includes(Buffer.from("hello"))).toBe(true);
      expect(Buffer.from(body).includes(Buffer.from("en-GB"))).toBe(true);
      // baseVersion 30 (0x1e) nested as {1:{1:30}}; a stale value makes the
      // server reject the whole message as failing validation.
      expect(bytes.endsWith("12 04 0a 02 08 1e")).toBe(true);
    });

    it("should send the property operations the server demands first", () => {
      // Without these the server answers 901_append_not_allowed.
      const body = appendRequest("hello", "en-GB", 1);

      expect(hex(body)).toContain("08 06");
    });
  });

  describe("isHandshakeAck", () => {
    it("should recognise the empty handshake record", () => {
      expect(isHandshakeAck(Uint8Array.from([0x7b, 0x7d, 0x1e]))).toBe(true);
    });

    it("should not mistake a data frame for the handshake", () => {
      expect(isHandshakeAck(Uint8Array.from([0x19, 0x96, 0x01]))).toBe(false);
    });
  });

  describe("readVersion", () => {
    it("should read the version the server reports", () => {
      // ...0a 04 0a 02 08 21 -> version 33
      const frame = Uint8Array.from([
        0x91, 0xd7, 0x05, 0x0a, 0x06, 0x0a, 0x04, 0x0a, 0x02, 0x08, 0x21, 0x90,
      ]);

      expect(readVersion(frame)).toBe(33);
    });

    it("should return null when a frame carries no version", () => {
      expect(readVersion(Uint8Array.from([0x01, 0x02, 0x03]))).toBeNull();
    });
  });

  describe("readImprovedText", () => {
    /** Build a ParticipantResponse carrying one FieldEvent, as the server does. */
    const frame = (fieldName: number, text: string) => {
      const t = new TextEncoder().encode(text);
      const change = Uint8Array.from([0x12, t.length, ...t]); // TextChangeOperation{2:text}
      const event = Uint8Array.from([
        0x08, fieldName,
        0x12, change.length, ...change,
      ]);
      const payload = Uint8Array.from([
        0x1a, event.length + 2, 0x0a, event.length, ...event,
      ]);
      // msgpack ext8 envelope, hub payload type 5
      return Uint8Array.from([
        0x91, 0xc7, payload.length, 0x05, ...payload,
      ]);
    };

    it("should read the rewrite from the target field", () => {
      expect(readImprovedText(frame(6, "This is better."))).toBe(
        "This is better."
      );
    });

    it("should ignore the echo on the source field", () => {
      // The server echoes the caller's own text back on field 5; treating that
      // as the answer would return the input unchanged.
      expect(readImprovedText(frame(5, "this are bad"))).toBeNull();
    });

    it("should return null for a frame with no ext payload", () => {
      expect(readImprovedText(Uint8Array.from([0x01, 0x02]))).toBeNull();
    });
  });
});
