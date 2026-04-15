# EDS Minification Agent Skill

Purpose: maintain readable `.src.js` and `.src.css` files for managed block assets in Git while generating the deployed block `.js` and `.css` files that Adobe Edge Delivery Services serves directly.

## Repo Rules

- Treat `.src.js` and `.src.css` files as the editable source of truth.
- Treat `.js` and `.css` files covered by `agent-manifest.json` as generated deployment artifacts.
- Never edit generated output files directly.
- Keep `agent-manifest.json` updated whenever source or output files change.
- Keep `*.src.js`, `*.src.css`, `agent-manifest.json`, and `AGENT_SKILL.md` ignored by EDS via `.hlxignore`.

## Managed Scope

This repo currently manages first-party block files in:

- `blocks/*/*.js`
- `blocks/*/*.css`

The workflow intentionally excludes upstream or third-party assets such as:

- `scripts/**`
- `styles/**`
- `scripts/aem.js`
- `scripts/lib-franklin.js`
- `scripts/dompurify.min.js`
- `styles/libs/**`
- `plugins/**`

## Commands

- `npm run minify` regenerates outputs and updates `agent-manifest.json`
- `npm run minify:check` verifies source and output files are in sync
- `npm run lint` validates readable source files

## Workflow

1. Edit the relevant `.src.js` or `.src.css` file.
2. Run `npm run minify`.
3. Review both the source file and generated output.
4. Run `npm run lint`.

## Review Rule

When explaining or auditing code, read the `.src.js` and `.src.css` files instead of the generated output files.
