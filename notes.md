## Ticket 6.1 (2026-10-25)
Question: The ticket says arrays render as "a – b", but config/assumptions.json has arrays with 4 elements (`bins.allowedCapacitiesL` = [60, 120, 240, 660], unit "L"). Joining these with " – " reads as a range ("60 – 120 – 240 – 660 L"), which is misleading. The rule does not say how to render arrays of length other than 2.
Where: ticket 6 "Value rendering", src/assumptions/index.js (array case); config/assumptions.json `bins.allowedCapacitiesL`, `llmLimits.*` (length 2)
Options I see: (a) "a – b" for length-2 arrays only, and join other lengths with ", " (e.g. "60, 120, 240, 660"); (b) join every array with " – " exactly as written, accepting the range-like display for the 4-element list.
Answered by orchestrator: option (a). 2-element arrays render as "a – b"; any other length is joined with ", ".

## Ticket 6.2 (2026-10-25)
Question: The ticket says numbers render "as is", but CLAUDE.md says "Fractions 0–1 in data, % only in the UI". Most leaves are fractions (e.g. `contamination.segregatedCompliance` = 0.7, unit "fraction of users..."; `overflow.lossFraction` = 0.4). Should fraction-unit values display as a percentage (70%), or as the raw number (0.7) with the unit shown?
Where: ticket 6 "Value rendering" vs CLAUDE.md "Units" line; config/assumptions.json (leaves whose unit says "fraction")
Options I see: (a) show fractions as % (e.g. "70%") and keep other numbers as is; the unit label stays muted; (b) show the raw number as is (0.7), as the ticket literally says, which conflicts with CLAUDE.md.
Answered by orchestrator: option (a). Fractions show as %. Rule: if the unit contains "fraction" and the number (or each number in an object value) is 0–1, format as a percentage with at most 1 decimal and no trailing ".0" (0.7 → "70%", 0.15 → "15%", 0.025 → "2.5%"). If the unit starts with "±", prefix the value with "±" (dailyNoise → "±15%"). Everything else renders as is. The unit text stays shown, muted.

## Ticket 6.3 (2026-10-25)
Question: The ticket says `sorting.methods` renders "a mini table with one row per method", but does not name its columns. The method objects have keys label, accuracy, contaminantDetection, throughputKgPerDay, processLossFraction. Which columns should the table show, and should the column headers use the raw key names or humanised labels?
Where: ticket 6 "Value rendering"; config/assumptions.json `sorting.methods.value`
Options I see: (a) one column per non-label key (humanised headers, e.g. "Accuracy", "Contaminant detection", "Throughput kg/day", "Process loss fraction") with the method label as the row header; (b) a fixed set of columns chosen by the builder (not allowed without an answer).
Answered by orchestrator: columns in order: "Method" (the `label` field), "Accuracy" (%), "Contaminant detection" (%), "Throughput" (number + " kg/day"), "Process loss" (%). Fractional columns use the same % formatting as 6.2.
