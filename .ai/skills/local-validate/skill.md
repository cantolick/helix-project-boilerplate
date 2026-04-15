---
name: local-validate
description: Use after Edge Delivery Services changes to validate real local output through localhost, AEM CLI preview features, query-index responses, DOM inspection, and authored-content shape instead of relying on code inspection alone.
---

# Local Validate

Use this skill after block, rendering, metadata, or indexing changes.

This skill validates rendered output locally. It can be complemented by `helix-mcp` for page-status or RUM context, but live MCP data does not replace local DOM inspection.

## AEM CLI Capabilities

Assume the Adobe AEM CLI is the primary local validation tool.

- `aem up` or `npx -y @adobe/aem-cli up` runs the local Edge preview server
- `--forward-browser-logs` is preferred when debugging client-side decoration or console errors
- `--print-index` is preferred when validating query-index and metadata behavior
- `--url` can target a specific content origin when the default origin is not the one under test
- `--html-folder` is a fallback for local HTML preview only when no authored page exists or authoring access is unavailable
- `--open` and `--no-open` control browser launching
- `--port` and `--stop-other` help manage local server conflicts
- `--cookies` and `--allow-insecure` are available for authenticated or special proxy setups

Use `aem import` only for importer workflows, not for normal block validation.

## Required Checks

1. Identify the test path
2. Load the real local page:
   - `http://localhost:3000/<path>`
   - Prefer an existing authored page served through the normal AEM CLI proxy
3. Inspect source variants when relevant:
   - `curl http://localhost:3000/<path>`
   - `curl http://localhost:3000/<path>.plain.html`
   - `curl http://localhost:3000/<path>.md`
   - `curl http://localhost:3000/query-index.json`
4. Inspect rendered output with `agent-browser` or Playwright when available:
   - verify final DOM structure after decoration
   - verify browser console output
   - verify user-visible rendering and interactions when relevant
5. Verify:
   - expected markup shape
   - expected block classes and transformed DOM
   - expected metadata or index fields
   - no console errors
6. If AI-readable JSON exists, verify:
   - `.ai-data` script exists
   - JSON is valid
   - fields match visible content exactly

## Debugging Order

1. Confirm the source content contains the expected inputs
   - If localhost is unavailable, confirm the correct AEM CLI command and options were used
2. Confirm the delivered HTML matches the assumed authored structure
3. Confirm decoration code ran
4. Confirm transformed DOM matches expectations
5. Confirm query/index output matches the page metadata

## Recommended CLI Patterns

- General validation: `npx -y @adobe/aem-cli up --no-open --forward-browser-logs`
- Metadata or feed debugging: `npx -y @adobe/aem-cli up --no-open --forward-browser-logs --print-index`
- Local fallback preview only: `npx -y @adobe/aem-cli up --no-open --forward-browser-logs --html-folder drafts`

Do not recommend `--html-folder` unless no suitable authored page exists for validation.

## Failure Rule

Do not claim success until the local output or query response was inspected. Prefer `agent-browser` or Playwright when available for rendered validation. If localhost or browser automation is unavailable, say so plainly and describe what could not be verified.
