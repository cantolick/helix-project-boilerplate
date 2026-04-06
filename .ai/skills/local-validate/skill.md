# Local Validation (AEM)

Validate changes using local AEM dev server.

## Steps

1. Identify test URL:
   http://localhost:3000/<path>

2. Inspect page:
   - DOM structure
   - block output
   - injected AI data

3. Validate:
   - no JS errors
   - expected rendering
   - correct data mapping

## AI Validation

If AI data exists:
- extract `.ai-data` scripts
- verify JSON correctness
- compare with visible content

## Output

- Validation result (pass/fail)
- Issues found
- Fix suggestions