# KingShot terminology audit — 2026-10-11

## Scope and rule

Audit user-visible Japanese ranking labels in `src/index.js` and `src/kingdom-portal.js`. Japanese game UI terminology must be researched first; do not produce a literal translation when the Japanese in-game name can be verified. If the name cannot be verified, leave it marked for confirmation rather than inventing a translation.

## Confirmed corrections applied

The following incorrect labels in the Kingdom Portal were replaced with the established Japanese names already used by the main EagleEye ranking UI:

| Board key | Removed label | Current label |
| --- | --- | --- |
| `mystic_trial` | 神秘試練 | 秘境の試練 |
| `coliseum` | コロシアム | 闘技場 |
| `crystal_cave` | クリスタル洞窟 | 水晶鉱山 |
| `knowledge_nexus` | 知識の核 | 知識の枢軸 |
| `molten_fort` | 溶融要塞 | 溶岩要塞 |
| `radiant_spire` | 輝きの尖塔 | 輝光の塔 |
| `coliseum` in `src/ranking-catalog.js` | コロシアム | 闘技場 |

`forest_of_life` is displayed as `生命の森`.

Evidence checked:
- KingShot official Japanese Help Center: https://centurygames.helpshift.com/hc/ja/ (Japanese event name `秘境の試練`; official Japanese terms checked for related game content).
- Altema KingShot Japanese guides: https://altema.jp/kingshot/ (cross-check for `闘技場`, `生命の森`, `水晶鉱山`, `知識の枢軸`, `溶岩要塞`, and `輝光の塔`).

## Code changes

- Added `src/kingdom-terminology.js` as the canonical server-side map for ranking-board labels.
- `src/index.js` imports that map instead of declaring a second server-side map.
- `src/kingdom-portal.js` imports the same map and derives its labels from the canonical source.
- `src/ranking-catalog.js` had a separate incorrect `コロシアム` label; changed it to `闘技場`.
- A source scan after the changes found zero occurrences of the six removed labels in `src/index.js` and `src/kingdom-portal.js`. A further targeted scan of 20 additional source files found no instances of those removed labels; `src/ranking-catalog.js` was separately corrected for `コロシアム`.

## Items still requiring verification — do not silently rename

These are not being changed based only on guesswork. Confirm the exact Japanese game UI wording from a screenshot or authoritative Japanese source before changing:
- `gov_charm`: current label `領主宝石` (other code/UI locations may call this `領主チャーム`).
- `pet_power`: current label `ペット総合実力` versus other UI label variants such as `ペット総力`.
- `island_prosperity`: current label `島の繁栄度` versus `島の繁栄`.
- `hero_no_equip` / `hero_equip`: current labels `英雄総力（装備除外）` / `英雄総力（装備込み）`; verify exact game UI terminology.
- `master_power`, `rebel_conquest`, and `single_hero`: labels describe the data, but exact in-game Japanese wording still needs source confirmation.

## Follow-up audit

This audit is not a claim that every user-visible string in the entire repository has been verified. Continue searching all pages, API/export labels, aliases, and embedded browser-side maps for duplicate or unverified game terminology. Keep API board keys and stored data identifiers unchanged; this audit concerns display text only. Do not change database queries, rankings logic, or D1 access patterns as part of terminology cleanup.
