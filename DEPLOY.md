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
| `src/index.ts` | Two call sites: `handleTranslation` and `/debug` |
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

Expected status codes: `401` no key, `403` wrong key, `503` server has no keys
configured, `200` with `data`.

## Clients

- The `deeplx` MCP server reads `DEEPLX_URL` and `DEEPLX_KEY`.
- wanderbar's `scripts/review-translations.mjs` defaults to this endpoint and
  takes the key from `DEEPLX_KEY`.

## Caveats

Upstream's own disclaimer applies: it drives DeepL's free web endpoint rather
than the paid API, so **confirm DeepL's terms before any commercial use**, and
do not send confidential text through it. There is no availability guarantee.
