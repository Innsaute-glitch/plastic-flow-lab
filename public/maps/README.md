# Replacing the placeholder map

The app ships with `placeholder-campus.svg` (1600×1000). To use the real campus:

1. **Screenshot.** In Google Maps (Satellite view), frame the campus and take a screenshot, ideally around 1600–2400 px wide. Keep the Google logo and attribution visible, or note their text.
2. **Save** it here as `campus.jpg` (or `.png`).
3. **Point the scenario at it.** In `public/demo/demo-scenario.json` (and `fixtures/scenario.demo.json`), set:
   ```json
   "map": {
     "src": "maps/campus.jpg",
     "widthPx": <image width in px>,
     "heightPx": <image height in px>,
     "metresPerPixel": <see step 4>,
     "attribution": "Imagery ©2026 Google, Map data ©2026 Google"
   }
   ```
   Width and height are in the image's file properties (or run `file public/maps/campus.jpg`).
4. **Scale.** Either:
   - use Google Maps' scale bar or "Measure distance" on two landmarks, then compute `metresPerPixel = metres / pixel distance`; or
   - open the app, choose **Calibrate**, click the two landmarks and type the distance. Then **Export** the scenario and copy the `map` block back into the file.
5. **Move the nodes.** Node `x`/`y` are in image pixels, so after changing the image, drag each node onto its real spot in the app and Export.

You can also swap the image without editing files: in the app use **Change map image**, then calibrate. This is saved when you Export the scenario.
