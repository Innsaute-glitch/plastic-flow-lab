# Getting started (no terminal needed)

This guide gets Plastic Flow Lab running on your own computer in about 10 minutes, then shows you how to check it works. You don't need to know programming or use a terminal.

**What you need:** a Windows PC or a Mac, an internet connection for the first setup, and about 500 MB of free space.

---

## Step 1: Install Node.js (one time only)

Node.js is the free program that runs the app.

1. Go to **https://nodejs.org**.
2. Click the big button that says **LTS** (it means "long-term support", the stable version).
3. Open the file you downloaded and click **Next / Continue** through the installer, keeping all the default options.
4. When it says it's finished, you're done. You don't need to open Node.js yourself.

## Step 2: Get the project folder

**From GitHub:**
1. Open the project's GitHub page.
2. Click the green **Code** button, then **Download ZIP**.
3. Find the ZIP in your Downloads folder and unzip it:
   - **Windows:** right-click the ZIP → **Extract All…** → **Extract**.
   - **Mac:** double-click the ZIP.
4. You now have a folder called something like `plastic_project`. Open it.

**From a USB stick or shared drive:** copy the whole `plastic_project` folder onto your computer (for example onto the Desktop) and open it.

## Step 3: Start the app

### On Windows

1. In the project folder, double-click **`start-windows.bat`**.
2. If a blue box says **"Windows protected your PC"**, click **More info**, then **Run anyway**. This appears because the file isn't from a registered publisher; it only starts the app.
3. A black window opens. **The first time only**, it installs the app's parts, which takes 1-2 minutes. Wait until it says it is listening.
4. Your web browser opens the app automatically. If it doesn't, open your browser and go to **http://localhost:8787**.
5. If Windows asks whether to allow **Node.js** on networks, click **Allow** (choose "Private networks"). This is only needed to open the app from a phone (Step 5).

### On a Mac

1. In the project folder, **right-click** (or Control-click) **`start-mac.command`** and choose **Open**.
2. If macOS says it **"cannot be opened because it is from an unidentified developer"**, click **Open** in that same box. Right-clicking is what makes this option appear; double-clicking the first time doesn't show it.
   - Still blocked? Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to `start-mac.command`.
3. A Terminal window opens. **The first time only**, it installs the app's parts, which takes 1-2 minutes.
4. Your browser opens the app automatically. If it doesn't, go to **http://localhost:8787**.

After the first time, you can just double-click the start file.

**Keep the black (Windows) or Terminal (Mac) window open while you use the app.** Closing it stops the app.

---

## Step 4: Check that it works (5 minutes)

Do these in order and tick them off. Each step says what you should see.

1. **Load the demo.** Click **Load demo** in the top bar.
   ✅ 10 coloured markers (canteen, hostels, library...) and a green square (the sorting facility) appear on the map.
2. **Turn on Demo mode.** Click the **Demo** switch in the top bar so it turns green.
   ✅ Nothing visible changes yet. This makes the AI step work without the internet.
3. **Run the baseline.** Click **Run** (left panel).
   ✅ Coloured dots flow into the bins, the bin meters fill and turn red, and a truck route draws itself. The day counter at the bottom-left counts to 30. It takes about 30 seconds (use **4×** to speed it up).
4. **Read the results** in the right column.
   ✅ "Overflow bin-days" shows **152**. Recovery rate shows **18.7%**. Total cost shows **₹28,973**.
5. **Optimise.** Click **Optimise** (left panel).
   ✅ An "AI optimiser" card appears, the AI's answer streams in like typing, and it is labelled **Cached (demo)**.
6. **Before → after.** After a few seconds the right column changes.
   ✅ The big number reads **152 → 0**. Recovery shows **18.7 → 41.1 %**. Cost shows **₹28,973 → ₹34,738** with **"Within budget +20%"**. Further down: **"better in 5/5 seeds"**.
7. **Open the Assumptions panel** (top bar).
   ✅ A list of 32 values appears, many with an amber "estimate" tag. Close it with the **×**.

If all seven checks match, the app is working exactly as it should.

**Try the live AI (optional).** Turn **Demo** off, then press **Run** and **Optimise** again. This asks the real AI and takes about 30-40 seconds. It only works on a computer where Claude Code is installed and signed in. Anywhere else the app shows **"Heuristic fallback"** (a simple built-in plan) instead. That's expected, not an error.

---

## Step 5: Open it on a phone or tablet (Android or iPhone/iPad)

The app can't run on a phone by itself, but a phone can **view** the app while it runs on your laptop. You don't need to install anything on the phone.

1. Start the app on your laptop (Step 3) and leave it running.
2. Connect the phone and the laptop to the **same Wi-Fi network**.
3. Find the laptop's address. The start window prints it:
   - **Mac:** a line like `On a phone or tablet on the same Wi-Fi, open: http://192.168.1.23:8787`.
   - **Windows:** a line like `IPv4 Address . . . : 192.168.1.23`. Your address is that number with `:8787` on the end, e.g. `http://192.168.1.23:8787`.
4. On the phone, open Chrome (Android) or Safari (iPhone/iPad) and type that address, including `http://` and `:8787`.

Tips:
- The app is designed for a laptop or projector screen. On a phone, turn it **sideways (landscape)**; a **tablet** works best.
- If the page doesn't load:
  - Check both devices are on the same Wi-Fi. Guest networks and college Wi-Fi often block devices from seeing each other; a phone hotspot that the laptop joins usually works.
  - On Windows, make sure you clicked **Allow** for Node.js in Step 3. If you missed it: **Start → "Allow an app through Windows Firewall" → Change settings → tick Node.js (Private)**.

---

## Stopping and restarting

- **Stop:** close the black or Terminal window.
- **Start again:** double-click the start file again. It's quicker after the first time.
- **Reset to the demo:** click **Load demo**.

## Common problems

| What you see | What to do |
|---|---|
| "Node.js is not installed" | Do Step 1, then restart the computer and try again. |
| The window closes immediately (Windows) | Right-click `start-windows.bat` → **Run as administrator** once, or check that Step 1 finished. |
| "Install failed" | You need internet the first time. Connect and try again. |
| Browser shows "This site can't be reached" | Wait 10 more seconds and refresh; the first start is slower. Make sure the start window is still open. |
| Port already in use | The app is already running in another window. Use that one, or close it and start again. |
| Optimise says "Heuristic fallback" | Turn **Demo** on, or this computer doesn't have Claude Code signed in (only needed for the live AI). |
| Demo mode says "the scenario was edited" | Click **Load demo** again, then **Run** and **Optimise**. |

## Want to know how it all works?

Read **[docs/TEAM-GUIDE.md](docs/TEAM-GUIDE.md)**. It explains every part of the app and includes likely viva questions with answers.
