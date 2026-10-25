# Golden test inputs (frozen)

Frozen copies of the original 10-node demo scenario, its fake results and proposal, and the placeholder `assumptions.json` from the first build.
Unit tests with hand-computed expected numbers (sim golden tests, schema/heuristic sizing, API prompt sizing) read these, so they keep checking the maths when the live config or demo data change.
Do not regenerate or edit them. `npm run fixtures` does not touch this folder.
