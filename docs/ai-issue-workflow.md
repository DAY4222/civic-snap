# AI Issue Workflow

## Flow

`photo saved -> background visual labels + AI issue candidates -> hybrid rerank -> user-selected issue -> catalog checklist -> email draft`

Gemini only receives the resized photo, the label taxonomy, and the compact issue catalog. The app does not send address, GPS, location notes, profile fields, user-written descriptions, or email text to Gemini.

When photo analysis is enabled, the app starts it after the photo is saved and lets the user continue confirming location while suggestions load.

## Taxonomy Axes

Labels are stable slugs grouped across four axes:

- Scene/location: `roadway`, `sidewalk`, `boulevard`, `laneway`, `bike-lane`, `intersection`, `bus-stop`, `school-zone`, `city-park`, `private-property`, `residential-curb`
- Object/asset: `traffic-signal`, `traffic-sign`, `catch-basin`, `maintenance-hole-lid`, `residential-collection-bin`, `public-tree`, `water-service-box`
- Condition/material: `road-pothole`, `damaged-concrete-sidewalk`, `bin-lid-damaged`, `illegal-dumping`, `snow-covered-sidewalk`, `hanging-or-broken-branch`
- Limited context: `missed pickup` candidates use visible set-out labels but remain `possible` because a photo cannot prove schedule or timing.

User-facing chips use readable Toronto/311-style wording from `PHOTO_LABELS`; code and tests use slug IDs.

## Discoverability Rules

Each issue is generated from `data/toronto-311-target-issues.json` with one of three flags:

- `photo`: visible evidence can support the issue directly.
- `limited-context`: the photo can suggest it, but the checklist must resolve missing context.
- `not-discoverable`: hard-filtered from AI suggestions.

Rules add obvious candidates Gemini misses, remove candidates without required label support, and never pad to five weak guesses. User-intent issues such as bin exchange size, additional bin, or wrong delivery stay non-discoverable unless a future exact visual rule is added.

## Catalog Mapping Examples

- `road-pothole` -> `Road Pothole / Road Damage` -> sidewalk/road eligibility and intake questions from the Toronto 311 JSON.
- `bin-lid-damaged` -> `Residential Bin Lid Damaged` -> bin repair/refinement questions, with `Lid` offered only as a suggestion.
- `curbside-garbage` -> missed garbage pickup issues -> `possible` tier only.
- `snow-covered-bus-stop` -> `Bus Stops Snow Clearing Required` -> no checklist questions because none were captured in the source JSON.

## Refresh

Run catalog generation after intentionally refreshing and reviewing the Toronto 311 target JSON:

```sh
npm run generate:ai-catalogs
```

Live checks are opt-in and excluded from Jest/CI:

```sh
npm run live:ai-photo-check
```
