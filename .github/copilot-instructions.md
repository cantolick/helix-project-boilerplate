# Copilot Instructions for This Project

This repository is an Adobe AEM Live / Edge Delivery Services project based on the Helix boilerplate. Prefer the existing Franklin patterns in this repo over introducing new abstractions.

## Project Model

- Keep the project buildless. Do not add bundlers, transpilers, CSS preprocessors, UI frameworks, or client-side app frameworks unless explicitly requested and justified.
- Assume code runs directly in the browser as ES modules.
- Keep changes small, local, and easy to review.
- Preserve the existing three-phase loading model in `scripts/scripts.js`: eager, lazy, delayed.

## File Structure

- Global entry points live in `scripts/scripts.js`, `scripts/aem.js`, `styles/styles.css`, and `styles/lazy-styles.css`.
- Most feature work belongs in `blocks/<block-name>/<block-name>.js` and `blocks/<block-name>/<block-name>.css`.
- Block JavaScript should export a default `decorate(block)` function.
- Block CSS should be scoped to the block and avoid leaking styles outside the block.
- Reuse helpers from `scripts/aem.js` when possible instead of duplicating utility logic.

## AEM Live / Franklin Conventions

- Treat authored HTML as the source of truth. Prefer enhancing server-rendered markup instead of client-rendering primary page content.
- Use content-first patterns. End-user strings should be authorable when practical rather than hard-coded in JavaScript.
- Keep new block behavior backward compatible with existing authored content whenever possible.
- Use section metadata and block config patterns already present in the repo before introducing new configuration schemes.
- Avoid changes to `head.html` unless there is a clear project-level need. Do not add third-party scripts, inline scripts, or inline styles there.

## Performance Rules

- Maintain Lighthouse-first behavior, especially on mobile.
- Keep eager-path JavaScript and CSS small. Anything not required for LCP should load in lazy or delayed phases.
- Do not put third-party libraries in the global critical path. Load them only inside the block that needs them.
- For larger third-party libraries, prefer `IntersectionObserver` or another deferred activation pattern so they load only when needed.
- Prefer first-party controlled resources over extra origins when there is a choice.
- Avoid unnecessary preconnects, extra redirects, or head-level resource injections.

## JavaScript Guidance

- Prefer platform APIs and simple DOM code over libraries.
- Use modern browser features that are safe for evergreen browsers, but avoid features that would break parsing in unsupported browsers without good reason.
- Avoid inline event handlers in generated markup; use `addEventListener`.
- Avoid `innerHTML` when data can come from authors or external JSON. Prefer DOM APIs and `textContent` unless the markup is fully trusted.
- Keep block logic instance-safe. Do not rely on mutable module-level state when multiple copies of a block could appear on the page.
- Do not modify `scripts/aem.js` unless the change is broadly reusable and truly belongs in the shared library.

## CSS Guidance

- Write mobile-first CSS. Prefer `min-width` breakpoints, typically `600px`, `900px`, and `1200px`.
- Keep selectors readable and block-isolated.
- Avoid `!important` unless there is a specific, justified need.
- Do not reformat unrelated CSS while making a functional change.
- Prefer ARIA/state attributes for styling when they already express the state clearly.

## Authoring and Content

- Optimize for authoring simplicity. If a block needs unusual content structure, document the structure or reconsider the implementation.
- For new block ideas or content structure changes, prefer draft-friendly and backward-compatible patterns.
- Static assets that are part of authoring should generally come from content sources rather than being committed into the repo, unless code references require them.

## Testing and Validation

- Add or update tests in `test/blocks` or `test/scripts` when behavior changes.
- Keep lint clean. Use the project lint setup rather than changing lint rules.
- When touching a block, consider performance, accessibility, and authoring impact together.
- If a change could affect Lighthouse or Core Web Vitals, call that out explicitly.

## Pull Request Expectations

- Keep PRs narrow in scope.
- Include a preview URL for the page or block being changed when summarizing work.
- If updating an existing block, identify a page where reviewers can see it in use.

## Preferred Change Style

- Match the repository’s current style and naming.
- Favor incremental improvements over rewrites.
- Do not introduce new dependencies to solve simple DOM, styling, or data-loading problems.
- Default to semantic HTML, accessible controls, and resilient progressive enhancement.