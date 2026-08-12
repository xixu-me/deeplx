/**
 * Wire protocol for DeepL's free Write backend
 *
 * The free Write app does not use the documented /v2/write/rephrase endpoint.
 * It opens a stateful session on ita-free.www.deepl.com, then exchanges
 * protobuf messages (package deepl.pb.interactive_text_api) over a SignalR
 * WebSocket using the MessagePack hub protocol.
 *
 * Everything here was derived by capturing the real app; none of it is a
 * published contract. Field numbers are the load-bearing part, so they are
 * named rather than inlined.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Field numbers, from the app's own protobuf encoders. */
const FIELD = {
  startSession: { sessionMode: 1, baseDocument: 2, sessionOptions: 3 },
  startSessionResponse: { sessionId: 1, token: 3, socketPath: 5 },
  participantRequest: { appendMessage: 1 },
  appendMessage: { events: 1, baseVersion: 2 },
  fieldEvent: {
    fieldName: 1,
    textChangeOperation: 2,
    setPropertyOperation: 5,
    participantId: 6,
  },
  textChangeOperation: { range: 1, text: 2 },
  textRange: { start: 1, end: 2 },
} as const;

/** SESSION_MODE_WRITE, from the SessionMode enum. */
const SESSION_MODE_WRITE = 2;

/**
 * FieldEvent.fieldName discriminates source from target. The rephrased text
 * arrives on the target field; without this check the source echo looks like
 * a valid result.
 */
const FIELD_NAME = { source: 5, target: 6 } as const;

/** SetPropertyOperation property ids observed in the session handshake. */
const PROPERTY = { documentMode: 26, language: 21 } as const;

/** Varint-encode an unsigned integer. */
function varint(value: number): Uint8Array {
  const out: number[] = [];
  let n = value;
  for (;;) {
    const byte = n & 0x7f;
    n >>>= 7;
    out.push(byte | (n ? 0x80 : 0));
    if (!n) return Uint8Array.from(out);
  }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Length-delimited (wire type 2) field. */
function bytes(field: number, payload: Uint8Array): Uint8Array {
  return concat(varint((field << 3) | 2), varint(payload.length), payload);
}

/** Varint (wire type 0) field. */
function uint(field: number, value: number): Uint8Array {
  return concat(varint((field << 3) | 0), varint(value));
}

type Cursor = { buf: Uint8Array; pos: number };

function readVarint(c: Cursor): number {
  let result = 0;
  let shift = 0;
  for (;;) {
    if (c.pos >= c.buf.length) throw new Error("truncated varint");
    const byte = c.buf[c.pos++];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    if (!(byte & 0x80)) return result >>> 0;
  }
}

export type ProtoField = { field: number; value: number | Uint8Array };

/** Walk one protobuf message, skipping field types this protocol never uses. */
export function parseMessage(buf: Uint8Array): ProtoField[] {
  const out: ProtoField[] = [];
  const c: Cursor = { buf, pos: 0 };
  while (c.pos < buf.length) {
    let key: number;
    try {
      key = readVarint(c);
    } catch {
      return out;
    }
    const field = key >>> 3;
    const wire = key & 7;
    if (wire === 0) {
      try {
        out.push({ field, value: readVarint(c) });
      } catch {
        return out;
      }
    } else if (wire === 2) {
      let len: number;
      try {
        len = readVarint(c);
      } catch {
        return out;
      }
      if (c.pos + len > buf.length) return out;
      out.push({ field, value: buf.subarray(c.pos, c.pos + len) });
      c.pos += len;
    } else if (wire === 5) {
      c.pos += 4;
    } else if (wire === 1) {
      c.pos += 8;
    } else {
      return out;
    }
  }
  return out;
}

function firstBytes(
  fields: ProtoField[],
  field: number
): Uint8Array | undefined {
  const hit = fields.find(
    (f) => f.field === field && f.value instanceof Uint8Array
  );
  return hit?.value as Uint8Array | undefined;
}

/**
 * Build the StartSessionRequest.
 *
 * The document is seeded empty: text is appended over the socket instead, so
 * one session shape works for every request.
 */
export function startSessionBody(): Uint8Array {
  const emptyTextField = concat(
    uint(FIELD.fieldEvent.fieldName, FIELD_NAME.source),
    bytes(FIELD.textChangeOperation.text, new Uint8Array(0))
  );
  return concat(
    uint(FIELD.startSession.sessionMode, SESSION_MODE_WRITE),
    bytes(FIELD.startSession.baseDocument, bytes(1, emptyTextField)),
    bytes(FIELD.startSession.sessionOptions, new Uint8Array(0))
  );
}

export type SessionInfo = { socketPath: string };

export function parseStartSessionResponse(buf: Uint8Array): SessionInfo {
  const path = firstBytes(
    parseMessage(buf),
    FIELD.startSessionResponse.socketPath
  );
  if (!path) {
    throw new Error("DeepL Write session response carried no socket path");
  }
  return { socketPath: textDecoder.decode(path) };
}

/**
 * SignalR MessagePack invocation: [type=1, headers, invocationId, target, args].
 * Hand-rolled because only this one message shape is ever sent, and the
 * official client pulls in a hub stack the Worker has no use for.
 */
export function signalrInvoke(
  target: string,
  payload: Uint8Array,
  invocationId: number
): Uint8Array {
  const name = textEncoder.encode(target);
  const frame = concat(
    // fixarray(5), type=1 (Invocation), fixmap(0) headers, fixstr(1) id
    Uint8Array.from([0x95, 0x01, 0x80, 0xa1, 0x30 + invocationId]),
    Uint8Array.from([0xa0 | name.length]),
    name,
    // fixarray(1) arguments, ext8 payload tagged as the hub's protobuf type
    Uint8Array.from([0x91, 0xc7, payload.length, 0x04]),
    payload
  );
  return concat(varint(frame.length), frame);
}

/** The handshake, ping and Participate frames are fixed byte-for-byte. */
export const HANDSHAKE = textEncoder.encode(
  `${JSON.stringify({ protocol: "messagepack", version: 1 })}\u001e`
);
export const PING = Uint8Array.from([0x02, 0x91, 0x06]);
export const PARTICIPATE = Uint8Array.from([
  0x15, 0x95, 0x01, 0x80, 0xa1, 0x30, 0xab, 0x50, 0x61, 0x72, 0x74, 0x69, 0x63,
  0x69, 0x70, 0x61, 0x74, 0x65, 0x91, 0xc7, 0x00, 0x03,
]);

/** Server acknowledges the handshake with a bare `{}` record. */
export function isHandshakeAck(frame: Uint8Array): boolean {
  return frame.length === 3 && frame[0] === 0x7b && frame[1] === 0x7d;
}

const participantId = bytes(FIELD.fieldEvent.participantId, uint(1, 2));

function setProperty(id: number, payload: Uint8Array): Uint8Array {
  return bytes(
    FIELD.appendMessage.events,
    concat(
      uint(FIELD.fieldEvent.fieldName, FIELD_NAME.target),
      bytes(
        FIELD.fieldEvent.setPropertyOperation,
        concat(uint(1, id), bytes(id, payload))
      ),
      participantId
    )
  );
}

/**
 * Build the AppendRequest that carries the text.
 *
 * The two SetPropertyOperations mirror what the app sends before its first
 * edit; without them the server answers `901_append_not_allowed`. `baseVersion`
 * must echo the version the server last reported or it rejects the message as
 * failing validation.
 */
export function appendRequest(text: string, lang: string, baseVersion: number) {
  const replaceWholeDocument = concat(
    uint(FIELD.textRange.start, 0),
    uint(FIELD.textRange.end, 0)
  );
  const textEvent = bytes(
    FIELD.appendMessage.events,
    concat(
      uint(FIELD.fieldEvent.fieldName, FIELD_NAME.source),
      bytes(
        FIELD.fieldEvent.textChangeOperation,
        concat(
          bytes(FIELD.textChangeOperation.range, replaceWholeDocument),
          bytes(FIELD.textChangeOperation.text, textEncoder.encode(text))
        )
      ),
      participantId
    )
  );

  const appendMessage = concat(
    setProperty(PROPERTY.documentMode, new Uint8Array(0)),
    setProperty(PROPERTY.language, bytes(1, bytes(1, textEncoder.encode(lang)))),
    textEvent,
    bytes(FIELD.appendMessage.baseVersion, bytes(1, uint(1, baseVersion)))
  );

  return bytes(FIELD.participantRequest.appendMessage, appendMessage);
}

/**
 * Pull the current document version out of a server frame.
 *
 * Both the initial capabilities frame and later confirmations carry it, nested
 * differently; scanning for the encoded shape is far shorter than modelling
 * every wrapper on the way down. The last occurrence is the freshest.
 */
export function readVersion(frame: Uint8Array): number | null {
  let found: number | null = null;
  for (let i = 0; i + 5 < frame.length; i++) {
    const isVersion =
      (frame[i] === 0x12 || frame[i] === 0x0a) &&
      frame[i + 1] === 0x04 &&
      frame[i + 2] === 0x0a &&
      frame[i + 3] === 0x02 &&
      frame[i + 4] === 0x08;
    if (isVersion) found = frame[i + 5];
  }
  return found;
}

/**
 * Strip the SignalR MessagePack envelope from a server frame.
 *
 * Frames arrive as [len][fixarray, type, headers, target, [ext payload]]. Only
 * the protobuf payload matters, and it is the frame's one ext blob, so we scan
 * for the ext marker rather than decode MessagePack properly.
 */
function extPayload(frame: Uint8Array): Uint8Array | null {
  for (let i = 0; i < frame.length; i++) {
    const marker = frame[i];
    // ext8 / ext16 / fixext8 carry the ParticipantResponse in practice.
    if (marker === 0xc7 && i + 3 <= frame.length) {
      const size = frame[i + 1];
      return frame.subarray(i + 3, i + 3 + size);
    }
    if (marker === 0xc8 && i + 4 <= frame.length) {
      const size = (frame[i + 1] << 8) | frame[i + 2];
      return frame.subarray(i + 4, i + 4 + size);
    }
    if (marker === 0xd7 && i + 2 <= frame.length) {
      return frame.subarray(i + 2, i + 2 + 8);
    }
  }
  return null;
}

/**
 * Extract the improved text from a server frame.
 *
 * The rewrite arrives as a FieldEvent on the target field carrying a
 * TextChangeOperation. Anything on the source field is the echo of the
 * caller's own text, so matching on fieldName is what keeps the two apart.
 */
export function readImprovedText(frame: Uint8Array): string | null {
  const payload = extPayload(frame);
  if (!payload) return null;

  let result: string | null = null;

  const visit = (buf: Uint8Array, depth: number) => {
    if (depth > 6) return;
    for (const { field, value } of parseMessage(buf)) {
      if (!(value instanceof Uint8Array)) continue;

      const inner = parseMessage(value);
      const isTarget = inner.some(
        (f) =>
          f.field === FIELD.fieldEvent.fieldName && f.value === FIELD_NAME.target
      );
      const change = firstBytes(inner, FIELD.fieldEvent.textChangeOperation);

      if (isTarget && change) {
        const text = firstBytes(
          parseMessage(change),
          FIELD.textChangeOperation.text
        );
        if (text?.length) result = textDecoder.decode(text);
      }

      if (!result) visit(value, depth + 1);
    }
  };

  visit(payload, 0);
  return result;
}
