# EagleEye Handoff — Player Profile Hero Troop UI
Date: 2026-10-16
Repository: `kingshot-bj/kingshot-data-platform`
Branch: `main`

## Current state
- The Player Profile page UI was reviewed from a mobile screenshot.
- The user approved two improvements:
  1. Make each hero's troop type immediately recognizable: Infantry (歩兵), Cavalry (騎兵), or Archer (弓兵).
  2. Consolidate the two profile data actions into one clear action: 「最新情報を取得」.
- The user has confirmed the button label 「最新情報を取得」 is already visible in production.
- **Hero troop-type display is not implemented yet.** This is the next task in the new thread.
- No troop-type implementation should be claimed complete until code is changed, checks pass, and the deployed page is verified.

## Approved hero UI
- Show a readable troop-type label next to each hero's name (e.g. 「歩兵」「騎兵」「弓兵」).
- Also show a small troop-type icon/mark on the hero portrait if it can be done without clutter.
- Use both text and icon; do not rely on color alone.
- Preserve the existing hero cards, star display, equipment, skills, levels, and mobile layout.
- Do not infer troop type from a hero's appearance. First identify a trustworthy API field or persisted data field and map it to the three troop types. If data is absent or ambiguous, show a neutral unknown state rather than guessing.

## Data action button context
- Production currently shows 「最新情報を取得」 instead of the old two separate labels; the user confirmed this.
- The previous conceptual intent was to consolidate 「基本情報を更新」 and 「詳細情報を取得」 into one user-facing action.
- Before changing its behavior further, inspect the actual current handler and downstream API paths, including API Pool use, authorization, refresh/force semantics, data persistence, and partial-failure behavior.
- Do not regress the current working button or make it issue unnecessary API calls. If behavior is already correctly unified, leave it alone.

## Next steps
1. Inspect current `main` and identify the player profile page/template and hero rendering code.
2. Trace API response and database fields for troop type; verify the canonical mapping for Infantry/Cavalry/Archer.
3. Implement the compact troop badge and portrait mark, preserving the existing mobile layout.
4. Add/update focused tests for correct mapping and missing/unknown troop data.
5. Run relevant checks and inspect any existing failing tests separately; do not attribute unrelated failures to this UI change without evidence.
6. Merge/deploy following the repository's normal workflow, then confirm the live page.
7. Report progress in 10% increments if asked for progress, consistent with the user's preference.

## User preferences / constraints
- Keep UI compact; do not add information just for the sake of adding it.
- User wants implementation grounded in real API/data, not visual guesses.
- Do not ask the user to validate via Preview; deploy to the actual production environment and verify where possible.
- Be explicit about the difference between code committed, build passed, deployment completed, and live behavior verified.
