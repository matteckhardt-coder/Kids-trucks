# 🏙️ City Helpers

A friendly **city game for kids**. Drive city trucks around town and help out —
the **fire truck** puts out fires, the **garbage truck** picks up garbage, the
**ambulance** rushes to the rescue, and more. Finish jobs to earn XP, **level
up**, and **unlock new trucks**. Big touch controls, no reading required, made
to feel great on a phone.

## Play it on your phone

It auto-deploys to **GitHub Pages**:

> **https://matteckhardt-coder.github.io/Kids-trucks/**

Tap the screen once so the sound can start (phones block audio until you do).

## How to play

| Control | What it does |
| --- | --- |
| **Left thumb (drive)** | Touch and drag on the left side to steer; the truck drives where you push. |
| **Top truck bar** | Tap a truck to drive it. Locked trucks show 🔒 and the level you need. |
| **Tap a truck on screen** | Also switches to driving it. |
| **Follow the arrow** | A golden arrow points to your truck's job. |
| **Do the job** | Drive the **right truck** onto the glowing ring (🔥 needs the fire truck, 🗑️ the garbage truck, …) and wait a moment — job done! |
| **HONK** | Make some noise! |
| **🔊 / 🔇** | Turn sound on or off. |

On a computer, drive with **WASD / arrow keys**.

## Trucks & jobs

Each completed job gives **XP**. Level up to unlock the next truck:

- 🚒 **Fire Truck** → put out **fires** (Level 1)
- 🚛 **Garbage Truck** → pick up **garbage** (Level 1)
- 🚑 **Ambulance** → rush to a **rescue** (Level 2)
- 🚓 **Police** → stop **trouble** (Level 3)
- 🚕 **Taxi** → pick up a **rider** (Level 4)
- 📦 **Delivery** → drop off a **package** (Level 5)
- 🪝 **Tow Truck** → tow a **broken-down car** (Level 6)

## How it's built

Plain HTML/CSS/JS, no build step. Runs on **Babylon.js** (3D) with soft shadows
and filmic post-processing. The trucks and buildings are real 3D models.

```
index.html                      – page, controls, level/XP UI
styles.css                      – layout and touch styling
audio.js                        – synthesized engine/horn/chime sounds
game.js                         – city, jobs, leveling, driving
vendor/babylon.js, *.loaders    – Babylon.js engine + glTF loader (bundled)
assets/models, assets/city      – vehicle and building models
.github/workflows/deploy.yml    – publishes to GitHub Pages
```

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Credits

3D models are from **Kenney's "Car Kit"** (https://kenney.nl), **CC0 /
public domain** — see `assets/KENNEY-LICENSE.txt`. Everything else (city
layout, jobs, sounds) is generated in code.
