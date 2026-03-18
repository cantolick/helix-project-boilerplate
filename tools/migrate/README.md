# EDS → AEM Content Fragment Migration

Migrates blog posts from the live EDS site (Google Drive source) into AEM Content Fragments.

## Prerequisites

- Node.js 18+
- AEM Cloud Service author access to `author-p110511-e1076828.adobeaemcloud.com`
- A **local development token** from the AEM Developer Console
- The **Blog Post Content Fragment Model** created in AEM (see Step 1 below)

---

## Step 1 — Create the Content Fragment Model in AEM

Before running the script, create the model manually in AEM Author:

1. Go to **Tools → Assets → Content Fragment Models**
2. Select your configuration (create one at `/conf/helix-project-boilerplate` if needed)
3. Create a new model called **Blog Post** with these fields:

| Field name   | Type           | Notes                        |
|--------------|----------------|------------------------------|
| `title`      | Single-line text | Required                   |
| `date`       | Single-line text | e.g. "August 2025"          |
| `description`| Multi-line text  |                              |
| `category`   | Single-line text |                              |
| `tags`       | Tags / text[]    | Multi-value                  |
| `body`       | Multi-line text  | Rich text / HTML             |
| `image`      | Single-line text | URL to the image             |
| `sourcePath` | Single-line text | Original EDS path (for ref) |

4. Note the model path — it will look like:
   `/conf/helix-project-boilerplate/settings/dam/cfm/models/blog-post`

5. Update `CF_MODEL_PATH` in `migrate.js` if your path differs.

---

## Step 2 — Get an AEM Local Development Token

1. Open [AEM Developer Console](https://developer.adobe.com/console)
   — or navigate to: `https://author-p110511-e1076828.adobeaemcloud.com/libs/granite/security/content/useradmin.html`
2. Go to **Integrations → Local development token**
3. Click **Get Local Development Token**
4. Copy the `accessToken` value

> Tokens expire after 24 hours. Re-generate if you get 401 errors.

---

## Step 3 — Install Dependencies

```bash
cd tools/migrate
npm install
```

---

## Step 4 — Dry Run (Recommended First)

Preview what will be migrated without writing anything to AEM:

```bash
node migrate.js --dry-run
```

This will print all 10 posts with their parsed fields so you can verify the data looks correct before committing.

---

## Step 5 — Run the Migration

```bash
AEM_HOST=https://author-p110511-e1076828.adobeaemcloud.com \
AEM_TOKEN=<paste-your-token-here> \
node migrate.js
```

The script will:
1. Fetch the content index from the live EDS site
2. Fetch the full HTML of each blog post
3. Parse title, date, description, category, tags, body, and featured image
4. Create a Content Fragment in AEM at `/content/dam/helix-project-boilerplate/blog/<slug>`
5. Skip any posts that already exist (safe to re-run)
6. Print a summary of created / skipped / failed

---

## Content Fragment Location in AEM

After migration, your fragments will be at:

```
/content/dam/helix-project-boilerplate/blog/
  ├── spreadsheet-as-a-service
  ├── top-3-things-i-learned-when-implementing-edge-delivery
  ├── top-3-things-i-learned-at-imagine-2019
  └── ...
```

View them in AEM Author at:
**Assets → Files → helix-project-boilerplate → blog**

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `AEM_TOKEN is required` | Missing env var | Set `AEM_TOKEN=...` |
| `401 Unauthorized` | Token expired | Get a new token from Dev Console |
| `404` on folder create | Config path wrong | Check `CF_PARENT_PATH` in migrate.js |
| `CF model not found` | Model not created yet | Complete Step 1 first |
