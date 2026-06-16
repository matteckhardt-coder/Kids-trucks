// Construction machines kids can drive in the dirt yard.
// Tuning notes:
//   speed    – how fast it drives (world px / second)
//   digRate  – how fast DIG fills / DUMP empties the bucket (dirt units / second)
//   capacity – how much dirt the bucket or bed can hold
//   dozer    – true if a front blade pushes dirt while driving
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
    blurb: "Push big piles of dirt with the blade!",
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
    dozer: false,
    blurb: "Scoop up a giant bucket of dirt.",
  },
  {
    id: "backhoe",
    name: "Backhoe",
    emoji: "🚜",
    color: "#ffb703",
    accent: "#bb8500",
    speed: 135,
    digRate: 7,
    capacity: 5,
    dozer: false,
    blurb: "Dig deep holes in the ground.",
  },
  {
    id: "dumptruck",
    name: "Dump Truck",
    emoji: "🚛",
    color: "#e8703a",
    accent: "#b14f20",
    speed: 175,
    digRate: 3,
    capacity: 12,
    dozer: false,
    blurb: "Haul a huge load and dump it anywhere.",
  },
  {
    id: "skidsteer",
    name: "Skid Steer",
    emoji: "🛻",
    color: "#5fb85f",
    accent: "#3d8a3d",
    speed: 200,
    digRate: 5,
    capacity: 4,
    dozer: false,
    blurb: "Quick and nimble — spins on a dime.",
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
    dozer: false,
    blurb: "A big friendly hauler for the yard.",
  },
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TRUCKS };
}
