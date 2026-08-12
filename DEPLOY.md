# translate.jonas-strassel.de

A fork of [xixu-me/deeplx](https://github.com/xixu-me/deeplx) with an API key,
deployed as a Cloudflare Worker.

## Why a fork

Upstream ships **no authentication** — its README advertises "no API keys" as a
feature. That is fine for a throwaway instance and wrong for one on a domain we
own: an open translation proxy is someone else's free API, and their volume is
what gets the backing IP rate-limited. Which is the exact failure this replaced,
after the shared keyless instance returned `429 your IP has been blocked by
DeepL` for over an hour.

Running it on Workers also moves the egress off a home IP and onto Cloudflare's,
so a burst of translation work no longer costs us the whole address.

## Local changes

Deliberately small, so upstream can be merged without re-reading everything:

| File | Change |
|---|---|
| `src/lib/apiKey.ts` | **New.** Bearer / `X-API-Key` gate, constant-time compare, fails closed |
| `src/lib/services/deeplWrite.ts` | **New.** DeepL Write (`/rephrase`) over the free session backend |
| `src/lib/services/deeplWriteProtocol.ts` | **New.** Protobuf + SignalR wire format for the above |
| `src/index.ts` | Three call sites: `handleTranslation`, `handleRephrase` and `/debug` |
| `worker-configuration.d.ts` | `API_KEYS` binding |
| `wrangler.jsonc` | Our account, our KV namespaces, our custom domain, no `PROXY_URLS` |

`PROXY_URLS` is left **unset** on purpose. Upstream defaults it to ten
third-party `*.dpdns.org` relays; unset, the Worker talks to DeepL directly, so
translated text is not routed through someone else's infrastructure.

The key check lives in `handleTranslation` rather than on each route, so a
provider endpoint added upstream later is gated automatically instead of
silently shipping open.

## Deploy

```sh
npm install
npx wrangler secret put API_KEYS   # comma-separated; several so one client can be revoked
npx wrangler deploy
```

`API_KEYS` unset means the Worker answers `503` to everything. A missing secret
is a deploy mistake, and the safe reading of a deploy mistake is "not open for
business".

## Use

```sh
curl -X POST https://translate.jonas-strassel.de/translate \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $DEEPLX_KEY" \
  -d '{"text":"Deep snow","source_lang":"EN","target_lang":"DE"}'
```

`POST /translate` and `/deepl` use DeepL, `/google` uses Google Translate.
Responses are `{ code, data, id, source_lang, target_lang }`.

## Rephrase

`POST /rephrase` improves text instead of translating it (DeepL Write).

```sh
curl -X POST https://translate.jonas-strassel.de/rephrase \
  -H 'content-type: application/json' \
  -H "Authorization: Bearer $DEEPLX_KEY" \
  -d '{"text":"she dont like the way he write emails","target_lang":"en-GB"}'
```

```json
{"code":200,"data":"She doesn't like the way he writes emails.","source_lang":"AUTO","target_lang":"EN-GB"}
```

| Field | |
|---|---|
| `text` | required |
| `target_lang` | optional, defaults to `en-GB`. Only `de en-GB en-US es fr it ja ko pt-BR pt-PT zh-Hans` |

### How it works, and why that matters

There is a documented `api.deepl.com/v2/write/rephrase`, but it is **Pro-only**
and needs an API key. This endpoint does not use it. It uses the same free
backend as deepl.com/write, which is a different protocol entirely:

1. `POST https://ita-free.www.deepl.com/v2/startSession` with a protobuf body
   (`SESSION_MODE_WRITE`), which returns a session id and a WebSocket path.
2. Upgrade to that socket and complete a SignalR handshake declaring the
   **MessagePack** hub protocol.
3. Send an `AppendRequest` carrying the text plus two `SetPropertyOperation`s
   and a `baseVersion` echoed from the server's own frames.
4. Read the rewrite off the `FieldEvent` for the **target** field.

**None of this is a published contract.** It was reverse-engineered by
capturing the real web app, and DeepL can break it in any deploy. Three details
are load-bearing and fail in confusing ways if they drift:

- Omit the `SetPropertyOperation`s and the server answers `901_append_not_allowed`.
- Send a stale `baseVersion` and it rejects the message as `Message validation failed`.
- Read text off the source field instead of the target and you get the caller's
  own input echoed straight back, which looks like a working rephrase that
  never changes anything.

`tests/lib/services/deeplWriteProtocol.test.ts` pins the byte layouts so a
drift shows up as a failing test rather than a silent wrong answer. If the
endpoint starts timing out or returning input unchanged, re-capture the app's
traffic and compare frames — that is the intended debugging path.

No API key, no quota, and no credential to leak; the tradeoff is that this is
fragile by construction.
