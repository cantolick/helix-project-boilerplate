---
name: reference-sourcing
description: Use when an Edge Delivery Services task depends on choosing the right reference source. Prefer Adobe docs first, then use helix-mcp for EDS-aware project insights and Context7 for fresh third-party documentation only when they materially help.
---

# Reference Sourcing

Use this skill when deciding which references or tools should guide an implementation.

## Source Order

1. Adobe docs on `www.aem.live`
2. Repository instructions and local skills
3. `helix-mcp`
4. `Context7`

Do not let `helix-mcp` or `Context7` override Adobe guidance for Edge Delivery architecture.

## Use Adobe Docs First

Start here for any non-trivial Edge Delivery Services task:

- `https://www.aem.live/llms.txt`
- `https://www.aem.live/developer/ai-coding-agents`
- `https://www.aem.live/developer/markup-sections-blocks`
- `https://www.aem.live/developer/anatomy-of-a-project`
- `https://www.aem.live/developer/keeping-it-100`

## Use `helix-mcp` When

- You need EDS-specific tooling or reference support beyond static docs
- You want block inventory or implementation hints for an existing site
- You need page status, RUM-oriented inspection, or project-aware diagnostics
- The MCP server is available and can answer the question faster than manual browsing

If `helix-mcp` is unavailable, say so clearly and continue with Adobe docs plus repository inspection.

## Use `Context7` When

- You need current documentation for third-party libraries, APIs, or tools used around the EDS task
- The repo or Adobe docs do not cover the needed dependency behavior
- Fresh package or framework docs are more important than project-specific EDS guidance

Do not use `Context7` as a substitute for Adobe block, markup, or authoring guidance.

## Good Output

- State which source informed the decision
- Separate Adobe requirements from tool-assisted suggestions
- Keep the final implementation aligned with local repo conventions
