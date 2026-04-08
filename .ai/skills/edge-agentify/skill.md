---
name: edge-agentify
description: Use when modifying Edge Delivery Services blocks, templates, indexing, metadata, authored content structures, or AEM CLI-driven local preview workflows in this repo. Read Adobe's llms.txt and aem.live docs first, then inspect local markup and implement the smallest EDS-compatible change.
---

# Edge Agentify

This skill is for Adobe Edge Delivery Services work in this repository.

## Use This Skill When

- Editing block JavaScript or CSS
- Changing content structure, metadata, or indexing
- Adding AI-readable content structures
- Debugging unexpected EDS markup or authored content shape

## Source Of Truth

For EDS questions, prefer Adobe sources before coding:

1. Read `https://www.aem.live/llms.txt`
2. Search only `www.aem.live` unless the user asks otherwise
3. Prefer these docs first:
   - `https://www.aem.live/developer/tutorial`
   - `https://www.aem.live/developer/anatomy-of-a-project`
   - `https://www.aem.live/developer/markup-sections-blocks`
   - `https://www.aem.live/developer/indexing`
   - `https://www.aem.live/developer/keeping-it-100`
   - `https://www.aem.live/docs/dev-collab-and-good-practices`
   - `https://www.aem.live/developer/ai-coding-agents`
   - `https://www.aem.live/developer/cli-reference`

## AEM CLI Reference

Use the Adobe AEM CLI as the default local runtime for Edge Delivery validation in this repo.

### Core Commands

- `aem up` or `npx -y @adobe/aem-cli up` starts the local development server
- `aem import` starts the AEM importer UI server and is for import workflows, not normal block validation

### Useful `aem up` Options

- `--no-open` prevents opening a browser window automatically
- `--open /path` opens a specific local path
- `--port 3000` changes the local server port
- `--stop-other` stops another CLI process already using that port
- `--url <origin>` or `--pages-url <origin>` overrides the content origin to fetch from
- `--forward-browser-logs` sends browser console logs to the terminal during validation
- `--print-index` prints indexed records for the current page, useful for metadata and query-index debugging
- `--html-folder <folder>` serves local HTML files for fallback preview when no real authored page is available
- `--cookies` proxies cookies for authenticated previews when needed
- `--allow-insecure` allows insecure requests for local or special proxy setups
- `--log-level debug|verbose|info|warn|error` increases CLI diagnostics when the server behavior is unclear

### How To Choose The Right Preview Path

- Prefer the default proxied authored content path first: `aem up --no-open --forward-browser-logs`
- Use `--print-index` when validating metadata, indexing, or feed behavior
- Use `--html-folder` only when no suitable authored page exists or when you do not have access to the authoring system
- Do not create local HTML fallback content by default when an existing Drive-backed or SharePoint-backed page already exercises the change

### Import Command Notes

- `aem import` is for page import workflows and importer UI usage
- It supports options such as `--open`, `--no-open`, `--cache`, `--ui-repo`, `--skip-ui`, and `--headers-file`
- Do not use `aem import` for normal block development unless the task is specifically about importing or migrating content

## EDS Guardrails

- Treat this as Edge Delivery Services, not classic AEM
- Do not invent Sling, JCR, OSGi, HTL, or server-side patterns
- Inspect delivered HTML before changing block assumptions
- Keep changes small, block-scoped, and author-friendly
- Prefer semantic HTML and explicit content structure over decorative structure

## Workflow

1. Read the relevant Adobe doc pages for the task
2. Inspect the local implementation:
   - block files
   - `scripts/scripts.js`
   - `component-definition.json`, `component-models.json`, and `component-filters.json` when adding or exposing authored blocks
   - `helix-query.yaml` or metadata files when relevant
3. Inspect real content shape before coding:
   - Start or confirm the AEM CLI local server if localhost is needed for validation
   - `curl http://localhost:3000/<path>`
   - `curl http://localhost:3000/<path>.plain.html`
   - `curl http://localhost:3000/<path>.md`
   - Prefer existing authored pages that already use the real content source
   - Use `drafts/` only as a local fallback when no authored page exists for validation
4. Define the authored content contract in plain language
5. Implement the smallest change that fits that contract
   - If the task adds a new authored block, register it in `component-definition.json`, `component-models.json`, and `component-filters.json` as part of the same change
6. Validate with the local dev server and query/index output when relevant

## Multi-Agent Preference

For non-trivial EDS work, prefer splitting the task across the available Edge agents instead of keeping all reasoning in one context.

- `Edge Planner` for authored structure, DOM contract, validation plan, and file inventory
- `Edge Implementer` for code changes, block wiring, and component registration
- `AI Agent Consumer` for AI-readable clarity and JSON fidelity checks
- `Edge Reviewer` for regression review, missing validation, and risky assumptions

Use this pattern when the task spans multiple files, introduces a block, changes content structure, or requires AI-readable output. Skip it only for trivial edits.

## For AI-Readable Enhancements

- Only add machine-readable JSON when it reflects visible content
- Keep JSON minimal and derived from the page, not inferred
- Prefer content clarity in the HTML itself before adding JSON helpers

## Output Expectations

- Cite which Adobe doc or pattern informed the change
- State which AEM CLI mode or options were used for validation when relevant
- State what authored structure the block now expects
- State how the change was validated locally
