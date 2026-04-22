# ESI Block With Cloudflare Worker

This repository includes an `esi` block for authoring an external HTML embed in Edge Delivery Services. The substitution happens **server-side** inside the Cloudflare Worker before the page reaches the browser.

## Authoring Contract

Use a block with these rows:

| ESI |
| --- |
| Embed Path | `https://example.com/path/to/main.html` |
| Selector | `.hero-banner` |
| Fallback Message | `Embedded content is unavailable right now.` |

Notes:

- `Embed Path` is required. It may be an absolute URL or a path-only value (e.g. `/content/fragment`). The source hostname must be in `ALLOWED_EMBED_HOSTS`.
- `Selector` is optional. Use it to extract a specific element from the upstream document rather than the full body.
- `Fallback Message` is optional. Shown if the fragment fetch fails or times out.

## How It Works

### On `www` (Cloudflare Worker)

1. The Worker scans the EDS-rendered HTML for `.esi` blocks.
2. For each block it records the embed path and selector.
3. It wraps each successful fragment in an `eds-embed` web component and replaces the block before the response is sent.
4. The browser never receives the `.esi` block markup — it sees the substituted content directly.

The `eds-embed` component moves the fragment into Shadow DOM so embed CSS (e.g. `* { margin: 0 }`) does not leak into the host page.

Fragment sources must be listed in `ALLOWED_EMBED_HOSTS`. Requests to unlisted hosts are rejected with a 403.

### On `aem.page` / Local Dev (Client-Side Fallback)

The `esi` block JavaScript runs client-side on preview environments that bypass the Worker. In this case the block removes itself so the page renders cleanly. Full server-side substitution only runs through the Cloudflare Worker route.

## Why Not Literal `<esi:include>`

If an EDS block inserts `<esi:include>` tags in browser JavaScript, Cloudflare never sees them — the response has already been delivered. This implementation moves the substitution into the Worker so it happens at the edge, before the browser.

## Worker Source and Deployment

ESI is one of several responsibilities handled by the full-page Worker:

- [tools/cloudflare/aem-worker.js](../tools/cloudflare/aem-worker.js) — CDN proxy, llms.txt, blogfeed injection, ESI substitution

Deploy command:

```bash
printf 'y\n' | CLOUDFLARE_API_TOKEN="<token>" npx wrangler deploy \
  tools/cloudflare/aem-worker.js \
  --name aem-worker \
  --compatibility-date 2024-01-01 \
  --var ALLOWED_EMBED_HOSTS:<embed-source-hostname>
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ALLOWED_EMBED_HOSTS` | Yes | — | Comma-separated allowlist of ESI embed source hostnames |
| `ORIGIN_HOSTNAME` | No | `main--helix-project-boilerplate--cantolick.aem.live` | EDS origin to proxy |
| `SITE_HOSTNAME` | No | Host header of incoming request | Public hostname used for llms.txt base URLs and blog feed forwarding |
| `ORIGIN_AUTHENTICATION` | No | — | Bearer token for origin auth |
| `PUSH_INVALIDATION` | No | enabled | Set to `disabled` to suppress `x-push-invalidation` header |
| `ESI_TIMEOUT_MS` | No | `5000` | Per-fragment fetch timeout in milliseconds |

`SITE_HOSTNAME` does not need to be set if the Worker is only deployed to one domain — it defaults to the incoming request's Host header automatically.

## Local Validation

Local draft validation files:

- [drafts/esi-demo.html](../drafts/esi-demo.html)
- [drafts/esi-source.html](../drafts/esi-source.html)

Run:

```bash
aem up --no-open --forward-browser-logs --html-folder drafts
```

Then open:

- `http://localhost:3000/drafts/esi-demo`

Note: server-side substitution does not run locally. The `esi` block will remove itself. Use the deployed `aem.page` or `www` hostname to validate full substitution.
