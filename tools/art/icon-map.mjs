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

  // --- ONE PICTURE PER ITEM ------------------------------------------------
  //
  // The bag draws an icon, not a model. Eighty-two weapons shared eight
  // pictures between them, so on the body the catalogue was varied and in the
  // one place a player reads items as a LIST a Notched Dirk and a Stormneedle
  // were the same drawing. That is the "they all look the same" complaint one
  // level up, in a different medium.
  //
  // Names were chosen by searching the real index (`icon-search.mjs`) rather
  // than guessed and then corrected: 4239 icons exist, and picking from what is
  // there beats proposing a name and reading a validator's list of failures.
  // The family icons above stay — they still title the equipment panel and
  // anything that has no picture of its own falls back to them.

  // daggers
  "item-dirk": "lorc/plain-dagger",
  "item-thiefknife": "lorc/thrown-knife",
  "item-fangtooth": "delapouite/bone-knife",
  "item-nightedge": "lorc/curvy-knife",
  "item-adderfang": "lorc/sacrificial-dagger",
  "item-venomkiss": "lorc/dripping-knife",
  "item-guttingknife": "lorc/bowie-knife",
  "item-harrowspike": "lorc/spiral-thrust",
  "item-frostshiv": "lorc/shard-sword",
  "item-stormneedle": "lorc/piercing-sword",

  // swords
  "item-recruitblade": "delapouite/rusty-sword",
  "item-armingsword": "lorc/broadsword",
  "item-falchion": "lorc/sword-hilt",
  "item-boarspear": "lorc/spear-hook",
  "item-longsword": "lorc/pointy-sword",
  "item-rimeblade": "lorc/striped-sword",
  "item-greatsword": "delapouite/two-handed-sword",
  "item-gildedblade": "lorc/shining-sword",
  "item-levinbrand": "lorc/thunder-blade",
  "item-frostbrand": "lorc/energy-sword",
  "item-claymore": "delapouite/ancient-sword",
  "item-wyrmtooth": "lorc/croc-sword",

  // axes
  "item-handaxe": "lorc/wood-axe",
  "item-stoneaxe": "lorc/stone-axe",
  "item-woodcutter": "delapouite/axe-in-log",
  "item-cinderbite": "lorc/fire-axe",
  "item-beardedaxe": "lorc/battle-axe",
  "item-halberd": "delapouite/sharp-halberd",
  "item-twinbite": "lorc/crossed-axes",
  "item-headsman": "delapouite/war-axe",
  "item-moonglaive": "lorc/crescent-blade",
  "item-reaperscythe": "lorc/scythe",

  // maces
  "item-smithhammer": "lorc/flat-hammer",
  "item-boundclub": "delapouite/wood-club",
  "item-quarrymaul": "lorc/claw-hammer",
  "item-morningstar": "lorc/spiked-mace",
  "item-warhammer": "delapouite/warhammer",
  "item-sparkhead": "delapouite/flanged-mace",
  "item-deepsledge": "delapouite/3d-hammer",
  "item-chainfall": "delapouite/flail",
  "item-dawnbreaker": "delapouite/thor-hammer",
  "item-thunderhead": "lorc/heavy-lightning",

  // bows
  "item-shortbow": "lorc/pocket-bow",
  "item-hunterbow": "delapouite/bow-arrow",
  "item-recurve": "delapouite/bow-string",
  "item-hoarstring": "lorc/arrow-flights",
  "item-yewlongbow": "lorc/bowman",
  "item-hornbow": "lorc/broadhead-arrow",
  "item-gildedbow": "lorc/arrow-cluster",
  "item-emberbow": "lorc/flaming-arrow",
  "item-ruinstring": "lorc/barbed-arrow",
  "item-heartwood": "lorc/thorned-arrow",

  // staves
  "item-apprenticestaff": "lorc/wizard-staff",
  "item-reedstaff": "delapouite/wood-stick",
  "item-oakenstave": "lorc/tree-branch",
  "item-pilgrimstaff": "generalace135/shepherds-crook",
  "item-thornstave": "lorc/thorny-vine",
  "item-lanternstaff": "lorc/lantern",
  "item-runewood": "lorc/rune-stone",
  "item-ossuarystaff": "delapouite/skull-staff",
  "item-starcaller": "lorc/star-swirl",
  "item-tidecaller": "lorc/wave-crest",

  // wands
  "item-birchrod": "lorc/fairy-wand",
  "item-tallowwand": "lorc/candle-flame",
  "item-iciclerod": "lorc/frozen-orb",
  "item-knucklewand": "lorc/bone-knife",
  "item-emberwand": "lorc/smoking-orb",
  "item-moonhook": "delapouite/crescent-staff",
  "item-arcwand": "willdabeast/orb-wand",
  "item-cinderspiral": "lorc/bowl-spiral",
  "item-sunspire": "lorc/sundial",
  "item-stormrod": "lorc/lightning-branches",

  // fists
  "item-handwraps": "lorc/fist",
  "item-splintguard": "skoll/bracers",
  "item-studdedcestus": "lorc/mailed-fist",
  "item-boneknuckles": "delapouite/brass-knuckles",
  "item-ironknuckles": "skoll/fist",
  "item-emberfists": "lorc/fulguro-punch",
  "item-tigerclaws": "lorc/steel-claws",
  "item-warplategauntlets": "delapouite/gauntlet",
  "item-obsidianfists": "lorc/plate-claw",
  "item-stormfists": "lorc/thor-fist",

  // off-hands
  "item-plankshield": "lorc/wooden-door",
  "item-woodoffhand": "delapouite/wood-pile",
  "item-pitchtorch": "delapouite/torch",
  "item-roundshield": "willdabeast/round-shield",
  "item-hunterquiver": "delapouite/quiver",
  "item-grimoire": "delapouite/spell-book",
  "item-kiteshield": "sbed/shield",
  "item-wardingfocus": "lorc/crystal-ball",
  "item-warhorn": "lorc/hunting-horn",
  "item-bulwark": "lorc/shield-echoes",
  "item-silverbuckler": "lorc/bordered-shield",
  "item-embercenser": "lorc/smoking-orb",
  "item-stillwardglass": "lorc/crystal-shine",
  "item-verdantaegis": "lorc/edged-shield",
  "item-stormlantern": "lorc/lantern-flame",

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

  // --- skills added with the status system, one per weapon tree ------------
  focus: "lorc/all-seeing-eye",
  rally: "lorc/rally-the-troops",
  bloodlust: "lorc/wolf-howl",
  stagger: "lorc/stomp",
  expose: "lorc/cracked-shield",
  huntersmark: "lorc/target-arrows",
  immolate: "sbed/flamer",
  stormbolt: "lorc/lightning-bow",

  // --- skills that READ a status, one per weapon tree ----------------------
  // Second Breath deliberately has no entry: it reuses the fist tree's own
  // `secondwind` glyph, because they are the same idea one rank apart and a
  // second heart-plus would be two pictures for one thought.
  onslaught: "delapouite/swords-power",
  execute: "lorc/decapitation",
  followthrough: "lorc/hammer-drop",
  exploit: "lorc/piercing-sword",
  killshot: "lorc/crosshair-arrow",
  combust: "lorc/explosion-rays",
  wardoff: "lorc/aura",

  // --- statuses ------------------------------------------------------------
  // Every running effect needs a picture, because the indicator row is the
  // whole point of the system: a buff nobody can see is a number that changed
  // for no reason the player can name.
  //
  // Where a status has exactly one source it SHARES that skill's glyph, so the
  // mark on the bar is recognisably the thing you just cast. Where it has
  // several — staggered comes off three different skills — or none at all, as
  // weakened and chilled do, it gets its own.
  "status-enraged": "delapouite/enrage",
  "status-shielded": "sbed/shield",
  "status-focused": "lorc/target-dummy",
  "status-rallied": "delapouite/vertical-banner",
  "status-bloodlust": "lorc/bloody-sword",
  "status-weakened": "lorc/broken-heart",
  "status-chilled": "lorc/frostfire",
  "status-poisoned": "lorc/poison-bottle",
  "status-burning": "carl-olsen/flame",
  "status-bleeding": "lorc/bleeding-wound",
  "status-staggered": "skoll/knockout",
  // The window after a big creature has committed a telegraphed swing. A body
  // that has thrown its weight and has not got it back yet.
  "status-recovering": "delapouite/unbalanced",
  "status-exposed": "lorc/cracked-shield",
  "status-marked": "skoll/bullseye",
  "status-shocked": "lorc/lightning-storm",

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
  // The waystones out in the field, and the objective marker that points at
  // them. A menhir, because that is what they are.
  waystone: "delapouite/menhir",
  reforge: "lorc/fire-shield",
  salvage: "delapouite/hammer-break",
};
