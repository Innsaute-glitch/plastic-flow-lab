# Tasks for the project team (bullet 2: collection and sorting system)

*For the two members working on the project part with me. No coding, no terminal, no GitHub needed. Everything here is done on campus, on your phone, or in a document.*

## Where the project stands

Our part of the assignment is bullet 2: **"Develop a project that focuses on setting up a plastic waste collection and sorting system."** The app for it is built and working.

- **Real Thapar map.** It's a satellite image of our campus with 40 real collection points: all 18 hostels, the canteens, academic blocks, library, lecture complex and residences. The sorting facility sits where the real MRF (Material Recovery Facility) is, near the STP.
- **Two versions of the campus.** "Thapar 2023 · before Saahas" has mixed bins. "Thapar 2024 · after Saahas" has segregated bins, which is what Thapar actually did with Saahas Zero Waste.
- **The AI part.** The app simulates 30 days of collection hour by hour, asks an AI (Claude) to propose a better setup, then re-runs the simulation to check the AI's plan. *The AI proposes, the simulation verifies.*
- **The headline result.** Starting from the 2023 campus, the AI independently suggested segregated bins at 35 of 40 points, very close to what Thapar actually did. It also removed bin overflow completely.

| 30 days | Before Saahas (2023) | After Saahas (real) | AI plan |
|---|---|---|---|
| Bins segregated | 0 of 40 | 40 of 40 | 35 of 40 |
| Overflow bin-days | 44 | 44 | **0** |
| Plastic recycled | 1,322 kg | 1,875 kg | **2,010 kg** |
| CO₂ avoided | 1.25 t | 1.77 t | **1.90 t** |
| Sent to landfill | 484 kg | **391 kg** | 494 kg |
| Money (spend − bale sales) | ₹4.5k surplus | **₹25.4k surplus** | ₹21.4k surplus |

These are simulation results. Some inputs are still estimates, which is why your field data matters.

---

## Task 1 (both of you): talk to the cleaning staff in the girls' hostels

**Why:** the amount of plastic each hostel produces is currently estimated from its number of beds. Real answers from the people who empty the bins make the project much stronger. The app can show "observed vs model" for every hostel we have real data for.

**Split:**

- **Member 1:** Hostel E and Hostel G (Vasudha), Hostel I (Ira), Hostel N (Ananta)
- **Member 2:** Hostel Q (Vahni), PG-1 (Dhriti), PG-2 (Pavani)

**What to do:** a 5-minute chat with a housekeeping or cleaning staff member at each hostel, plus a quick look at a few bins. Fill one copy of the sheet below per hostel. Approximate answers are fine ("about 2 bins per floor", "mostly full"). Photos of the bins help a lot, both for the data and for the video.

### Fill-in sheet (one per hostel)

| Question | Answer |
|---|---|
| Hostel name | |
| How many residents roughly live here now? (or "full"/"half empty") | |
| How many dustbins in the hostel (or per floor × floors)? | |
| Bin size? (look for a number on the lid/body, e.g. 120 L; or "bucket", "small", "big wheelie bin") | |
| Are bins separated (wet / dry / other colours) or one mixed bin? | |
| How often are they emptied? (twice a day / daily / every 2 days…) | |
| At what time are they emptied? | |
| How full are they just before emptying? (½, ¾, full, overflowing) | |
| Do they ever overflow? How often? Which days or times (weekends, after events)? | |
| In a dry (plastic) bin, roughly how much is food waste? In a wet bin, how much plastic? (none / a little / a lot) | |
| What plastic shows up most? (bottles, chips/biscuit packets, cups, takeaway boxes, milk packets…) | |
| Does the hostel mess have its own bins? How full? | |
| Anything unusual (no bins on some floors, staff shortage, rubbish piled outside…) | |
| Photos taken? (yes/no) | |

**Optional, if you're near a canteen** (Kravings, H canteen, G Block Canteen, Aahar, TSLAS canteen, Wrapchik): the same questions for one canteen, plus "which time of day is busiest?"

**Send back:** a photo of the filled sheets (or the answers typed in WhatsApp) plus the bin photos.

## Task 2 (both, 15 minutes): check the map

Open **campus-reference.jpg** (sent with this file). It shows every collection point with a number (n1–n40) and a list of names. You know the girls' hostels better than any satellite image. Check:

1. Are the markers for **E, G, I, N, Q, PG-1 and PG-2** on the right buildings? (List: n24 E, n25 G, n26 I, n27 N, n15 Q, n30 PG-1, n31 PG-2.)
2. **PG-2 (Pavani Hall)** is placed on what the satellite photo shows as a construction plot. Is the hostel really there?
3. Are **Aahar canteen (n35)** and **TSLAS canteen (n34)** in the right place?
4. Is any important building missing (a canteen, a big block, a hostel annexe)?

**Send back:** "all correct", or a screenshot of the map with a circle drawn on any wrong spot.

## Task 3 (optional, very valuable): a visit to the MRF

The MRF (where campus dry waste is sorted) is in the **north-west corner, near the STP**. If one of you can go, even for 10 minutes, ask the supervisor:

- How many kg of dry waste come in per day? Do they keep a weight register (there is supposed to be a weighing machine)?
- Roughly what share of that is plastic? Which plastics (bottles, packets, etc.)?
- How many people work on sorting plastic?
- How much plastic is too dirty to recycle? Where does that go?
- How often is waste collected from hostels and blocks, and with what vehicle?
- Who buys the sorted plastic, and roughly at what price per kg? (Only if they're comfortable sharing.)

A photo or a 10-second video of the facility would be great footage for our video.

## Task 4 (Member 2 leads, both help): script for our video segment

Our part of the video is the app. Three speakers, about 4–5 minutes in total. I'll do the screen recording of the app; you two write and rehearse the lines.

**Suggested structure:**

1. **Speaker 1: the problem (about 1 min).** Plastic waste on a campus: where it comes from, what goes wrong (mixed bins, overflow, litter). Thapar before Saahas: a 2023 audit found mixed, unlabelled bins, and most waste had no value and went to landfill. Then: "We built a tool to design a better collection and sorting system, and tested it on our own campus."
2. **Speaker 2: the demo (about 2 min, over my screen recording).**
   - The map: 40 real collection points and the MRF.
   - Press **Run**: trucks collect, bins fill and overflow (red), plastic gets sorted into bales.
   - Press **Optimise**: the AI reads the data and suggests changes (bin types, sizes, how often to collect, sorting method). You can watch it think, live.
   - The **compare** screen: before vs after, plus the ⓘ box listing the gains (money from selling bales, plastic recycled, CO₂ avoided).
3. **Speaker 3: the result and honesty (about 1.5 min).**
   - The AI, starting from the 2023 campus, suggested nearly what Thapar actually did with Saahas: segregated bins almost everywhere.
   - Use the table at the top of this document.
   - Where the AI did better (no overflow, more plastic recycled) and where Saahas did better (bigger surplus, less landfill).
   - Limitations: some numbers are estimates (bale prices, collection times). Our field data replaces them.
   - Close with the key idea: *"The AI proposes, the simulation verifies. We never take the AI's word for it."*

**Tips:** keep sentences short. Say numbers simply ("from 44 overflow days to zero"). Rehearse once with the recording playing. The Team Guide (sent with this file) has a **Q&A section** at the end with likely questions and answers. Read it before the video and the viva.

## Task 5 (Member 1, small): double-check three sources

Our numbers cite Thapar's own documents. Pick any three of these and check the number really is on that page in the PDFs (I'll share the PDFs if you want them):

- "90% segregation at source", case study p18
- "MRF handles about 1.5–1.75 tonnes of dry waste per day", case study p16
- "21 waste workers employed by TIET", case study p17
- "Reject waste goes to an authorised vendor for co-processing", case study p16

**Send back:** "checked, all correct", or which one looks wrong.

---

## Timeline and how to send things

- Send everything in the WhatsApp group, or to me directly: photos of the filled sheets, bin photos, map corrections and the script draft.
- Approximate data is completely fine. A partial answer is far better than none.
- When your data comes in, I'll add it to the app and re-run it, so the numbers in the video and the PPT stay consistent. The PPT group will get the final numbers from me.
