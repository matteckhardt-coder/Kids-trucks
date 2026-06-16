// Construction machines kids can drive in the dirt yard.
//
// Tuning fields:
//   speed    – how fast it drives (world px / second)
//   digRate  – how fast DIG fills / DUMP empties the bucket (dirt units / sec)
//   capacity – how much dirt the bucket or bed can hold
//
// Mechanic fields (what makes each machine special):
//   dozer    – a front blade that pushes dirt while driving
//   scoop    – where the bucket works: "front", "side", "driveover", or null
//   dig      – can use the DIG button (default true)
//   dump     – can use the DUMP button (default true)
//   spread   – DUMP spreads dirt over several tiles (grading)
//   digMin   – deepest it can dig a tile down to (default -2; lower = deeper)
const TRUCKS = [
  {
    id: "bulldozer",
    name: "Bulldozer",
    emoji: "🚜",
    color: "#f4a93b",
    accent: "#c8801a",
    speed: 150,
    digRate: 4,
    capacity: 3,
    dozer: true,
    scoop: null,
    dig: false,
    dump: false,
    blurb: "Just drive — the blade pushes dirt into big piles.",
  },
  {
    id: "frontloader",
    name: "Front Loader",
    emoji: "🚜",
    color: "#ffd23f",
    accent: "#d4a500",
    speed: 165,
    digRate: 6,
    capacity: 8,
    scoop: "front",
    digMin: -1,
    blurb: "Scoop up a giant bucket from in front of you.",
  },
  {
    id: "backhoe",
    name: "Backhoe",
    emoji: "🚜",
    color: "#ffb703",
    accent: "#bb8500",
    speed: 135,
    digRate: 8,
    capacity: 5,
    scoop: "front",
    digMin: -4,
    blurb: "Digs deep holes in the ground, fast.",
  },
  {
    id: "dumptruck",
    name: "Dump Truck",
    emoji: "🚛",
    color: "#e8703a",
    accent: "#b14f20",
    speed: 175,
    digRate: 6,
    capacity: 14,
    scoop: "driveover",
    loadRate: 7,
    dig: false,
    blurb: "Drive over piles to fill the bed, then DUMP a huge load.",
  },
  {
    id: "skidsteer",
    name: "Skid Steer",
    emoji: "🛻",
    color: "#5fb85f",
    accent: "#3d8a3d",
    speed: 205,
    digRate: 6,
    capacity: 4,
    scoop: "front",
    spread: true,
    digMin: -1,
    blurb: "Quick and nimble — DUMP spreads dirt out flat.",
  },
  {
    id: "sideloader",
    name: "Side Loader",
    emoji: "🚚",
    color: "#4d96d9",
    accent: "#2f6ca8",
    speed: 160,
    digRate: 5,
    capacity: 7,
    scoop: "side",
    digMin: -1,
    blurb: "Loads and dumps from the side as you drive past.",
  },
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TRUCKS };
}
