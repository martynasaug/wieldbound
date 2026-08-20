// The icon vocabulary of the game: one semantic key per thing that needs a
// picture, mapped to a game-icons.net source file.
//
// Keys are what `shared/protocol-types.ts` and the DOM panels refer to, so a
// re-mapping is a change here and nowhere else. Values are `author/name` paths
// inside the game-icons repository; `icons.mjs` validates every one of them
// against the fetched index before it writes anything, because a typo'd name
// otherwise degrades silently into a missing glyph.
export const ICON_MAP = {
  // --- classes -------------------------------------------------------------
  "class-adventurer": "lorc/hood",
  "class-warrior": "cathelineau/swordman",
  "class-ranger": "lorc/bowman",
  "class-mage": "delapouite/wizard-face",

  // --- weapon families -----------------------------------------------------
  fist: "lorc/fist",
  sword: "lorc/broadsword",
  axe: "delapouite/war-axe",
  mace: "lorc/spiked-mace",
  dagger: "lorc/broad-dagger",
  bow: "delapouite/bow-arrow",
  staff: "lorc/wizard-staff",
  wand: "lorc/crystal-wand",

  // --- default attacks, one per family ------------------------------------
  "attack-jab": "delapouite/high-punch",
  "attack-slash": "lorc/sword-slice",
  "attack-hew": "delapouite/sharp-axe",
  "attack-crush": "lorc/mace-head",
  "attack-stab": "lorc/flying-dagger",
  "attack-shoot": "lorc/high-shot",
  "attack-arcaneblast": "delapouite/bolt-spell-cast",
  "attack-zap": "lorc/laser-blast",

  // --- skills --------------------------------------------------------------
  haymaker: "lorc/fulguro-punch",
  cleave: "lorc/sword-spin",
  charge: "delapouite/charging-bull",
  warcry: "lorc/shouting",
  shieldwall: "lorc/shield-reflect",
  earthshatter: "lorc/earth-crack",
  powershot: "lorc/charged-arrow",
  multishot: "lorc/arrow-cluster",
  poisonarrow: "lorc/poison-gas",
  disengage: "delapouite/backward-time",
  rainofarrows: "lorc/arrow-flights",
  arcanebolt: "delapouite/bolt-spell-cast",
  firebolt: "lorc/fireball",
  frostnova: "delapouite/ice-spell-cast",
  mend: "delapouite/healing",
  chainlightning: "lorc/lightning-arc",
  roar: "lorc/screaming",
  gutpunch: "lorc/punch-blast",
  riposte: "lorc/sword-clash",
  rend: "lorc/bleeding-wound",
  reckless: "lorc/wide-arrow-dunk",
  shockwave: "lorc/wave-strike",
  concuss: "delapouite/knocked-out-stars",
  backstab: "lorc/backstab",
  flurry: "lorc/tornado",
  frostbolt: "lorc/frozen-arrow",
  arcanemissiles: "lorc/star-swirl",

  // --- talent passives -----------------------------------------------------
  grit: "lorc/muscle-up",
  footwork: "lorc/boot-prints",
  calloused: "lorc/mailed-fist",
  quickhands: "lorc/quick-slash",
  secondwind: "zeromancer/heart-plus",
  unbowed: "lorc/edged-shield",
  edge: "delapouite/sharp-axe",
  temper: "lorc/anvil-impact",
  precision: "lorc/target-arrows",
  momentum: "skoll/spinning-top",
  mastery: "delapouite/laurels-trophy",
  heft: "delapouite/weight-lifting-up",
  brutality: "lorc/bloody-sword",
  thickskin: "lorc/armor-vest",
  sweeping: "lorc/wind-slap",
  bloodthirst: "delapouite/vampire-dracula",
  weight: "sbed/weight-crush",
  bulwark: "lorc/rosa-shield",
  stoneskin: "lorc/stone-sphere",
  relentless: "lorc/clockwork",
  crusher: "sbed/crush",
  quick: "lorc/sprint",
  deadly: "skoll/bullseye",
  slippery: "lorc/wingfoot",
  venom: "lorc/poison-bottle",
  opportunist: "lorc/eyeball",
  assassin: "darkzaitzev/hooded-assassin",
  draw: "delapouite/pull",
  eagleeye: "lorc/eagle-emblem",
  longbow: "delapouite/reload-gun-barrel",
  venomtip: "lorc/poison-gas",
  fleet: "lorc/run",
  marksman: "lorc/archery-target",
  focus: "lorc/concentration-orb",
  wellspring: "sbed/water-drop",
  conduit: "lorc/lightning-branches",
  efficiency: "lorc/book-cover",
  archmage: "lorc/wizard-staff",
  quickcast: "delapouite/fast-forward-button",
  attunement: "lorc/crystal-shine",
  warding: "lorc/magic-shield",
  rapid: "lorc/lightning-frequency",
  spellblade: "delapouite/star-formation",

  // --- equipment slots (drawn as the ghost in an empty slot) ---------------
  "slot-weapon": "lorc/broadsword",
  "slot-helm": "delapouite/black-knight-helm",
  "slot-armor": "lorc/breastplate",
  "slot-cape": "delapouite/cape",
  "slot-boots": "lorc/boots",
  "slot-ring": "delapouite/diamond-ring",

  // --- materials and consumables ------------------------------------------
  wood: "delapouite/wood-pile",
  ore: "faithtoken/ore",
  herb: "delapouite/herbs-bundle",
  potion: "delapouite/health-potion",
  tonic: "delapouite/magic-potion",

  // --- the window dock -----------------------------------------------------
  "dock-character": "delapouite/character",
  "dock-inventory": "delapouite/backpack",
  "dock-skills": "delapouite/skills",
  "dock-craft": "lorc/anvil",
  "dock-leaderboard": "lorc/laurel-crown",

  // --- monster portraits ---------------------------------------------------
  // One per kind, for the target frame. Worth having thirteen real ones rather
  // than four category glyphs: the portrait is the largest thing in the frame
  // and a hood standing in for a slime reads as a person you are about to
  // fight, which is worse than no picture at all.
  "monster-slime": "delapouite/slime",
  "monster-mushnub": "delapouite/grass-mushroom",
  "monster-spikyblob": "lorc/acid-blob",
  "monster-goblin": "delapouite/goblin-head",
  "monster-armabee": "lorc/wasp-sting",
  "monster-wolf": "lorc/wolf-head",
  "monster-cactoro": "delapouite/cactus",
  "monster-orcbrute": "delapouite/orc-head",
  "monster-ghost": "lorc/ghost",
  "monster-troll": "skoll/troll",
  "monster-demon": "delapouite/devil-mask",
  "monster-golem": "delapouite/golem-head",
  "monster-dragon": "lorc/dragon-head",

  // --- the leaderboard's top three ----------------------------------------
  // One podium per place rather than one icon recoloured: the shapes differ,
  // so the ranking stays readable without relying on colour alone.
  "rank-1": "delapouite/podium-winner",
  "rank-2": "delapouite/podium-second",
  "rank-3": "delapouite/podium-third",

  // --- interface furniture -------------------------------------------------
  settings: "lorc/cog",
  sun: "lorc/sunbeams",
  moon: "lorc/moon",
  hp: "lorc/heart-organ",
  mana: "lorc/magic-swirl",
  xp: "delapouite/star-medal",
  gear: "lorc/gear-hammer",
  sort: "delapouite/stack",
  sell: "delapouite/coins",
  strength: "delapouite/muscular-torso",
  agility: "delapouite/jump-across",
  vitality: "lorc/heart-tower",
  intelligence: "lorc/brain",
  // --- the item catalogue --------------------------------------------------
  // One icon per base-item FAMILY rather than per base item: seventy-eight
  // glyphs would be seventy-eight downloads to say "this is a helmet" in
  // seventy-eight ways, and the thing a player reads off a bag slot is what
  // KIND of object it is. Which particular one it is, they read from the name
  // and see on the character.
  "slot-offhand": "delapouite/attached-shield",

  "offhand-shield": "willdabeast/round-shield",
  "offhand-focus": "lorc/crystal-shine",
  "offhand-quiver": "delapouite/quiver",

  "helm-cap": "lorc/barbute",
  "helm-hood": "delapouite/warlock-hood",
  "helm-full": "lorc/visored-helm",
  "helm-horned": "lorc/horned-helm",
  "helm-circlet": "delapouite/tiara",

  "armor-robe": "lorc/robe",
  "armor-leather": "lorc/leather-vest",
  "armor-scale": "lorc/scale-mail",
  "armor-chain": "lorc/mail-shirt",
  "armor-brigandine": "delapouite/leather-armor",
  "armor-plate": "lorc/breastplate",

  "boots-low": "lorc/leather-boot",
  "boots-tall": "delapouite/fur-boot",
  "boots-wrapped": "darkzaitzev/tabi-boot",
  "boots-plated": "delapouite/greaves",

  "cape-cape": "delapouite/cape",
  "cape-cloak": "lucasms/cloak",
  "cape-tabard": "delapouite/cape-armor",
  "cape-mantle": "lorc/wing-cloak",

  "ring-band": "delapouite/ring",
  "ring-bone": "lorc/skull-ring",
  "ring-signet": "lorc/skull-signet",
  "ring-gem": "lorc/engagement-ring",
  "ring-rune": "lorc/swirl-ring",

  // --- the smithy ----------------------------------------------------------
  // Essence is the fourth material, and the only one that comes off a kill
  // rather than out of the ground — so it is deliberately not another lump of
  // rock or bundle of leaves.
  essence: "delapouite/soul-vessel",
  // The refined tier: made at the bench, found nowhere.
  ingot: "lorc/metal-bar",
  weave: "delapouite/rolled-cloth",
  forge: "lorc/anvil-impact",
  refine: "delapouite/melting-metal",
  // A rune, both as a thing you hold and as the verb that cuts it in.
  etch: "lorc/rune-stone",
  reforge: "lorc/fire-shield",
  salvage: "delapouite/hammer-break",
};
