See `AGENTS.md`.

For managed block JS and CSS in this repo, agents should edit `.src.js` and `.src.css` files, run `npm run minify` to compile/compress production block assets, and treat the paired `.js` and `.css` files as compiled output. Before commit, agents should also run `npm run minify:check`, `npm run minify:budget`, and `npm run lint`. All repo-owned blocks should use this workflow unless the user explicitly says otherwise. Core `scripts/` and `styles/` files are edited directly and kept outside this workflow so EDS/runtime code stays upgradeable.
