---
name: local-validate
description: Use after Edge Delivery Services changes to validate real local output through localhost, query-index responses, DOM inspection, and authored-content shape instead of relying on code inspection alone.
---

# Local Validate

Use this skill after block, rendering, metadata, or indexing changes.

## Required Checks

1. Identify the test path
2. Load the real local page:
   - `http://localhost:3000/<path>`
3. Inspect source variants when relevant:
   - `curl http://localhost:3000/<path>`
   - `curl http://localhost:3000/<path>.plain.html`
   - `curl http://localhost:3000/<path>.md`
   - `curl http://localhost:3000/query-index.json`
4. Verify:
   - expected markup shape
   - expected block classes and transformed DOM
   - expected metadata or index fields
   - no console errors
5. If AI-readable JSON exists, verify:
   - `.ai-data` script exists
   - JSON is valid
   - fields match visible content exactly

## Debugging Order

1. Confirm the source content contains the expected inputs
2. Confirm the delivered HTML matches the assumed authored structure
3. Confirm decoration code ran
4. Confirm transformed DOM matches expectations
5. Confirm query/index output matches the page metadata

## Failure Rule

Do not claim success until the local output or query response was inspected. If localhost is unavailable, say so plainly and describe what could not be verified.
