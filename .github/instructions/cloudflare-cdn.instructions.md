---
description: Use when the task mentions modifying the CDN, custom Workers, Cloudflare Workers, edge routes, cache rules, DNS, or other Cloudflare-managed delivery settings. Prefer the cloudflare-mcp skill and the cloudflare-api MCP server before relying on repository assumptions.
---

# Cloudflare CDN Routing

- When a task is about modifying the CDN, custom Workers, Worker routes, cache behavior, DNS, redirects, domains, or other Cloudflare-managed edge settings, use the `cloudflare-mcp` skill.
- Prefer the `cloudflare-api` MCP server for live Cloudflare state instead of inferring settings from code alone.
- Treat repository configuration as local intent and Cloudflare MCP results as the source of truth for the deployed environment.
- If the MCP server is unavailable, say so clearly and separate verified repository facts from unverified Cloudflare assumptions.