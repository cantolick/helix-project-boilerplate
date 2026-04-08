# Edge Delivery + AI Agent Rules

This project uses Adobe Edge Delivery Services.

Key principles:

## 1. Content must be dual-purpose
- Human-readable
- AI-readable

## 2. Blocks must expose structure
Every block should map to:
- entity
- intent
- actions

## 3. AI layer
Always include:
- JSON representation inside HTML
- clean semantic structure

## 4. Preview
Every feature must support:
- visual preview
- AI interpretation preview

## 5. Do NOT
- hide critical meaning in styling
- rely on visual-only cues

## 6. Block registration
- When adding a new authored block, also update `component-definition.json`, `component-models.json`, and `component-filters.json` if the block should be available in authoring
- Do not treat block work as complete until the block code and its component registration are both updated

## 7. Multi-agent Edge workflow
- For non-trivial Edge Delivery work, prefer using scoped Edge agents instead of doing planning, implementation, consumer interpretation, and review in one pass
- Use `Edge Planner` for contract and validation planning, `Edge Implementer` for implementation, `AI Agent Consumer` for AI-readable interpretation checks, and `Edge Reviewer` for final review
- Skip this only for trivial edits where orchestration overhead is not justified
