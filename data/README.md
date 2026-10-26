# Field data: how to fill `nodes.csv`

Copy `nodes.template.csv` to `nodes.csv`, fill in one row per collection point (max 40), then use **Import** (upload icon in the top bar) and pick the CSV.

The template's three rows are example nodes copied from the Thapar demo (G Block Canteen, Hostel J, Nava Nalanda Library). Replace them with your own rows. Importing a CSV replaces the nodes of the current scenario; the map and facility stay.

| Column | Meaning | Allowed values |
|---|---|---|
| `name` | Short label shown on the map | text |
| `waste_type` | Dominant plastic stream | `pet_bottles`, `hdpe`, `pp`, `mixed`, `food_contaminated` |
| `rate_kg_per_day` | Plastic generated per day (kg) | number > 0 |
| `peak_start_hour`, `peak_end_hour` | Optional busy window, 24 h clock | 0–24, start < end; leave blank if none |
| `peak_multiplier` | How much busier the peak hours are than normal hours | e.g. `3`; blank if no peak |
| `bin_type` | Current bins | `single` (one mixed bin) or `segregated` |
| `bin_count` | Number of bins at this point | 1–6 |
| `bin_capacity_l` | Size of each bin (litres) | 60, 120, 240, 660 |
| `pickup_interval_days` | Days between pickups today | 1–14 |
| `x`, `y` | **Leave blank.** You'll click the spot on the map after import | (pixels, optional) |
| `observed_overflow_days` | Optional: days in a 30-day period you saw the bin overflowing | number |
| `observed_fill_pct_at_pickup` | Optional: how full it typically is when collected | 0–100+ |

The `observed_*` columns don't drive the simulation. They are shown next to the model results so the baseline can be checked against reality ("calibration").
