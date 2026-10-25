# The campus map

The app ships with the real Thapar Institute of Engineering and Technology (TIET), Patiala campus. The old drawn placeholder is no longer used.

## What is here

| File | What it is |
|---|---|
| `campus.jpg` | The map the app uses. Google satellite imagery, 2960 × 1840 px. |
| `campus-labelled.jpg` | The same view with Google's labels (building names). Same pixel grid. Use it to find buildings. |
| `campus-reference.jpg` | The same view with every node id drawn on it. Same pixel grid. Use it to check node positions. |

All three share one pixel grid, so a point `(x, y)` is the same place in each.

## How it was captured

- Google Maps satellite at zoom 17, centred near 30.354°N (Patiala), captured at 2× pixel density.
- Scale: **0.5153 m per pixel** (`map.metresPerPixel`). It matches the 100 m scale bar on the map to within 2%.
- Attribution (kept in the scenario's `map.attribution` and shown in the app): *Imagery ©2026 Airbus, Maxar Technologies · Map data ©2026 Google*.
- The sorting facility is the real MRF (material recovery facility) near the STP, in the north-west corner of campus, at 30.356775, 76.361124.
- The 40 nodes are real buildings placed on their roofs (hostels, canteens, academic blocks, library and so on). Names are in `public/demo/demo-scenario.json`.
- Note: PG-2 (Pavani Hall) sits on a plot that shows as construction in the satellite imagery.

## Replacing or re-capturing the map

The same steps apply for another campus or a newer capture:

1. **Capture.** In Google Maps (Satellite view), frame the campus and capture it, ideally 2000–3000 px wide. Keep the attribution text. If you want labels or node ids too, save them on the same pixel grid.
2. **Save** it here as `campus.jpg` (or `.png`).
3. **Point the scenarios at it.** In `public/demo/demo-scenario.json` and `public/demo/demo-scenario-after.json` (and `fixtures/scenario.demo.json` if you use it), set:
   ```json
   "map": {
     "src": "maps/campus.jpg",
     "widthPx": <image width in px>,
     "heightPx": <image height in px>,
     "metresPerPixel": <see step 4>,
     "attribution": "Imagery ©2026 Airbus, Maxar Technologies · Map data ©2026 Google"
   }
   ```
   Width and height are in the image's file properties (or run `file public/maps/campus.jpg`).
4. **Scale.** Either:
   - use the Google scale bar (for example the 100 m bar) and compute `metresPerPixel = metres / pixel length of the bar`; or
   - open the app, choose **Calibrate**, click two landmarks and type the distance. Then **Export** the scenario and copy the `map` block back into the file.
5. **Move the nodes and the facility.** Node `x`/`y` are in image pixels, so after changing the image, drag each node onto its real spot in the app and Export.
6. If the scenario changed, regenerate the cached AI answer (`node server/cli-optimise.mjs <scenario.json> <baseline-results.json>`), because demo mode refuses to replay an answer made for a different campus.

You can also swap the image without editing files: in the app use **Change image**, then calibrate. This is saved when you Export the scenario.
