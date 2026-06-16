# 🚜 Dirt Diggers

A simple, colorful **construction game for kids**. Drive a bulldozer, dump truck,
backhoe, front loader, skid steer, or side loader around a dirt yard and **push,
dig, and dump dirt** to your heart's content. Built to feel great on a phone or
tablet, with big touch controls — no reading required.

There's no score and nothing to lose: it's an open-ended dirt sandbox for little
truck fans.

## How to play

| Control | What it does |
| --- | --- |
| **Left thumb (drive)** | Touch and drag anywhere on the left side to steer. The machine drives the way you push. |
| **DIG button** | Hold to scoop dirt from in front of you into the bucket. |
| **DUMP button** | Hold to pour the bucket back out into a pile. |
| **Bulldozer blade** | Just drive — the bulldozer's blade pushes dirt forward into big piles. |
| **Machine bar (top)** | Tap to switch between machines. |
| **↺ Level** | Smooths the whole yard so you can start fresh. |

On a **computer** you can also use **WASD / arrow keys** to drive, **J** (or
space) to dig, and **K** to dump.

### The machines

- **Bulldozer** — pushes dirt with its blade as it drives.
- **Front Loader** — a big bucket for scooping lots of dirt.
- **Backhoe** — digs deep holes fast.
- **Dump Truck** — hauls a giant load and dumps it anywhere.
- **Skid Steer** — quick and nimble.
- **Side Loader** — a big friendly hauler.

## Run it locally

It's plain HTML, CSS, and JavaScript — no build step. Just serve the folder:

```bash
# Python (built in on most systems)
python3 -m http.server 8000
# then open http://localhost:8000
```

or simply open `index.html` in a browser.

## Project layout

```
index.html   – page + on-screen controls
styles.css   – layout and touch-control styling
trucks.js    – the machine definitions (speed, bucket size, etc.)
game.js      – the game engine: dirt grid, driving, dig/dump/doze, rendering
```

## Tweaking the machines

All the machines live in [`trucks.js`](trucks.js). Each one has a `speed`,
`digRate`, bucket `capacity`, and a `dozer` flag. Change those numbers to make a
machine faster, give it a bigger bucket, or turn it into a dozer — the game picks
the changes up on reload.

## Ideas for later

- Sound effects (engine rumble, beeping reverse, dirt plops)
- Goal modes ("fill the hole", "build the tallest pile")
- Saving the yard between sessions
- More machines (excavator, crane, road roller)
