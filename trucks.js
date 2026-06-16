// Construction machines for Dirt Diggers.
//
// Gameplay fields:
//   speed    – drive speed (world px / second)
//   digRate  – how fast DIG fills / DUMP empties the bucket (units / sec)
//   capacity – bucket / bed size
//   loadRate – dump truck drive-over scoop rate
//
// Mechanic fields:
//   dozer    – front blade pushes dirt while driving
//   scoop    – "front" | "side" | "driveover" | null (where the bucket works)
//   dig/dump – whether the DIG / DUMP buttons are usable (default true)
//   spread   – DUMP spreads dirt across several tiles (grading)
//   digMin   – deepest a tile can be dug down to (default -2)
//
// shape – tells the cartoon sprite generator how to draw this machine.
const TRUCKS = [
  {
    id: "bulldozer",
    name: "Bulldozer",
    emoji: "🚜",
    color: 0xf4a93b, accent: 0xc8801a,
    speed: 150, digRate: 4, capacity: 3,
    dozer: true, scoop: null, dig: false, dump: false,
    shape: { tracks: true, bladeFront: true },
    blurb: "Just drive — the blade pushes dirt into big piles.",
  },
  {
    id: "frontloader",
    name: "Front Loader",
    emoji: "🚜",
    color: 0xffd23f, accent: 0xd4a500,
    speed: 165, digRate: 6, capacity: 8,
    scoop: "front", digMin: -1,
    shape: { wheels: "big", bucketFront: true },
    blurb: "Scoop up a giant bucket from in front of you.",
  },
  {
    id: "backhoe",
    name: "Backhoe",
    emoji: "🚜",
    color: 0xffb703, accent: 0xbb8500,
    speed: 135, digRate: 8, capacity: 5,
    scoop: "front", digMin: -4,
    shape: { wheels: "big", bucketFront: true, armBack: true },
    blurb: "Digs deep holes in the ground, fast.",
  },
  {
    id: "dumptruck",
    name: "Dump Truck",
    emoji: "🚛",
    color: 0xe8703a, accent: 0xb14f20,
    speed: 175, digRate: 6, capacity: 14, loadRate: 7,
    scoop: "driveover", dig: false,
    shape: { wheels: "twin", bedBack: true },
    blurb: "Drive over piles to fill the bed, then DUMP a huge load.",
  },
  {
    id: "skidsteer",
    name: "Skid Steer",
    emoji: "🛻",
    color: 0x5fb85f, accent: 0x3d8a3d,
    speed: 205, digRate: 6, capacity: 4,
    scoop: "front", spread: true, digMin: -1,
    shape: { wheels: "small", bucketFront: true, compact: true },
    blurb: "Quick and nimble — DUMP spreads dirt out flat.",
  },
  {
    id: "sideloader",
    name: "Side Loader",
    emoji: "🚚",
    color: 0x4d96d9, accent: 0x2f6ca8,
    speed: 160, digRate: 5, capacity: 7,
    scoop: "side", digMin: -1,
    shape: { wheels: "big", sideBucket: true, long: true },
    blurb: "Loads and dumps from the side as you drive past.",
  },
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TRUCKS };
}
