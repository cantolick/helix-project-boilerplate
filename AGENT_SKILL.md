# EDS Block Compile and Compression Skill

Purpose: maintain readable `.src.js` and `.src.css` files for managed block assets in Git while compiling and compressing production `.js` and `.css` files that Adobe Edge Delivery Services serves directly.

## Repo Rules

- Treat `.src.js` and `.src.css` files as the editable source of truth.
- Treat `.js` and `.css` files covered by `agent-manifest.json` as compiled production artifacts.
- All repo-owned block assets should participate in the compile/compress workflow unless the user explicitly says otherwise.
- Core EDS/runtime files must remain directly editable and upgradeable; do not fold them into the block compile/compress pipeline.
- Never edit generated output files directly.
- Keep `agent-manifest.json` updated whenever source or output files change.
- Keep `*.src.js`, `*.src.css`, `agent-manifest.json`, and `AGENT_SKILL.md` ignored by EDS via `.hlxignore`.

## Managed Scope

This repo currently manages first-party block files in:

- `blocks/*/*.js`
- `blocks/*/*.css`

The workflow intentionally excludes core EDS/runtime and third-party assets such as:

- `scripts/**`
- `styles/**`
- `scripts/aem.js`
- `scripts/lib-franklin.js`
- `scripts/dompurify.min.js`
- `styles/libs/**`
- `plugins/**`

## Commands

- `npm run minify` compiles and compresses managed block outputs and updates `agent-manifest.json`
- `npm run minify:check` verifies source and compiled output files are in sync
- `npm run minify:report` reports raw, gzip, and brotli sizes for managed block outputs
- `npm run minify:budget` enforces brotli performance budgets for managed block outputs
- `npm run lint` validates readable source files

## Workflow

1. Edit the relevant `.src.js` or `.src.css` file.
2. Run `npm run minify` to compile and compress the managed block outputs.
3. Review both the source file and compiled output.
4. Run `npm run minify:check`, `npm run minify:budget`, and `npm run lint`.
5. Before commit, confirm the compiled block assets are regenerated and the performance budget check passes.

## Upgradeability Rule

- Do not move core EDS/runtime files into this workflow.
- Do not compress `scripts/` or `styles/` through the managed block pipeline.
- Keep upstream-friendly files readable so future Adobe or project upgrades stay straightforward.

## Review Rule

When explaining or auditing code, read the `.src.js` and `.src.css` files instead of the compiled output files.
