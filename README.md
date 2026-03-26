# Your Project's Title...
Your project's description...

## Environments
- Preview: https://main--{repo}--{owner}.aem.page/
- Live: https://main--{repo}--{owner}.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Article Metadata

This project supports richer article metadata for AI-friendly previews and social cards through standard AEM EDS page metadata.

- Author article metadata in the `page-metadata` model using `image`, `author`, `og:type`, `twitter:card`, `article:published_time`, `article:modified_time`, and `json-ld`.
- Keep dates in ISO 8601 format, for example `2026-03-26T09:00:00-05:00`.
- Prefer page-specific `image` values for article pages so previews do not fall back to the site default image.
- Use `json-ld` for `Article`, `NewsArticle`, or `Product` schema when the page needs richer machine-readable context.
- Blog pages inherit sane defaults from `metadata.json`, but page-level metadata still wins.

Example `json-ld` value for an article:

```json
{"@context":"https://schema.org","@type":"Article","headline":"AI in VS Code helped me modernize a 3-year-old EDS fork in under 2 hours","description":"In April 2023, I forked the EDS boilerplate so I could ramp up on what Edge Delivery Services actually is.","author":{"@type":"Person","name":"Craig Antolick"},"image":["https://www.craigantolick.com/path/to/article-image.jpg"],"datePublished":"2026-03-26T09:00:00-05:00","dateModified":"2026-03-26T09:00:00-05:00","mainEntityOfPage":"https://www.craigantolick.com/blog/ai-vscode-eds-migration-post"}
```

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Local development

1. Create a new repository based on the `aem-boilerplate` template
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)
