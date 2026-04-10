---
name: cloudflare-mcp
description: Use when you need to modify the CDN, work with custom Workers, or inspect Cloudflare-managed resources such as zones, DNS records, Workers, Pages, R2, KV, D1, routes, bindings, cache configuration, or account metadata. Prefer the Cloudflare MCP server over manual API calls or browser research when Cloudflare environment data is needed.
---

# Cloudflare MCP

Use this skill when a task depends on live Cloudflare configuration or Cloudflare-managed resources.

## MCP Prerequisite

This skill expects the Cloudflare MCP server to be configured with the server name `cloudflare-api`.

### VS Code (local process) — preferred for this project

`.vscode/mcp.json` (already configured in this repo — do not commit API tokens):

```json
{
  "servers": {
    "cloudflare-api": {
      "command": "npx",
      "args": ["-y", "@cloudflare/mcp-server-cloudflare", "run", "<account_id>"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "<api_token>"
      }
    }
  }
}
```

To start: Command Palette → **MCP: List Servers** → Start `cloudflare-api`. The MCP server must be running before starting a new chat for it to be available.

### Claude Code / Claude.ai / CI (remote HTTP)

```json
{
  "mcpServers": {
    "cloudflare-api": {
      "url": "https://mcp.cloudflare.com/mcp"
    }
  }
}
```

When connecting interactively, expect Cloudflare OAuth authorization and permission selection. For CI/CD, provide a bearer token in the `Authorization` header using a Cloudflare API token scoped to the required permissions. Prefer `/mcp` (streamable-http) over the deprecated `/sse` endpoint.

### Cross-agent compatibility

Both connection modes expose the same tool surface. This skill works in:
- **VS Code Copilot** — via local process MCP (`.vscode/mcp.json`)
- **Claude Code** — via remote HTTP MCP or local process
- **Claude.ai** — via remote HTTP MCP (OAuth)
- **Codex** — if MCP tool support is available in the session; otherwise fall back to documented Cloudflare guidance

If the MCP server is unavailable, say so clearly and fall back only to repository inspection, user-provided details, or documented Cloudflare guidance.

## Use This Skill When

- Modifying the CDN or edge behavior managed in Cloudflare
- Working with custom Workers or Worker routes
- Inspecting or updating Cloudflare zones or DNS records
- Working with Cloudflare Workers, Pages, or routes
- Checking R2, KV, D1, bindings, or environment configuration
- Investigating cache, redirects, domains, or edge delivery settings managed in Cloudflare
- Comparing repository configuration against live Cloudflare state

## Preferred Workflow

1. Confirm the task actually depends on Cloudflare-managed state
2. Use the `cloudflare-api` MCP server as the primary source for live environment data
3. Cross-check any repository configuration that references Cloudflare behavior
4. Keep changes minimal and aligned with the live configuration you verified
5. State clearly what was confirmed via MCP versus what was inferred from code

## Cloudflare API MCP Notes

Cloudflare documents the API MCP server as exposing the Cloudflare API through two high-level tools:

- `search()` for discovering relevant API capabilities
- `execute()` for running scoped Cloudflare API operations

This server is designed to stay token-efficient compared with exposing thousands of API endpoints as native MCP tools. Prefer this MCP path over ad hoc dashboard instructions or guessed API shapes.

## Guardrails

- Prefer MCP over manual REST calls, copied dashboard values, or generic web research
- Do not guess Cloudflare settings when the MCP server can verify them
- Do not claim a resource exists unless MCP or repo evidence confirms it
- Separate live Cloudflare facts from local code assumptions in your response

## Good Outputs

- "Verified via Cloudflare MCP that the zone has these routes configured"
- "The repo expects a Worker binding, but MCP did not confirm it in the target environment"
- "Unable to validate live Cloudflare state because the `cloudflare-api` MCP server was unavailable"

## Typical Tasks

- Validate that a custom domain or DNS record exists before changing code
- Confirm Worker or Pages bindings before updating deployment config
- Check whether cache behavior, redirects, or routes match the repository
- Compare local edge configuration with the live Cloudflare account state

## Related Cloudflare MCP Servers

Cloudflare also publishes product-specific MCP servers for documentation, Workers bindings, builds, observability, browser rendering, Radar, GraphQL, audit logs, DNS analytics, and other product areas. Use `cloudflare-api` when you need broad account or configuration access, and prefer product-specific servers when the task is narrowly scoped and the client has them configured.