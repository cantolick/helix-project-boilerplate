# Edge Delivery + AI Agent Rules

This project uses Adobe Edge Delivery Services.

Key principles:

## 1. Content must be dual-purpose
- Human-readable
- AI-readable

## 2. Blocks must expose structure
Every block should map to:
- entity
- intent
- actions

## 3. AI layer
Always include:
- JSON representation inside HTML
- clean semantic structure

## 4. Preview
Every feature must support:
- visual preview
- AI interpretation preview

## 5. Do NOT
- hide critical meaning in styling
- rely on visual-only cues

## 6. Block registration
- When adding a new authored block, also update `component-definition.json`, `component-models.json`, and `component-filters.json` if the block should be available in authoring
- Do not treat block work as complete until the block code and its component registration are both updated

## 7. Multi-agent Edge workflow
- For non-trivial Edge Delivery work, prefer using scoped Edge agents instead of doing planning, implementation, consumer interpretation, and review in one pass
- Use `Edge Planner` for contract and validation planning, `Edge Implementer` for implementation, `AI Agent Consumer` for AI-readable interpretation checks, and `Edge Reviewer` for final review
- Skip this only for trivial edits where orchestration overhead is not justified

## 8. Cloudflare CDN and custom Workers
- 99% of this project's work is Edge Delivery; the remaining CDN and custom Worker tasks are managed in Cloudflare
- When a task involves modifying the CDN, custom Workers, Worker routes, cache rules, DNS, or other Cloudflare-managed delivery settings, load and follow the `cloudflare-mcp` skill before proceeding
- Prefer the `cloudflare-api` MCP server for live Cloudflare state over inferring settings from code or docs alone
- See `.github/instructions/cloudflare-cdn.instructions.md` for the scoped routing rule

## 9. JSON-LD and structured data — SSR vs client-side

EDS server-renders a `<script type="application/ld+json">` tag when a page has a `json-ld` metadata field. This is the **only** way to get JSON-LD into the static HTML that crawlers and LLMs (GPTBot, ClaudeBot, PerplexityBot) see without executing JavaScript.

Rules:
- **Never inject JSON-LD solely via `scripts.js`** for schemas that matter to SEO or LLM discoverability. Crawlers do not execute JS.
- For static, per-page schemas (Person, Organization, homepage identity): author the JSON-LD in the `json-ld` metadata row of the Google Doc/metadata table. EDS bakes it into `<head>` at publish time.
- For dynamic per-post schemas (BlogPosting where headline/date/author vary): client-side injection via `scripts.js` is acceptable as a **supplement**, but only after checking `document.head.querySelector('script[type="application/ld+json"]')` is absent, so authored SSR schemas always win.
- `<meta>` tags (og:title, description, date, author, etc.) **are** server-rendered by EDS from the metadata table. They satisfy basic crawler attribution. JSON-LD provides richer schema.org vocabulary that `<meta>` cannot express.
- A Cloudflare Worker can synthesize and inject JSON-LD from existing meta tags at the CDN edge if SSR via metadata is not feasible, but prefer the metadata table approach when possible.
- `rel=me` `<link>` elements for identity verification must also be SSR'd or added to `head.html` to be effective for identity crawlers.

