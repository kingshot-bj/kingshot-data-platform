# Hero Gear Asset Collection

## Purpose
Developer-side collection of publicly referenced Kingshot Hero Gear images before EagleEye integration.

## Target matrix
3 troop types x 4 slots x 6 quality states = 72 working collection cells.
Troops: Infantry / Cavalry / Archer.
Slots: Helmet / Gloves / Chest / Boots.
Quality: Gray / Green / Blue / Purple / Gold / Red.

## Sources
- Kingshot Guide Hero Gear Data Center
- Kingshot Guide Hero Gear visual reference
- Kingshot Packs Hero Gear Enhancement Calculator

These are third-party community sources. Image usage rights must be checked before shipping their assets.

## Usage
node scripts/collect-hero-gear-assets.mjs
node scripts/collect-hero-gear-assets.mjs --metadata-only
node scripts/collect-hero-gear-assets.mjs --source guide
node scripts/collect-hero-gear-assets.mjs --source packs
node scripts/collect-hero-gear-assets.mjs --out /tmp/hero-gear-assets

Output: artifacts/hero-gear-assets/images/, manifest.json, summary.json.

## Safety
Do not run this from the Worker runtime or production cron. It must not consume D1, R2, MightPulse quota, or production Worker resources.
Candidate mappings are not production-verified. Red/Champion gear requires separate verification.