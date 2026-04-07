---
name: edge-agentify
description: Use when modifying Edge Delivery Services blocks, templates, indexing, metadata, or authored content structures in this repo. Read Adobe's llms.txt and aem.live docs first, then inspect local markup and implement the smallest EDS-compatible change.
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
   - `helix-query.yaml` or metadata files when relevant
3. Inspect real content shape before coding:
   - `curl http://localhost:3000/<path>`
   - `curl http://localhost:3000/<path>.plain.html`
   - `curl http://localhost:3000/<path>.md`
4. Define the authored content contract in plain language
5. Implement the smallest change that fits that contract
6. Validate with the local dev server and query/index output when relevant

## For AI-Readable Enhancements

- Only add machine-readable JSON when it reflects visible content
- Keep JSON minimal and derived from the page, not inferred
- Prefer content clarity in the HTML itself before adding JSON helpers

## Output Expectations

- Cite which Adobe doc or pattern informed the change
- State what authored structure the block now expects
- State how the change was validated locally
