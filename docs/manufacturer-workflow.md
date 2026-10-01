# Manufacturer workflow (learned from real docs, 2026-09-21)

Source files (repo root): Bureau Veritas bulk test report 2501151 (8pp),
Burberry PRSL April 2025 (26pp), Goldenplast/HIPREN hazardous-substances
declaration (4pp, Italian). Actors: brand (Burberry) → manufacturer
(Leo Shoes S.R.L, vendor) → component supplier (Gommus) + sole supplier
(Goldenplast/HIPREN) → accredited lab (Bureau Veritas Certest, San Miniato).

## The workflow the docs reveal

1. Brand issues per-season requirements: PRSL limits + SAP material numbers
   (e.g. 8050509), colour codes (A7028 Archive Beige), style names, package codes.
2. Manufacturer sources components; suppliers attach declarations (substance
   limits + product exception lists, often in Italian).
3. Manufacturer sends samples to an accredited lab; lab tests against the
   brand's requirements and issues a PASS/FAIL bulk report with: sample
   description, claimed composition, country of origin, test table with
   methods + results, overall verdict.
4. The dossier per style/season = brand refs + supplier declarations + lab reports.

## Document types the pilot must handle (all observed)

| Type | Example | Product values? |
|---|---|---|
| Lab test report | BV 2501151 | YES — richest source (description, composition, origin, codes, verdict) |
| Supplier declaration | HIPREN/Goldenplast | YES — compliance statements, limits, exceptions |
| Brand RSL/PRSL | Burberry PRSL 2025 | NO — reference standard; extraction must return ~nothing |

## Consequences for the pilot

- Reference docs are normal input: "zero rows extracted" is a correct outcome,
  not a failure. Never force values from them (spec §6).
- Products are often COMPONENTS (a sole), not finished shoes: `upper_*` fields
  are then legitimately missing → supplier follow-ups, not invented values.
- Docs are multilingual (IT/EN): extraction must stay verbatim, never translate.
- SKU candidates compete (SAP number vs style vs lab ref): reviewer picks.
- Known over-reach patterns, now in the prompt + regression tests:
  generic Country of Origin ≠ leather_origin; RSL mentions ≠ reach_compliance.
