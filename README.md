# 🚜 Dirt Diggers

A simple, colorful **construction game for kids**. Drive a bulldozer, dump truck,
backhoe, front loader, skid steer, or side loader around a dirt yard and **push,
dig, and dump dirt** to your heart's content. Built to feel great on a phone or
tablet, with big touch controls — no reading required.

There's no score and nothing to lose: it's an open-ended dirt sandbox for little
truck fans. Every machine has its own engine rumble, and there are dirt plops,
scoops, beeps and a "bucket full" ding — all synthesized in the browser, no
sound files needed.

It's built as a real 2D game on the **Phaser 3** engine (bundled in `vendor/`),
with chunky cartoon machines, organic shaded dirt heaps, a follow camera, and
dust / dirt-clod particles. All the art is generated in code — there are no
image files to load.

## Play it on your phone

The game auto-deploys to **GitHub Pages**. Once the *Deploy to GitHub Pages*
action finishes, open this on your phone:

> **https://matteckhardt-coder.github.io/Kids-trucks/**

(Tap the screen once so sound can start — phones block audio until you do.)

## How to play

| Control | What it does |
| --- | --- |
| **Left thumb (drive)** | Touch and drag anywhere on the left side to steer. The machine drives the way you push. |
| **DIG button** | Hold to scoop dirt from in front of you into the bucket. |
| **DUMP button** | Hold to pour the bucket back out into a pile. |
| **Bulldozer blade** | Just drive — the bulldozer's blade pushes dirt forward into big piles. |
| **Machine bar (top)** | Tap to switch between machines. |
| **↺ Level** | Smooths the whole yard so you can start fresh. |
| **🔊 / 🔇** | Turn sound on or off. |

DIG and DUMP dim out automatically for machines that don't use them (the
bulldozer pushes instead, and the dump truck loads by driving over piles).

On a **computer** you can also use **WASD / arrow keys** to drive, **J** (or
space) to dig, and **K** to dump.

### The machines — each one works differently

- **Bulldozer** — no buttons needed: just drive and the blade pushes dirt into
  big piles in front of you.
- **Front Loader** — a big front bucket. DIG to scoop, DUMP to pour.
- **Backhoe** — digs the deepest holes, fast (great for making craters).
- **Dump Truck** — *drive over piles* to auto-fill the bed (beeping as it
  hauls), then DUMP a huge load wherever you like.
- **Skid Steer** — quick and nimble; DUMP spreads dirt out flat for grading.
- **Side Loader** — loads and dumps from the **side**, so drive alongside a pile.

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
index.html         – page, control overlay, script tags
styles.css         – layout and touch-control styling
trucks.js          – machine definitions (speed, bucket size, mechanics, sprite shape)
audio.js           – synthesized engine/dig/dump/beep sounds (no audio files)
game.js            – Phaser game: sprite generation, dirt field, driving, dig/dump/doze
vendor/phaser.min.js – the Phaser 3 game engine (bundled so it always loads)
.github/workflows/deploy.yml – publishes the game to GitHub Pages
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
