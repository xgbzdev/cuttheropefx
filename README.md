# Cut the Rope – Basic Firefox OS App

A simple HTML5 "Cut the Rope" style game packaged for Firefox OS (and modern browsers).

## How to play
1. Swipe / drag across the ropes to cut them.
2. Let the candy fall into the green monster’s mouth.
3. Collect the golden stars for a better score.
4. Press **Restart** to try again.

## Controls
- **Mouse**: click and drag to cut
- **Touch**: swipe with finger

## Running on Firefox OS
1. Enable the Developer menu (Settings → Device information → More information → Developer menu).
2. Go to Settings → Developer → Debugging via USB (or use the WebIDE / App Manager).
3. Push the whole folder as a packaged app, or open `index.html` via the browser for quick testing.

## Running in a normal browser
Just open `index.html` in Firefox, Chrome, Edge, etc.  
It works best in portrait orientation on mobile.

## Files
- `manifest.webapp` – Firefox OS app manifest
- `index.html` – entry point
- `style.css` – UI styling
- `game.js` – full game logic + simple rope physics
- `icon-128.png` – app icon

Enjoy!
