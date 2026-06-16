# 🚜 Dirt Diggers

A simple, good-looking **construction game for kids**. Drive real toy-style
trucks around a dirt yard, **dig the ground**, and **load the dump truck** — with
a clear goal, cheerful sounds, and dust flying everywhere. Built to feel great on
a phone or tablet, with big touch controls and no reading required.

## Play it on your phone

It auto-deploys to **GitHub Pages**:

> **https://matteckhardt-coder.github.io/Kids-trucks/**

Tap the screen once so the sound can start (phones block audio until you do).

## How to play

| Control | What it does |
| --- | --- |
| **Left thumb (drive)** | Touch and drag on the left side to steer; the truck drives where you push. |
| **DIG** | Hold to dig dirt into the loader's bucket. |
| **DUMP** | Hold to tip your dirt out — into the dump truck if you're next to it, otherwise onto the ground. |
| **Tap a truck** | Switch to driving that truck (they all share the yard). |
| **Machine bar (top)** | Or tap a name to jump to that truck. |
| **Goal banner** | Dig dirt, pour it into the dump truck, and fill it up for a cheer! |
| **↺ Level** | Smooth the whole yard to start fresh. |
| **🔊 / 🔇** | Turn sound on or off. |

On a **computer**: drive with **WASD / arrow keys**, dig with **J** (or space),
dump with **K**.

### The trucks

A whole fleet shares the yard — tap any to drive it:

- **Loader** — digs dirt with its shovel and pours it into the dump truck.
- **Dump Truck** & **Garbage Truck** — haul the dirt; drive over loose piles to
  scoop them up, or park next to the loader to be filled.
- **Tractor**, **Fire Truck**, **Delivery** — just fun to drive around.

## How it's built

Plain HTML, CSS, and JavaScript — no build step. It runs on **Babylon.js** (3D)
with a deformable dirt-heightmap terrain, soft shadows, and filmic
post-processing. The trucks and buildings are real 3D models.

```
index.html                    – page, controls, goal banner
styles.css                    – layout and touch-control styling
audio.js                      – synthesized engine/dig/dump/cheer sounds (no audio files)
game.js                       – the game: terrain, driving, dig/dump, fleet, goal
vendor/babylon.js             – Babylon.js engine (bundled)
vendor/babylonjs.loaders.min.js – glTF model loader (bundled)
assets/models, assets/city    – truck and building models
.github/workflows/deploy.yml  – publishes to GitHub Pages
```

## Run it locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Credits

3D models are from **Kenney's "Car Kit"** (https://kenney.nl), released under
**CC0 / public domain**. Thank you, Kenney! See `assets/KENNEY-LICENSE.txt`.
Everything else (terrain, game logic, sounds) is generated in code.
