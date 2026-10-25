#!/bin/bash
# Double-click to start Plastic Flow Lab on a Mac.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js is not installed."
  echo "  Install the \"LTS\" version from https://nodejs.org , then double-click this file again."
  echo ""
  open "https://nodejs.org"
  read -r -p "Press Enter to close..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  First run: installing the app's parts. This takes a minute or two..."
  if ! npm install; then
    echo "  Install failed. Check your internet connection and try again."
    read -r -p "Press Enter to close..."
    exit 1
  fi
fi

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
echo ""
echo "  Starting Plastic Flow Lab..."
echo "  Your browser will open at http://localhost:8787"
[ -n "$IP" ] && echo "  On a phone or tablet on the same Wi-Fi, open: http://$IP:8787"
echo ""
echo "  Keep this window open while you use the app. Close it to stop the app."
echo ""

(sleep 8; open "http://localhost:8787") &
npm start
