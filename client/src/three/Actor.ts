import { profiler } from "./profiler";
// One animated character in the world — the local player, a remote player, or
// a monster. Wraps a loaded model with an animation state machine, smoothed
// movement, a weapon socket and a set of gear attachments.
//
// Players differ from monsters in one way, and it is no longer the model.
//
// It USED to be: class is whatever weapon is in hand, the body followed the
// class, and `setAppearance` could swap the entire rig mid-fight. That was
// never a design decision, though it read as one for eight phases — it was a
// rendering constraint wearing a design decision's clothes. The kit welds each
// character's mesh to its animations in one file, the only sword swing in the
// project lives inside the Warrior file, and so picking up a sword meant
// becoming the Warrior because that is where the swing was.
//
// `clips.ts` unwelds them. All five rigs share one 44-bone skeleton, so a body
// is now one body and the animations are a library it draws from. What you are
// holding still decides your class, your skills, your reach, your mana and your
// damage attribute — the actual rule is untouched — and it now decides which
// ANIMATION you swing with rather than which person you are.

import * as THREE from "three";
import {
  appearanceClass,
  type Appearance,
  type GearStyle,
  type ItemRarity,
  type ItemSlot,
} from "../../../shared/protocol-types";
import { instantiate, findNode, findClip, type Instance } from "./assets";
import { BUILTIN_WEAPON_MESHES, PLAYER_BODY, buildArmour, buildHeldItem } from "./gear";
import { pickClip, loadClipLibrary } from "./clips";
import type { WeaponType } from "../../../shared/protocol-types";

/**
 * The states a body can be in.
 *
 * `roll` and `pickup` are the two the clip library has always carried and
 * nothing has ever played. M55.1 pooled twenty-five animations off five rigs —
 * "every attack, cast, draw, punch, roll, pickup, death, hit reaction, idle,
 * walk and run a person in this world can perform" — and the game bound six of
 * them. A dash was a character sliding sideways in its run, and picking
 * something up off the ground was walking over it.
 */
export type ActorAnim =
  | "idle"
  | "walk"
  | "run"
  | "attack"
  | "hit"
  | "die"
  | "roll"
  | "pickup"
  /**
   * Casting, as opposed to swinging.
   *
   * `Spell1` and `Spell2` have been in the pooled library since M55.1 and were
   * reachable only as a WAND'S ORDINARY ATTACK — so every one of the
   * forty-three skills animated as your weapon's basic swing, and a sword user
   * pressing Mend did a sword swing.
   */
  | "cast";

/**
 * How each weapon family MOVES, now that it no longer decides who is holding it.
 *
 * One row per family, best clip first, falling through to the library's
 * generic entries. This is the table that carries what the body swap used to
 * carry implicitly: a bow still draws and looses, a staff still casts, a dagger
 * still stabs twice for every axe swing — the difference simply lives in an
 * animation rather than in a different person.
 *
 * Three of these are choices rather than lookups:
 *
 * - **An axe and a mace swing the sword animation, not a slower one.** The kit
 *   has no axe clip, and the honest alternatives were to reuse the sword's or
 *   to invent a stand-in. The swing timer already makes an axe land later and
 *   heavier than a dagger — that is the attack slot's curtain, visible on the
 *   bar — so the weight is already communicated by the thing that governs it.
 * - **A wand casts `Spell1` and a staff swings `Staff_Attack`.** The Wizard
 *   file has both and the difference is exactly right: a staff is a stick you
 *   swing and a wand is a thing you point.
 * - **Fists get `Attack` before `Punch`.** `Punch` exists on four of the five
 *   rigs as the what-do-I-do-with-no-weapon fallback and is a single jab; the
 *   Monk's `Attack` is a real unarmed strike, and bare hands are a real
 *   archetype in this game rather than a broken state.
 */
const ATTACK_CLIPS: Record<WeaponType, string[]> = {
  fist: ["Attack", "Attack2", "Punch"],
  sword: ["Sword_Attack", "Sword_AttackFast", "Attack"],
  axe: ["Sword_Attack", "Attack"],
  mace: ["Sword_Attack", "Attack"],
  dagger: ["Dagger_Attack", "Dagger_Attack2", "Sword_AttackFast", "Attack"],
  bow: ["Bow_Attack_Shoot", "Bow_Attack_Draw", "Attack"],
  staff: ["Staff_Attack", "Spell1", "Attack"],
  wand: ["Spell1", "Spell2", "Staff_Attack", "Attack"],
};

/**
 * And how each family STANDS and MOVES while holding something.
 *
 * `Idle_Weapon` and `Run_Weapon` are a weapon-ready stance — hands up, blade
 * out — and every armed family wants them. A bow is the exception: the kit's
 * `Run_Holding` is the one that carries a bow properly, across the body rather
 * than out to the side.
 */
const ARMED_IDLE = ["Idle_Weapon", "Idle_Attacking", "Idle"];
const ARMED_RUN = ["Run_Weapon", "Run"];
const BOW_RUN = ["Run_Holding", "Run_Weapon", "Run"];

// Which clips satisfy each state, best first. Different packs name things
// differently, so this is a preference list rather than an exact mapping —
// `findClip` falls back to a loose match before giving up.
const CLIP_PREFERENCES: Record<ActorAnim, string[]> = {
  idle: ["Idle_Weapon", "Idle", "Idle2", "Flying_Idle", "Flying"],
  // NOTE: this table is for MONSTERS and townspeople now. A player rig builds
  // its actions from `clips.ts` and the two tables above, because a player is
  // the only actor whose animation set has to change without its model doing
  // so. See `buildActions`.
  // An amble, and it is a separate state from `run` rather than a slower
  // playback of it. Every character rig in the pack ships a `Walk`, and it has
  // been sitting unused since the port: `run` lists it only as a FALLBACK, so
  // anything with both — which is all five class bodies — has always sprinted.
  // A townsperson jogging between their own front door and the market stall
  // reads as somebody late for something.
  walk: ["Walk", "Walk_Weapon", "Run_Weapon", "Run", "Fly", "Flying"],
  run: ["Run_Weapon", "Run", "Walk", "Fly", "Flying"],
  // The class bodies each name their attack after their weapon, and the
  // generic entries below them are a trap: a loose match for "Attack" finds
  // `Idle_Attacking` on the Wizard and `Attacking_Idle` on the Rogue, so a mage
  // would cast by standing still. `findClip` tries every exact name before any
  // loose one, which is what makes listing them here enough.
  attack: [
    "Sword_Attack", "Staff_Attack", "Bow_Attack_Shoot", "Dagger_Attack", "Attack",
    "Punch", "Bite", "Headbutt", "Sword_AttackFast",
  ],
  hit: ["RecieveHit", "HitReact", "ReceiveHit", "Hit", "Damage"],
  die: ["Death", "Die"],
  // Monsters have neither, and the empty list is the honest way to say so: a
  // slime does not roll and a dragon does not pick things up. `buildActions`
  // simply binds nothing, and `play` refuses a state it has no action for.
  roll: [],
  pickup: [],
  // A monster that casts falls back to whatever it attacks with, since nothing
  // in the bestiary has a separate cast pose.
  cast: ["Spell1", "Spell2", "Attack", "Bite"],
};

const FADE_MS = 180;

// --- Standing ON the ground rather than in it ---------------------------------
//
// `instantiate` seats a model by measuring its bounding box and dropping it so
// the lowest point sits on y=0. That is the only thing it CAN do — it is handed
// a model and no animation — and it is exactly right for the pose it measures,
// which is the bind pose.
//
// No clip is the bind pose. Measured across all twenty-five, holding each one at
// twenty-five points through its own duration and skinning every ninth vertex
// by hand:
//
//     Idle          0.0000     <- what the seat was tuned against
//     Idle_Weapon   0.0000
//     Run           0.0137
//     Walk          0.0381     <- and this is the state you are in most
//     Roll          0.0760
//     Death         0.1305
//
// Walking put the sole four centimetres into the ground on a 1.8-unit
// character, permanently, everywhere. Reported from play as feet slightly in
// the ground, which is what four centimetres at ninety pixels looks like.
//
// THE FIX IS A LIFT, AND IT IS PER STATE.
//
// M55.3 shipped ONE lift for the whole rig, taken as the worst case over every
// clip in which the character is standing. That fixes the reported fault — no
// upright pose puts a foot through the floor — and it does it by paying for the
// deepest clip in every other clip: the single constant is Walk's 38mm, so an
// IDLE character, which is what you are looking at most of the time you are
// looking at all, hovered 38mm above the grass permanently. Trading a sunk foot
// for a floating one is the right trade to make in a hurry and the wrong one to
// leave standing.
//
// A lift per animation state costs nothing at runtime and is exact in every
// state: Idle's own deepest point is 0.0000, so idle sits ON the ground; Walk
// gets its own 38mm and touches at the bottom of its stride; Run gets 14mm.
//
// AND IT IS PER CLIP AND NOT PER FRAME, WHICH IS THE PART WORTH RECORDING.
// The obvious next step is a lift SAMPLED THROUGH each clip, so the lowest
// vertex is exactly on the ground at every instant — and that is wrong, because
// it would delete the flight phase of the run. A run has a moment with both
// feet off the ground, and "the lowest point is always at zero" is precisely
// the statement that there is no such moment. The rule is that nothing may go
// BELOW the ground, not that something must always be touching it, so the
// per-clip minimum is the right resolution and a finer one is a regression
// wearing a precision badge.
//
// `die` is exempt and gets a lift of zero. A body on the ground is supposed to
// be on the ground, and Death reaches 131mm below the bind pose — it is the
// clip that made a single shared constant unworkable in the first place.
const NO_LIFT: readonly ActorAnim[] = ["die"];

/** Every Nth vertex. Measured against every vertex on this rig: the two agree
 *  to four decimal places, and stride 3 is a twelfth of the work. */
const VERTEX_STRIDE = 3;
/** Time samples in the pass that finds the sole. */
const COARSE_STEPS = 20;
/** And in the pass that measures it. See `measureLifts` for the convergence. */
const FINE_STEPS = 160;
/** How far above the deepest point still counts as the sole. Generous, because
 *  the whole point of the second pass is that it can afford to be. */
const SOLE_MARGIN = 0.05;

/**
 * How far one clip has to be lifted so no frame of it breaks the ground.
 *
 * Keyed by `model|clip`, because it is a property of the ASSET pair and not of
 * the actor: forty characters on one rig measuring one walk ask once. Measured
 * rather than typed, so a new body or a new walk cycle cannot silently
 * reintroduce this.
 */
const groundLift = new Map<string, number>();

// --- Looking like yourself ---------------------------------------------------
//
// One body for everybody is the right call and it has one obvious cost: a
// crowd at a resource node is now five copies of the same person. Gear covers
// most of that — style picks the mesh, quality tints it, and four slots show —
// but two players in the same kit were identical, and the starting character
// wears nothing at all.
//
// SO THE BODY IS TINTED FROM THE CHARACTER'S NAME.
//
// That is the entire mechanism, and choosing it over the obvious alternative is
// the decision worth recording. The obvious alternative is a character creator:
// sliders, a stored identity, a column in the database and a field on the wire.
// This needs none of them. A name is already unique, already persistent,
// already known to every client that can see you — the nameplate is drawn from
// it — so a tint derived from it is stable across sessions, agreed on by every
// observer, and costs exactly zero bytes and zero schema.
//
// It is also, unlike a random seed, something a player CHOSE. Two people who
// pick the same name get the same character, which is correct: they are the
// same character.
//
// THE AMPLITUDE IS THE HARD PART. The Monk's skin and its robe are the same
// texture on the same material, so there is no way to tint one without the
// other — a wide hue wheel would produce a green person with a green face, and
// this project has been here before, in Phase 49's note about a town that is
// beautiful on a grey background and radioactive on grass. The band is a
// plausible red-through-yellow, the saturation is modest, and the range that
// actually separates two people at ninety pixels is VALUE. See `tintBody` for
// how the first attempt got that exactly backwards.
//
// Gear is never tinted by this. Quality already owns that channel, and a Runed
// breastplate has to be the same shade of Runed on everybody or the ladder
// stops meaning anything.

/** A stable 32-bit hash of a name. `Math.imul`, for the reason `shared/rng.ts`
 *  exists: the textbook version loses its low bits to a double before it
 *  wraps, and the low bits are the only ones a hash has. */
function nameHash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// --- Seeing a character through what is in front of them ---------------------
// Every third-person game has to answer this and there are only three real
// answers: move the camera, fade the obstacle, or draw the character on top.
// This project now does all three, in that order of preference, and this is the
// last of them — the one that cannot fail.
//
// The camera pulls in when a wall gets between it and the player, which handles
// most of it (World.clearDistance). Where it cannot — a player standing flat
// against plaster puts the wall closer than any camera can retreat past — the
// blocking BUILDING fades. But neither reaches the rest of the world: the
// palisade, the market stall, the well and the monument are one merged mesh
// each with no per-object handle to fade, other players and townspeople are not
// what the camera is following, and a monster behind a tree is nobody's line of
// sight but its own.
//
// So every actor also carries a silhouette of itself. The trick that makes it
// free of side effects is `depthFunc: GreaterDepth`: the silhouette draws only
// where this actor is BEHIND something already in the depth buffer. Unoccluded,
// every one of its fragments fails the test and it costs a draw call with no
// pixels; occluded, it is exactly the missing shape and nothing else.
//
// WHICH DEPTH BUFFER, THOUGH — and getting that wrong is what shipped a
// skeleton. "Already in the depth buffer" has to mean THE WORLD and must not
// mean this actor's own body, and the first version could not tell the
// difference: the silhouette was `transparent`, three.js draws every
// transparent object after every opaque one, and so by the time the silhouette
// ran, the actor's own gear had written depth. The body is a centimetre behind
// its own shoulder plates, bracers and shin guards, so it passed `GreaterDepth`
// underneath every one of them and painted a pale blue-white strut there. It
// traced the armour, which is exactly why it read as bones.
//
// The fix is ordering, and it has to be ordering rather than a depth bias: the
// gap between a body and its own gear is a centimetre and the gap to a wall is
// half a metre, but both are non-linear in the depth buffer and vary with how
// far the camera has zoomed out, so any `polygonOffset` tuned at one zoom is
// wrong at another. Instead the silhouette is OPAQUE and slots between the two
// groups by render order: world at 0, silhouettes at 1, everything any actor
// owns at 2. A silhouette therefore tests against a depth buffer holding the
// world and nothing else, which is precisely the question it means to ask.
//
// Two consequences, both accepted on purpose. It is solid rather than 42%
// translucent, because the opaque pass is what gives it the right depth buffer
// and three.js picks the pass off `material.transparent` — and a solid shape
// through a wall is the conventional read anyway. And an actor behind ANOTHER
// ACTOR no longer silhouettes, since all bodies now draw after all silhouettes.
// That case was never the one this exists for: bodies collide, so actors cannot
// overlap much, and the three cases named above are all actor-behind-SCENERY.
const SILHOUETTE_COLOR = 0x7fc4ee;
/** World is 0. The silhouette goes after it and before anything wearing it. */
const SILHOUETTE_RENDER_ORDER = 1;
/** Everything an actor owns — body, gear, held items — draws after that. */
const ACTOR_RENDER_ORDER = 2;
/**
 * The outline goes AFTER the body, and that is the whole trick — see `buildRim`.
 * Silhouette 1, body 2, outline 3.
 */
const OUTLINE_RENDER_ORDER = 3;
/** Warm and pale. Warm, because every light in this world is: a cool rim on a
 *  figure lit by a forge, a torch or a low sun would read as a second sun. */
const RIM_COLOR = 0xffe6bd;

// --- The rim -----------------------------------------------------------------
//
// Two problems, one shape, and finding out they were the same thing is the
// whole of this section.
//
// **A figure standing in front of scenery is hard to pick out.** Not occluded —
// occlusion has three mechanisms already — simply low-contrast: brown leather
// against brown earth, at a camera distance where the character is ninety
// pixels tall. Reported from play as wanting "a slight highlight around the
// player model".
//
// **A figure standing BEHIND scenery used to show through as a solid.** The
// silhouette below is exactly the right idea and it was drawn as a filled
// human-shaped cutout in flat pale blue, which is an X-ray. Reported from play,
// in the word this project has used for that look once before: a skeleton.
//
// A RIM ANSWERS BOTH, because both are asking for the OUTLINE of the figure and
// nothing inside it. In front, the outline is a highlight that separates the
// body from what is behind it. Behind, the outline is the shape of somebody
// standing there rather than a picture of them through a wall.
//
// It is a fresnel — how edge-on this fragment's surface is to the eye — and not
// a hull expanded along its normals, which is the other way to draw an outline.
// The hull needs a second copy of every geometry on the rig, a per-mesh scale
// that is wrong wherever the mesh is not convex, and a stencil buffer to make
// the occluded case an outline rather than a filled blob. The fresnel needs one
// varying and four lines of fragment shader, works on the skinned mesh already
// being drawn, and gives the occluded case an outline for free — because a
// fresnel IS an outline, wherever it is drawn.
//
// Injected with `onBeforeCompile` rather than written as a ShaderMaterial,
// because the rig is SKINNED and reimplementing three's skinning would be
// reimplementing three's skinning. MeshBasicMaterial already carries the normal
// and skinning chunks — it needs them for environment mapping — so
// `transformedNormal` and `mvPosition` are both in scope by the time this runs.
const RIM_GLSL = {
  pars: "varying vec3 vRimN;\nvarying vec3 vRimV;\n",
  vertex:
    // The guard is not belt-and-braces. MeshBasicMaterial compiles the normal
    // chunks only when it needs them — under USE_ENVMAP or USE_SKINNING — so on
    // the skinned body `transformedNormal` exists and on an unskinned held
    // weapon nothing normal-related does. Reaching for it unguarded is a shader
    // that fails to compile for exactly the meshes nobody thinks to test.
    "#if defined( USE_ENVMAP ) || defined( USE_SKINNING )\n" +
    "  vRimN = normalize( transformedNormal );\n" +
    "#else\n" +
    "  vRimN = normalize( normalMatrix * normal );\n" +
    "#endif\n" +
    "vRimV = normalize( mvPosition.xyz );\n",
};

/**
 * Patches a MeshBasicMaterial so it draws only its own rim.
 *
 * `hard` discards the interior outright, for the occluded silhouette, which has
 * to stay in the OPAQUE pass — see the long note below for why that ordering is
 * load-bearing and cannot be traded for alpha. `soft` fades it instead, for the
 * highlight, which is additive and may blend.
 */
function makeRim(
  material: THREE.MeshBasicMaterial,
  mode: "hard" | "soft",
  power: number,
  cut: number,
): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", RIM_GLSL.pars + "void main() {")
      .replace("#include <project_vertex>", "#include <project_vertex>\n" + RIM_GLSL.vertex);
    const tail =
      mode === "hard"
        ? "float rimF = pow(1.0 - abs(dot(normalize(vRimN), normalize(-vRimV))), " +
          power.toFixed(2) +
          ");\n" +
          "if (rimF < " + cut.toFixed(3) + ") discard;\n" +
          "gl_FragColor.rgb *= 0.55 + 0.45 * smoothstep(" + cut.toFixed(3) + ", 1.0, rimF);\n"
        : "float rimF = pow(1.0 - abs(dot(normalize(vRimN), normalize(-vRimV))), " +
          power.toFixed(2) +
          ");\n" +
          "rimF = smoothstep(" + cut.toFixed(3) + ", 1.0, rimF);\n" +
          "if (rimF <= 0.004) discard;\n" +
          "gl_FragColor.a *= rimF;\n";
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", RIM_GLSL.pars + "void main() {")
      .replace("#include <opaque_fragment>", "#include <opaque_fragment>\n" + tail);
  };
  // Two materials with the same program cache key share a compiled program, and
  // these two do not want to.
  material.customProgramCacheKey = () => "rim-" + mode + "-" + power + "-" + cut;
  material.needsUpdate = true;
}

/**
 * Patches a MeshBasicMaterial into an OUTLINE: the same mesh, pushed out along
 * its own normals, drawn back-faces-only.
 *
 * This is the other half, and it exists because the fresnel above is the wrong
 * instrument for the unoccluded case. A fresnel lights every surface that is
 * edge-on to the eye, and on a low-poly rig that includes the inside of an
 * elbow, the top of a belt and the rim of every buckle — so what it draws is
 * not an outline, it is a stipple of bright specks all over the armour.
 * Measured, on a four-times crop: the shoulders and the belt lit up and the
 * actual silhouette barely did.
 *
 * An expanded hull cannot make that mistake, because it does not know where the
 * eye is. Back faces only, so what survives is exactly the band by which the
 * hull overhangs the real body — a line of even weight all the way round it, and
 * nothing at all in the middle, where the body itself draws over it.
 *
 * The push happens in OBJECT space, before the skinning chunk, so an outline on
 * a moving arm moves with the arm. Doing it after would leave the outline in
 * the rest pose while the character walked out of it.
 */
function makeOutline(material: THREE.MeshBasicMaterial, width: number): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\n" +
        "#if defined( USE_ENVMAP ) || defined( USE_SKINNING )\n" +
        "  transformed += normalize( objectNormal ) * " + width.toFixed(4) + ";\n" +
        "#else\n" +
        "  transformed += normalize( normal ) * " + width.toFixed(4) + ";\n" +
        "#endif\n",
    );
  };
  material.customProgramCacheKey = () => "outline-" + width;
  material.needsUpdate = true;
}

export interface ActorOptions {
  model: string;
  height: number;
  /** Radians to add so the model faces +Z when facing is 0. */
  facingOffset?: number;
  /**
   * Ease toward the target position instead of tracking it exactly.
   *
   * Right for anything driven by snapshots — they arrive every ~100ms and
   * without smoothing every remote actor visibly steps rather than moves.
   * Wrong for the local player, whose position is recomputed exactly every
   * frame: there the easing is pure lag, so the model trails its own true
   * position and keeps gliding after the key is released, while the animation
   * has already gone back to idle. That is ice-skating, and it is not a
   * cosmetic problem — the model stops agreeing with the position everything
   * else in the game is measured from.
   */
  interpolate?: boolean;
  /**
   * Stable 0..1 seed for this actor's idle, from a hash of its server id.
   *
   * A camp is four of the same model playing the same clip started at the same
   * moment, and the result is four bodies breathing in lockstep — which reads
   * as one animation applied four times rather than as four creatures. This
   * offsets where in the loop each one starts and how fast it runs it.
   *
   * Seeded rather than random because every client has to see the same camp:
   * two players standing side by side watching different mushnubs breathe in
   * different orders is a small thing, and it is exactly the kind of small
   * thing that makes a world feel like a local hallucination.
   */
  variance?: number;
  /**
   * Whether this actor looks around while idle. Monsters only.
   *
   * A player's facing is not decoration: a skill fired with nothing in range
   * uses it to decide which way the effect goes, and a character that slowly
   * turned on its own while its owner was reading a panel would aim somewhere
   * they did not choose. Nothing reads a monster's facing except the eye.
   */
  idleGlance?: boolean;
  /**
   * Whether this actor is drawn through scenery when something hides it.
   *
   * Defaults on, and TOWNSPEOPLE ARE THE ONE THING THAT TURNS IT OFF.
   *
   * The feature answers one question — "where is the character I am
   * responsible for?" — and the three cases it exists for are your own body
   * behind a palisade, another player behind the inn, and a monster you are
   * fighting behind a tree. A shopkeeper standing behind a statue is not one of
   * them. You do not need to see them through it; you need to walk round it,
   * which is what a person does about a statue.
   *
   * And the cost of getting that wrong is high, because a townsperson stands
   * in one place for the life of the world. Everything else this draws is
   * transient: you move, the monster moves, the occlusion lasts a second. A
   * resident behind a fixed piece of scenery is a solid blue figure painted
   * onto it permanently — which is what the Herald was doing to the monument
   * in the middle of the square, and it looked like the renderer was broken
   * rather than like somebody standing behind something.
   *
   * This is the general fix. Moving one person off one sight line was the
   * specific one, and it does not survive contact with a town whose people
   * walk about.
   */
  silhouette?: boolean;

  /**
   * A soft light along this actor's own outline, always, whether occluded or
   * not. See RIM_GLSL.
   *
   * Off by default and deliberately: it is for PEOPLE. A monster wearing one
   * would be a monster the game had drawn attention to, which is the target
   * ring's job and would make an ordinary wolf look special; a townsperson
   * wearing one would glow in a lit square for the life of the world.
   */
  rim?: number;

  /**
   * Who this is, for the purpose of looking like themselves.
   *
   * The character's name, and it is the whole of the colour customisation —
   * see `tintBody`. Absent for monsters and for anything that should look
   * exactly like every other copy of its model.
   */
  identity?: string;
}

export class Actor {
  /** Positioned at the actor's world location; add this to the scene. */
  readonly root = new THREE.Group();
  /** Carries rotation so the model's own orientation offset stays separate. */
  private readonly pivot = new THREE.Group();

  private instance: Instance | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ActorAnim, THREE.AnimationAction>();
  /** Where `instantiate` seated the model, before any lift. See `NO_LIFT`. */
  private seatY = 0;
  /** How far each bound state has to be lifted. Filled by `measureLifts`. */
  private readonly clipLifts = new Map<ActorAnim, number>();
  private currentAnim: ActorAnim = "idle";
  /** While set, a one-shot (attack/hit) owns the pose and update() will not override it. */
  private oneShotUntil = 0;
  private baseAnim: ActorAnim = "idle";
  /** The run clip's own per-actor rate, captured where `play` sets it — needed
   *  because a leap has to multiply THAT number, not overwrite it, or every
   *  leaping wolf in a pack would snap to the same footfall. */
  private runTimeScale = 1;
  /** >1 while a gap-closer is mid-burst. See `setLeaping`. */
  private leapMultiplier = 1;

  private facing = 0;
  private targetFacing = 0;
  /** 0..1, stable per actor. Drives everything in this file that must differ
   *  between two copies of the same model. */
  private readonly variance: number;
  private readonly idleGlance: boolean;
  private readonly wantsSilhouette: boolean;
  /**
   * Whether this actor animates from the shared human library.
   *
   * True for people, false for monsters — and it is derived from the model
   * rather than passed in, because the fact that decides it is exactly "is this
   * the human skeleton", and asking the caller to remember that is asking for
   * a dragon that plays a sword swing.
   */
  private readonly usesClipLibrary: boolean;
  /** The name this actor is tinted from. See `tintBody`. */
  private identity: string | undefined;
  /** When this actor next glances somewhere while standing still. */
  private nextGlanceAt = 0;
  /** Facing it has chosen to idle at, so a glance eases rather than snaps. */
  private idleFacing: number | null = null;
  private readonly facingOffset: number;
  private readonly interpolate: boolean;

  /** Where the server says this actor is. Rendered position eases toward it. */
  private readonly target = new THREE.Vector3();
  private snapped = false;

  weaponSocket: THREE.Object3D | null = null;
  ready = false;

  /** Every bone on the current rig, by name — gear rides these. */
  private readonly bones = new Map<string, THREE.Object3D>();
  /** Per-bone groups whose world transform equals the model's rest frame, so
   *  gear can be authored in rig coordinates. Rebuilt with the body. */
  private readonly holders = new Map<string, THREE.Object3D>();
  /** The model's world matrix in its rest pose, which the holders undo. */
  private restFrame = new THREE.Matrix4();
  /** Each bone's world matrix in the rest pose, captured while the rig is
   *  still unanimated. Holders are built lazily — the first time a style
   *  needs a given bone — and by then the skeleton is mid-stride, so reading
   *  `bone.matrixWorld` at that moment would peg the gear to whatever pose the
   *  character happened to be in when the item was equipped. */
  private readonly restBoneMatrices = new Map<string, THREE.Matrix4>();

  /** Which body model is currently built, so a re-equip that does not change
   *  class does not needlessly rebuild the rig. */
  private bodyModel: string;
  /** Both hands. Was one object back when only the right one could hold
   *  anything. */
  private held: THREE.Object3D[] = [];
  private worn: THREE.Object3D[] = [];
  private appearance: Appearance | null = null;
  /** Bumped on every appearance change, so a slower earlier load cannot land
   *  after a faster later one and dress the character in the wrong gear. */
  private dressGeneration = 0;
  /** The same guard one level up. Swapping from a staff to a sword and back
   *  faster than an FBX parses would otherwise leave whichever rig happened
   *  to finish last on screen, regardless of what is actually held. */
  private bodyRequest = 0;

  // Emissive is used for two signals that must not fight each other: a brief
  // white/gold flash when something lands a hit, and a persistent blue while
  // chilled. Flash wins while it runs, then the chill (or nothing) resumes.
  private litMaterials: { mat: THREE.MeshStandardMaterial; base: number }[] = [];
  private flashUntil = 0;
  private flashColor = 0xffffff;
  private chilled = false;
  private burning = false;
  private poisoned = false;
  private bleeding = false;
  private recovering = false;
  private emissiveApplied = -1;
  /** Every material this actor owns and must free. All of them are owned: see
   *  the clone in `buildBody`. */
  private ownedMaterials = new Set<THREE.Material>();
  /** The through-walls copy of every mesh on the rig. See SILHOUETTE_COLOR. */
  private silhouettes: THREE.Mesh[] = [];
  private silhouetteMaterial: THREE.MeshBasicMaterial | null = null;
  /** The outline copy of every mesh on the rig. See `makeOutline`. */
  private rims: THREE.Mesh[] = [];
  private outlineMaterial: THREE.MeshBasicMaterial | null = null;
  /**
   * How much of this actor's own rim weight is currently being spent.
   *
   * Driven from the hour, and driven the way round that looks wrong written
   * down: STRONGER BY DAY. A single opacity cannot serve both ends, because the
   * line is read against the background and not against the body — at noon it is
   * a pale cream edge on a lit brown figure standing on lit brown earth, which
   * needs weight to register at all; at midnight the same value is a bright line
   * on black, and enough of it that the seams between the parts of the rig start
   * drawing too and the character reads as a chalk sketch.
   *
   * Which makes this the mirror of `presence.ts`, deliberately. The pool of
   * light at the feet is nothing by day and carries the scene at night; the
   * outline is the other way about. Between them the figure is legible at every
   * hour without either of them ever being the loudest thing on screen.
   */
  private outlineWeight = 1;

  constructor(private readonly options: ActorOptions) {
    this.facingOffset = options.facingOffset ?? 0;
    this.interpolate = options.interpolate ?? true;
    this.variance = options.variance ?? Math.random();
    this.idleGlance = options.idleGlance ?? false;
    this.wantsSilhouette = options.silhouette ?? true;
    this.usesClipLibrary = options.model === PLAYER_BODY;
    this.identity = options.identity;
    this.nextGlanceAt = performance.now() + this.glanceDelay();
    this.bodyModel = options.model;
    this.root.add(this.pivot);
  }

  async load(): Promise<void> {
    await this.buildBody(this.bodyModel);
    this.ready = true;
    this.play("idle", true);
  }

  /**
   * Builds (or rebuilds) the rig. Animation state is deliberately not reset
   * here: a body swap should look like a change of clothes, not a respawn.
   */
  /**
   * Binds one clip per animation state, for whatever is currently in hand.
   *
   * Called on load and again on every weapon change — which is the whole point,
   * and is the ONE thing a weapon change now does to the model. It used to
   * rebuild the entire rig; it now rebinds six actions on a mixer, which costs
   * nothing and, more importantly, cannot drop what the character was doing.
   *
   * A player draws from `clips.ts`; anything else reads the clips its own file
   * shipped with, because a dragon's skeleton has wings on it and the library is
   * a library of human movement.
   */
  private buildActions(): void {
    if (!this.mixer || !this.instance) return;

    // Preserve what is playing. Rebinding is not supposed to be visible, and a
    // naive rebuild drops the character into the bind pose for a frame — arms
    // out sideways — which is exactly what a weapon swap must not look like.
    const wasPlaying = this.currentAnim;
    const wasBase = this.baseAnim;
    for (const action of this.actions.values()) action.stop();
    this.actions.clear();

    const weapon = this.usesClipLibrary ? this.appearance?.weaponType : undefined;
    for (const anim of Object.keys(CLIP_PREFERENCES) as ActorAnim[]) {
      const clip = this.usesClipLibrary
        ? pickClip(...this.playerClipsFor(anim, weapon))
        : findClip(this.instance.animations, ...CLIP_PREFERENCES[anim]);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      if (
        anim === "attack" ||
        anim === "hit" ||
        anim === "die" ||
        anim === "roll" ||
        anim === "pickup" ||
        anim === "cast"
      ) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(anim, action);
    }

    this.baseAnim = wasBase;
    this.currentAnim = "idle";
    this.oneShotUntil = 0;
    this.play(wasPlaying === "attack" || wasPlaying === "hit" ? wasBase : wasPlaying, true);
  }

  /** The preference list for one state, given what is in hand. */
  private playerClipsFor(anim: ActorAnim, weapon: WeaponType | undefined): string[] {
    const armed = weapon !== undefined && weapon !== "fist";
    switch (anim) {
      case "attack":
        return ATTACK_CLIPS[weapon ?? "fist"];
      case "idle":
        // Bare hands stand at ease. A weapon-ready stance with nothing in it is
        // a character miming a sword, which is worse than standing normally.
        return armed ? ARMED_IDLE : ["Idle", "Idle_Attacking"];
      case "run":
        if (!armed) return ["Run", "Walk"];
        return weapon === "bow" ? BOW_RUN : ARMED_RUN;
      case "walk":
        // One walk for everybody. The kit has no armed walk, and an armed RUN
        // played at walking speed is a character sprinting on the spot.
        return ["Walk", "Run"];
      case "hit":
        // There are two, and which one you take depends on whether you were
        // mid-swing — which is a distinction this rig ships and nothing has
        // ever used.
        return armed
          ? ["RecieveHit_Attacking", "RecieveHit"]
          : ["RecieveHit", "RecieveHit_Attacking"];
      case "die":
        return ["Death"];
      // Both harvested in M55.1 and never once played until now.
      case "roll":
        return ["Roll"];
      case "pickup":
        return ["PickUp", "Pickup"];
      // Every body in the game can reach these, which is exactly what pooling
      // the five rigs' clips bought: a warrior holding a greatsword still has
      // the Wizard's cast to call on when the thing being done is a spell.
      // Falls through to the weapon's own attack for a rig that somehow has
      // neither, rather than freezing in the bind pose.
      case "cast":
        return ["Spell1", "Spell2", "Staff_Attack", ...ATTACK_CLIPS[weapon ?? "fist"]];
    }
  }

  private async buildBody(model: string): Promise<void> {
    const request = ++this.bodyRequest;
    // The library before the body, for anything that animates out of it.
    // `buildActions` reads it synchronously, so a rig built first would bind no
    // actions at all and stand in the bind pose until the next equip — which is
    // a bug that only appears on a cold cache and therefore never locally.
    // Both are cached promises, so this costs an await and not a fetch.
    if (this.usesClipLibrary) await loadClipLibrary();
    const instance = await instantiate(model, this.options.height);
    if (request !== this.bodyRequest) return; // a later swap overtook this one

    // Everything from here to the end of this method is synchronous, and it
    // runs in a promise continuation — between two animation frames, invisible
    // to any frame timer. It rebinds six actions, clones a material per mesh,
    // measures the lifts, builds a silhouette and a rim pass and then re-dresses
    // the whole rig. Timed so a stall can say so.
    profiler.begin("rig:" + model);
    try {
      this.finishBody(instance, model);
    } finally {
      profiler.end("rig:" + model);
    }
  }

  private finishBody(instance: Instance, model: string): void {

    if (this.instance) {
      this.clearGear();
      this.pivot.remove(this.instance.object);
      this.mixer?.stopAllAction();
      for (const m of this.ownedMaterials) m.dispose();
    }
    this.instance = instance;
    this.bodyModel = model;
    // The bind-pose seat, captured before anything can add a lift to it. Every
    // frame writes `seatY + lift` rather than adding to whatever is there, or
    // the lifts would accumulate.
    this.seatY = instance.object.position.y;
    this.pivot.add(instance.object);

    this.bones.clear();
    this.holders.clear();
    this.actions.clear();
    this.litMaterials = [];
    this.ownedMaterials = new Set();

    // Every body ships its own weapon parented into the rig. Left in place, a
    // ranger with a sword would carry both — so the baked-in one always goes,
    // and the socket is filled explicitly from `Appearance` instead.
    const builtIn: THREE.Object3D[] = [];
    instance.object.traverse((o) => {
      if (BUILTIN_WEAPON_MESHES.has(o.name)) builtIn.push(o);
    });
    for (const o of builtIn) o.removeFromParent();

    this.mixer = new THREE.AnimationMixer(instance.object);
    this.buildActions();

    // The rig ships a dedicated weapon socket; the weapon that was parented to
    // it is what makes "class is what you hold" a mesh swap on one bone.
    this.weaponSocket =
      findNode(instance.object, "^weaponr$") ??
      findNode(instance.object, "^weapon\\.r$") ??
      findNode(instance.object, "^weapon");

    instance.object.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // `SkeletonUtils.clone` shares materials with the cached prototype, so
      // without this every actor built from one model would share one emissive
      // channel: hitting a single wolf would flash the whole pack, and chilling
      // one would tint them all. Textures are still shared, being by reference.
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
      this.trackMesh(mesh);
    });

    // Holders are measured against the rest pose, which is why this runs here:
    // the model has just been loaded, no clip has played, and nothing has
    // awaited since `instantiate` returned, so the skeleton is still exactly as
    // the artist bound it.
    //
    // Do NOT reach for `Skeleton.pose()` to make that guarantee explicit. It
    // writes each root bone's *bind-space world* matrix into its *local*
    // matrix, and on this rig the root bone's parent is `CharacterArmature`,
    // a plain Group already carrying a scale of 100 — so the scale gets applied
    // twice and every bone comes out a hundred times too big. The gear rides
    // the bones, so it grows with them, which is how this was found.
    instance.object.updateMatrixWorld(true);
    this.restFrame.copy(instance.object.matrixWorld);
    this.restBoneMatrices.clear();
    for (const [name, bone] of this.bones) {
      this.restBoneMatrices.set(name, bone.matrixWorld.clone());
    }

    this.tintBody();
    this.measureLifts(model);

    // The new rig has its own action map, so whatever was playing has to be
    // started again on it. Without this a body swap leaves the character
    // frozen in the bind pose — arms out sideways, weapon aimed at the
    // horizon — which reads as the weapon being attached wrong.
    this.currentAnim = "idle";
    this.oneShotUntil = 0;
    this.play(this.baseAnim, true);

    // Built after the materials are cloned, and from the BODY only. Gear has
    // no silhouette of its own — the shape you see through a wall is the naked
    // rig, which is close enough to read as a person and is the whole job. It
    // is not free to change: a gear ghost would have to live inside the gear
    // object so that `clearGear` takes it away, and `clearGear` disposes every
    // material it finds down there, which would destroy the one silhouette
    // material the body is still using.
    this.buildSilhouette(instance.object);
    this.buildRim(instance.object);

    // Re-dress: the gear was hanging off the rig that just went away. The body
    // check inside will pass, because `bodyModel` is already the new one.
    if (this.appearance) this.applyAppearance(this.appearance);
  }

  /**
   * A group parented to `bone` whose world transform matches the model's own
   * rest frame. Gear added to it can therefore be authored in plain rig
   * coordinates — feet at y=0, top of the skull at y~290 — and still ride the
   * bone through every animation.
   */
  private holderFor(boneName: string): THREE.Object3D | null {
    const existing = this.holders.get(boneName);
    if (existing) return existing;
    const bone = this.bones.get(boneName);
    if (!bone) return null;

    const holder = new THREE.Group();
    holder.name = `rest_${boneName}`;
    bone.add(holder);
    // holder.matrixWorld == bone.matrixWorld * holder.matrix, and we want it to
    // equal the model's rest frame — so the local matrix is simply the bone's
    // rest transform undone. Whatever transform sits above the model cancels,
    // being present on both sides.
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(this.restBoneMatrices.get(boneName) ?? bone.matrixWorld)
      .invert()
      .multiply(this.restFrame);
    this.holders.set(boneName, holder);
    return holder;
  }

  /**
   * Dresses the character: body from the class, weapon in the socket, one gear
   * mesh set per equipped visible slot. Safe to call on every items update — an
   * unchanged appearance is dropped before any loading happens.
   */
  setAppearance(appearance: Appearance): void {
    if (this.appearance && sameAppearance(this.appearance, appearance)) return;
    this.appearance = appearance;
    if (!this.instance) return; // load() is in flight and will pick it up
    this.applyAppearance(appearance);
  }

  private applyAppearance(appearance: Appearance): void {
    // THE RIG IS NOT REBUILT HERE ANY MORE. It used to be: `CLASS_BODIES` was
    // read from the weapon, and a different answer tore the whole model down
    // and started again. What a weapon change does now is rebind six animation
    // actions — see `buildActions` — so the character keeps its position, its
    // facing, its pose and its momentum through a swap, because there is
    // nothing left for a swap to interrupt.
    if (this.usesClipLibrary) {
      this.buildActions();
      // A weapon swap changes the ATTACK clip, and a clip that has never been
      // measured has no lift — so this has to run here as well as in
      // `buildBody`. Safe at this point and not before it: the holders were
      // captured against the rest pose long ago and are `matrixAutoUpdate =
      // false`, so playing a clip to measure it cannot disturb them.
      this.measureLifts(this.bodyModel);
    }

    const generation = ++this.dressGeneration;
    this.clearGear();

    // What is in each hand, by catalogue id. The family alone was enough while
    // there was one sword per class; there are nine now and they do not look
    // alike, so the appearance carries which one.
    const hands: [string | undefined, ItemRarity | undefined, "right" | "left"][] = [
      [appearance.weaponBaseId, appearance.weaponRarity, "right"],
      [appearance.offhandBaseId, appearance.offhandRarity, "left"],
    ];
    for (const [baseId, rarity, hand] of hands) {
      if (!baseId) continue;
      void buildHeldItem(baseId, rarity ?? "honed", hand).then((held) => {
        if (!held || generation !== this.dressGeneration) return;
        const socket = this.bones.get(held.bone) ?? (hand === "right" ? this.weaponSocket : null);
        if (!socket) return;
        socket.add(held.object);
        this.held.push(held.object);
        this.trackMaterials(held.object);
      });
    }

    const layers = Object.entries(appearance.layers) as [
      ItemSlot,
      { style: GearStyle; rarity: ItemRarity } | undefined,
    ][];
    for (const [slot, layer] of layers) {
      if (!layer) continue;
      for (const piece of buildArmour(slot, layer.style, layer.rarity)) {
        // Two spaces, and the piece says which it is in. See the note on
        // `GearAttachment.boneLocal`: a generated part is authored on a
        // standing character and needs the holder to undo the bone; a harvested
        // one was already a child of that bone and must not have it undone
        // twice.
        const holder = piece.boneLocal
          ? (this.bones.get(piece.bone) ?? null)
          : this.holderFor(piece.bone);
        if (!holder) continue;
        holder.add(piece.object);
        this.worn.push(piece.object);
        this.trackMaterials(piece.object);
      }
    }
  }

  /** Registers an object's materials as this actor's own — they carry its
   *  rarity tint and its emissive state. Geometry is never registered: it is
   *  shared with every other character wearing the same look. */
  private trackMaterials(object: THREE.Object3D): void {
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) this.trackMesh(o as THREE.Mesh);
    });
  }

  /**
   * Builds the through-walls silhouette for whatever the rig currently is.
   *
   * A second mesh per skinned mesh, sharing the SAME geometry and the SAME
   * skeleton — so it animates with the original for free and costs no skinning
   * work of its own beyond the draw. Rebuilt with the body, because a class
   * swap replaces the rig underneath it.
   *
   * `bind` with the original's `bindMatrix` is the part that has to be right:
   * constructing a SkinnedMesh and merely assigning `.skeleton` leaves the bind
   * matrix at identity, and the silhouette then floats a hundred units away
   * from the character it belongs to, because these rigs carry a scale of 100
   * on the armature.
   */
  private buildSilhouette(root: THREE.Object3D): void {
    if (!this.wantsSilhouette) return;
    for (const ghost of this.silhouettes) ghost.removeFromParent();
    this.silhouettes = [];
    if (!this.silhouetteMaterial) {
      this.silhouetteMaterial = new THREE.MeshBasicMaterial({
        color: SILHOUETTE_COLOR,
        // Only the outline. The filled version of this was the "skeleton" — see
        // the rim note above. A hard cut rather than a fade because the opaque
        // pass has no alpha to fade with, and the cut is generous enough that
        // what survives is a band rather than a hairline.
        // OPAQUE, and that is the whole fix. See the long note above: three.js
        // splits its render lists on this flag, and a transparent silhouette is
        // drawn after every opaque thing in the scene — including the gear on
        // the very actor it belongs to, which is what made it draw bones.
        transparent: false,
        // Only where this actor is behind something. See the note above.
        depthFunc: THREE.GreaterDepth,
        // Never writes: a silhouette is a hint about something you cannot see,
        // and it must not stop the real body drawing over it if it can.
        depthWrite: false,
        fog: false,
      });
      // 1.9 and 0.34: a wide band rather than a hairline, because this one is
      // read at a glance through a palisade and a thin line at ninety pixels is
      // a thing you have to look for.
      makeRim(this.silhouetteMaterial, "hard", 1.9, 0.34);
    }

    const sources: THREE.Mesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) sources.push(mesh);
    });

    for (const mesh of sources) {
      const skinned = mesh as THREE.SkinnedMesh;
      let ghost: THREE.Mesh;
      if (skinned.isSkinnedMesh) {
        const s = new THREE.SkinnedMesh(skinned.geometry, this.silhouetteMaterial);
        s.bind(skinned.skeleton, skinned.bindMatrix);
        ghost = s;
      } else {
        ghost = new THREE.Mesh(mesh.geometry, this.silhouetteMaterial);
      }
      ghost.renderOrder = SILHOUETTE_RENDER_ORDER;
      // Never a shadow caster: the silhouette is a view-space cheat and a
      // shadow of it would be a second character on the ground.
      ghost.castShadow = false;
      ghost.receiveShadow = false;
      ghost.frustumCulled = false;
      // Parented to the SOURCE's parent and given its transform, so anything
      // the original inherits — the armature's scale, most of all — comes with
      // it without being recomputed here.
      ghost.position.copy(mesh.position);
      ghost.quaternion.copy(mesh.quaternion);
      ghost.scale.copy(mesh.scale);
      mesh.parent?.add(ghost);
      this.silhouettes.push(ghost);
    }
  }

  /**
   * Colours this body from its owner's name. See the note above `nameHash`.
   *
   * Applied to the BODY only — the meshes the rig arrived with — and never to
   * anything worn, which is why it runs at the end of `buildBody` rather than
   * at the end of dressing. Gear is added afterwards and tracked separately, so
   * the split needs no filter: whatever is on the rig at this moment is the
   * person, and everything that arrives later is their kit.
   */
  private tintBody(): void {
    if (!this.identity || !this.instance) return;
    const h = nameHash(this.identity);

    // TWO AXES, AND THEY ARE SEPARATED ON PURPOSE.
    //
    // The first attempt multiplied one HSL colour over the material and got
    // four characters within ten values of each other on every channel —
    // `#d7bb99`, `#e8bfa3`, `#d3b29d`, `#d6bea8`. Measured, and it is obvious in
    // hindsight: an HSL colour at L=0.5 with low saturation is a mid grey with a
    // hint, and multiplying four mid greys over one texture gives four of the
    // same thing. The knob was turned; it was not connected to anything.
    //
    // So the tint is normalised to a MEAN OF ONE before it is applied. That
    // makes hue and saturation change the CAST at constant brightness, and
    // leaves brightness to a separate multiplier that can then have a real
    // range without fighting it.
    const hue = ((h & 0xff) / 255) * 0.11;
    const sat = 0.08 + (((h >>> 8) & 0xff) / 255) * 0.34;
    // AND VALUE DOES MOST OF THE WORK. Two people a shade apart in hue are the
    // same person at ninety pixels; two people twice apart in value are not, and
    // value is the one that survives being fogged, shadowed and seen at dusk.
    // The ceiling is 1.0 and not a shade more, and the reason is that this
    // MULTIPLIES a base colour that is already 0.78 of white. The first pass
    // ran to 1.28 and every character came out clipped to the same near-white —
    // `#fef3b0`, `#fffac4`, `#ffe4bf` — which is the identical failure as the
    // pass before it (four indistinguishable people) arrived at from the other
    // side. A knob with a range wider than the thing it drives is a knob with no
    // range at all.
    const value = 0.48 + (((h >>> 16) & 0xff) / 255) * 0.54;

    const tint = new THREE.Color().setHSL(hue, sat, 0.5);
    const mean = (tint.r + tint.g + tint.b) / 3;
    if (mean > 0) tint.multiplyScalar(value / mean);

    for (const { mat } of this.litMaterials) {
      // Multiplied over whatever the material already carries, exactly as the
      // rarity tint is — so the texture's own light and shade survive and only
      // the cast and the depth change.
      mat.color.multiply(tint);
    }
  }

  /**
   * Measures how far each bound state has to be lifted to clear the ground.
   *
   * See the note above `NO_LIFT` for why there is a lift at all, why there is
   * one PER STATE, and why there is not one per frame.
   *
   * TWO PASSES, AND THE REASON IS THE ONE M55.3 ALREADY WROTE DOWN ONE AXIS
   * OVER. That milestone found that sampling every ninth vertex under-reported
   * a clearance where every third did not, and fixed the VERTEX axis. It left
   * the TIME axis at twenty-one points, and measuring the converged answer
   * afterwards showed that is where the rest of the error was living:
   *
   *     Walk, every third vertex, at N points through the clip
   *       21 points   0.0408      <- what M55.3 shipped
   *       81 points   0.0451
   *      161 points   0.0456
   *      321 points   0.0456
   *
   * Five millimetres of foot, permanently, in the one state you spend most of
   * your time in. Every other clip is flat from twenty-one points, which is
   * exactly why this survived: the number is only wrong for the clip whose sole
   * passes through its lowest point quickly.
   *
   * A straight 161-point scan is the honest fix and costs about 220ms per clip,
   * which is a visible hitch on a weapon swap. So the scan is split by the
   * observation that the deepest point of a walk is the SAME FEW VERTICES at
   * every instant — the sole of whichever foot is down:
   *
   *   - a coarse pass in time over every third vertex, keeping each vertex's own
   *     minimum, which names the sole;
   *   - a fine pass in time over the sole alone.
   *
   * The second pass is where the resolution is and it evaluates a few dozen
   * vertices rather than a few thousand. Every third vertex is enough on this
   * rig — measured against every vertex, and the two agree to four decimal
   * places — and the margin below widens the candidate set well past the
   * handful the minimum actually comes from.
   *
   * It measures against the RAW SEAT, which is why `seatY` is written back
   * before the scan: the number wanted is how far the sole falls below the
   * actor's own origin with no lift applied, and measuring while a lift is on
   * would return that lift subtracted from itself.
   */
  private measureLifts(model: string): void {
    if (!this.instance || !this.mixer) return;
    this.instance.object.position.y = this.seatY;

    let meshes: THREE.SkinnedMesh[] | null = null;

    for (const [anim, action] of this.actions) {
      if (NO_LIFT.includes(anim)) {
        this.clipLifts.set(anim, 0);
        continue;
      }
      const key = `${model}|${action.getClip().name}`;
      let lift = groundLift.get(key);
      if (lift === undefined) {
        if (!meshes) {
          meshes = [];
          this.instance.object.traverse((o) => {
            const m = o as THREE.SkinnedMesh;
            if (m.isSkinnedMesh) meshes!.push(m);
          });
        }
        lift = -this.deepestPointOf(action, meshes);
        groundLift.set(key, lift);
      }
      this.clipLifts.set(anim, lift);
    }

    // The mixer is left with these actions stopped and weightless. That is safe
    // rather than lucky: every caller ends by calling `play`, and `play` resets
    // and re-weights whatever action it selects — so anything touched here is
    // restored the moment it is next asked for.
    this.applyGroundLift();
  }

  /**
   * How far below the actor's own origin one clip ever reaches. Negative.
   *
   * See `measureLifts` for why it is done in two passes.
   */
  private deepestPointOf(action: THREE.AnimationAction, meshes: THREE.SkinnedMesh[]): number {
    const clip = action.getClip();
    const v = new THREE.Vector3();
    action.reset();
    action.setEffectiveWeight(1);
    action.play();
    action.paused = true;

    // --- pass one: where is the sole ------------------------------------------
    // Each candidate vertex's own lowest height over the clip, so the set can be
    // taken relative to the deepest of them once all of it is known.
    const seen = meshes.map((m) => new Float32Array(m.geometry.attributes.position.count).fill(Infinity));
    let deepest = 0;
    for (let s = 0; s <= COARSE_STEPS; s++) {
      action.time = clip.duration * (s / COARSE_STEPS);
      this.mixer!.update(0);
      // From the ROOT, not from the model: the sole's height is compared
      // against `root.position.y`, and updating the subtree alone would measure
      // a world matrix built on whatever the root's was last frame.
      this.root.updateMatrixWorld(true);
      for (let mi = 0; mi < meshes.length; mi++) {
        const mesh = meshes[mi];
        const pos = mesh.geometry.attributes.position;
        const mins = seen[mi];
        for (let i = 0; i < pos.count; i += VERTEX_STRIDE) {
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
          mesh.applyBoneTransform(i, v);
          v.applyMatrix4(mesh.matrixWorld);
          // `object.position.y` is the seat `instantiate` applied, so this is
          // the sole's height above the actor's own origin — which is the
          // number that has to be non-negative.
          const above = v.y - this.root.position.y;
          if (above < mins[i]) mins[i] = above;
          if (above < deepest) deepest = above;
        }
      }
    }

    const cutoff = deepest + SOLE_MARGIN;
    const soleMesh: number[] = [];
    const soleVertex: number[] = [];
    for (let mi = 0; mi < meshes.length; mi++) {
      const mins = seen[mi];
      for (let i = 0; i < mins.length; i += VERTEX_STRIDE) {
        if (mins[i] <= cutoff) {
          soleMesh.push(mi);
          soleVertex.push(i);
        }
      }
    }

    // --- pass two: and how low does it actually go ----------------------------
    for (let s = 0; s <= FINE_STEPS; s++) {
      action.time = clip.duration * (s / FINE_STEPS);
      this.mixer!.update(0);
      this.root.updateMatrixWorld(true);
      for (let k = 0; k < soleVertex.length; k++) {
        const mesh = meshes[soleMesh[k]];
        const i = soleVertex[k];
        const pos = mesh.geometry.attributes.position;
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        mesh.applyBoneTransform(i, v);
        v.applyMatrix4(mesh.matrixWorld);
        const above = v.y - this.root.position.y;
        if (above < deepest) deepest = above;
      }
    }

    action.stop();
    action.paused = false;
    action.setEffectiveWeight(0);
    return deepest;
  }

  /**
   * Seats the rig for whatever it is playing THIS frame.
   *
   * The lift is the mixer's own weights applied to the per-state lifts, which
   * is what makes a crossfade correct for free: three quarters of the way from
   * idle into a walk, the pose is three quarters of the way and so is the seat.
   * Easing it separately would be a second copy of the blend that could drift
   * from the first, and the drift is a foot skimming the grass for a fifth of a
   * second every time somebody sets off.
   */
  private applyGroundLift(): void {
    if (!this.instance) return;
    let weight = 0;
    let lifted = 0;
    for (const [anim, action] of this.actions) {
      if (!action.isRunning()) continue;
      const w = action.getEffectiveWeight();
      if (w <= 1e-4) continue;
      weight += w;
      lifted += w * (this.clipLifts.get(anim) ?? 0);
    }
    // No weight at all is the frame between building a rig and playing on it.
    // Holding the last seat is right there — dropping to the raw one would be a
    // one-frame twitch on every weapon swap.
    if (weight <= 1e-4) return;
    this.instance.object.position.y = this.seatY + lifted / weight;
  }

  /** Sets how much of the rim weight to spend. See `outlineWeight`. */
  setOutlineWeight(weight: number): void {
    this.outlineWeight = weight;
    if (this.outlineMaterial) {
      this.outlineMaterial.opacity = (this.options.rim ?? 0) * weight;
    }
  }

  /**
   * The rim highlight: a soft light along this actor's outline, drawn ON TOP of
   * its own body.
   *
   * Render order 3 and `depthFunc: LessEqual` together are the whole trick. The
   * body draws at 2 and writes depth; the rim then draws at exactly the same
   * depth and is let through by the EQUAL half of the test, so it lands on the
   * body's own surface with no polygon offset to tune and nothing to z-fight —
   * a bias would have needed a different value at every zoom, which is the same
   * trap the silhouette's ordering was built to avoid.
   *
   * Additive, so it lifts the edge rather than painting over it: a rim that
   * REPLACED the colour there would flatten the armour it is meant to separate
   * from the background.
   */
  private buildRim(root: THREE.Object3D): void {
    const strength = this.options.rim ?? 0;
    if (strength <= 0) return;
    for (const r of this.rims) r.removeFromParent();
    this.rims = [];
    if (!this.outlineMaterial) {
      this.outlineMaterial = new THREE.MeshBasicMaterial({
        color: RIM_COLOR,
        // Back faces only. See `makeOutline` — this is what makes it a line
        // round the figure rather than a bigger copy of the figure.
        side: THREE.BackSide,
        transparent: true,
        opacity: strength * this.outlineWeight,
        // Tests but never writes. Testing is what erases the seams between the
        // eleven meshes a rig is made of; writing would let one outline occlude
        // the next and put the seams straight back.
        depthWrite: false,
        depthTest: true,
        fog: false,
      });
      // Under two centimetres on a 1.8-unit body: about a pixel at this camera,
      // which is a line you notice and not one you look at. It was 0.025 first,
      // and the extra half-pixel was enough for the overhang of each PART of the
      // rig — the hood over the head, a bracer over a forearm — to clear the
      // part beside it and draw its own loop. One outline round a person; not
      // eleven round the eleven meshes a person is made of.
      makeOutline(this.outlineMaterial, 0.022);
      this.ownedMaterials.add(this.outlineMaterial);
    }

    const sources: THREE.Mesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) sources.push(mesh);
    });

    for (const mesh of sources) {
      const skinned = mesh as THREE.SkinnedMesh;
      let out: THREE.Mesh;
      if (skinned.isSkinnedMesh) {
        const s = new THREE.SkinnedMesh(skinned.geometry, this.outlineMaterial!);
        s.bind(skinned.skeleton, skinned.bindMatrix);
        out = s;
      } else {
        out = new THREE.Mesh(mesh.geometry, this.outlineMaterial!);
      }
      // AFTER the whole body, and depth-tested against it. THIS IS THE ORDERING
      // THAT MATTERS, and getting it the other way round is what put loops
      // around the character's collar, wrists and belt.
      //
      // Drawn BEFORE the body, each mesh's hull is erased only by the mesh it
      // belongs to, so wherever the hood overhangs the neck or a bracer
      // overhangs a forearm, that mesh's own outline survives on top of its
      // neighbour — eleven outlines round the eleven parts a person is made of,
      // which reads as jewellery.
      //
      // Drawn AFTER, every part of the rig has already written depth, and the
      // hull's back faces sit BEHIND the real surface, so they fail against any
      // of them. What survives is only where the hull overhangs the WHOLE
      // figure — one line, round the outside, which is what an outline is. The
      // same shape either way; the only difference is what it is measured
      // against, and it is the same class of mistake the silhouette's own
      // ordering note is about.
      out.renderOrder = OUTLINE_RENDER_ORDER;
      out.castShadow = false;
      out.receiveShadow = false;
      out.frustumCulled = false;
      out.position.copy(mesh.position);
      out.quaternion.copy(mesh.quaternion);
      out.scale.copy(mesh.scale);
      mesh.parent?.add(out);
      this.rims.push(out);
    }
  }

  private trackMesh(mesh: THREE.Mesh): void {
    // Everything an actor owns draws after every silhouette in the scene, which
    // is what keeps a silhouette testing against the world alone. This is the
    // one choke point all three kinds go through — body meshes from the rig
    // traverse, held items and worn armour via `trackMaterials` — so a new kind
    // of attachment gets the ordering by construction rather than by memory.
    mesh.renderOrder = ACTOR_RENDER_ORDER;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      this.ownedMaterials.add(m);
      const std = m as THREE.MeshStandardMaterial;
      if (std.emissive) this.litMaterials.push({ mat: std, base: std.emissive.getHex() });
    }
    this.emissiveApplied = -1;
  }

  private clearGear(): void {
    for (const object of [...this.held, ...this.worn]) {
      if (!object) continue;
      const mats = new Set<THREE.Material>();
      object.traverse((c) => {
        const mesh = c as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mats.add(m);
      });
      object.removeFromParent();
      for (const m of mats) {
        m.dispose();
        this.ownedMaterials.delete(m);
      }
      this.litMaterials = this.litMaterials.filter((l) => !mats.has(l.mat));
    }
    this.held = [];
    this.worn = [];
  }

  /** Brief emissive pop when a hit lands. Gold for crits, white otherwise. */
  flash(color = 0xffffff, ms = 130): void {
    this.flashColor = color;
    this.flashUntil = performance.now() + ms;
  }

  /**
   * Frost Nova's own slow, and nothing else's — see `setPoisoned` for why
   * this used to be wired off a generic "is something slowing me" flag and
   * why that was wrong. A steady tint, because a plain slow is a condition
   * rather than an event: nothing about it is happening again right now.
   */
  setChilled(chilled: boolean): void {
    this.chilled = chilled;
  }

  /**
   * Venom ticking on this body.
   *
   * This body used to go the SAME blue chill uses, because the only signal
   * ever wired up was `slowed` — a generic "something with `moveMultiplier`
   * under 1 is running" flag true for chilled, poisoned AND staggered alike.
   * A poisoned or staggered target read as frozen, which taught the wrong
   * lesson about what Frost Nova had actually landed. Poison is a DOT, the
   * same shape as `burning`, so it earns the same pulse rather than sharing
   * chill's steady tint — the rule `setBurning` already wrote down.
   */
  setPoisoned(poisoned: boolean): void {
    this.poisoned = poisoned;
  }

  /** A cut still bleeding. Same DOT-pulse rule as `setPoisoned`, its own
   *  colour so the two do not read as the same wound. */
  setBleeding(bleeding: boolean): void {
    this.bleeding = bleeding;
  }

  /**
   * A burn ticking on this body.
   *
   * `chilled` and `recovering` have been monster-only calls since either
   * existed — nothing ever told a PLAYER's own actor it was slowed or
   * burning, so the only place a player ever saw their own conditions was
   * the HUD status bar, never the character they are looking at. This is
   * the one new state rather than wiring `chilled` alone, because a damage-
   * over-time effect is the one kind of condition where "something is
   * actively happening to me right now" is worth its own pulse rather than
   * sharing the steady tint a plain slow gets.
   */
  setBurning(burning: boolean): void {
    this.burning = burning;
  }

  /**
   * Whether this body is in the window it leaves after committing a big swing.
   *
   * M63.1 made a telegraphed slam open a two-second window at half again damage
   * taken, which is the one genuinely skill-based thing in the fight — bait it,
   * step out, spend everything. Its only feedback was a small pip on the
   * nameplate, and **a mechanic with no feedback is a mechanic nobody learns.**
   * A player who has never been told will read the window as the boss randomly
   * taking more damage sometimes.
   *
   * So it glows, and it PULSES rather than sitting at one colour: the whole
   * information content is "this is running out", and a steady tint says a
   * state while a pulse says a clock.
   */
  setRecovering(recovering: boolean): void {
    this.recovering = recovering;
  }

  private applyEmissive(): void {
    const flashing = performance.now() < this.flashUntil;
    // Ordered by urgency: a hit landing right now beats the window it landed
    // in, the window beats an active DOT (something happening on its own
    // clock), and a DOT beats a plain slow, which is a condition rather than
    // an event. Among DOTs, order is arbitrary — stacking more than one is
    // rare enough that which wins the pixel is not worth its own rule.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 90);
    const opening = this.recovering
      ? // Amber, which is the colour this game already uses for "the condition
        // paid" on an empowered hit — the same idea one system over, so a player
        // who has learned one has learned the other.
        0x000000 | (Math.round(0x80 + pulse * 0x7f) << 16) | (Math.round(0x40 + pulse * 0x40) << 8)
      : -1;
    // A burn PULSES for the same reason `recovering` does: the whole content
    // of the signal is "this is still ticking", and a steady tint says a
    // state rather than a clock.
    const burn = this.burning ? 0x000000 | (Math.round(0xa0 + pulse * 0x5f) << 16) : -1;
    // Venom, on the green channel rather than red — the same pulse, a
    // different school's colour, so a burning body and a poisoned one are
    // never mistaken for each other at a glance.
    const poison = this.poisoned ? 0x000000 | (Math.round(0xa0 + pulse * 0x5f) << 8) : -1;
    // A darker, slower-feeling red than burn's — physical rather than fire,
    // and a cut is not a flame.
    const bleed = this.bleeding ? 0x000000 | (Math.round(0x70 + pulse * 0x40) << 16) : -1;
    const want =
      flashing ? this.flashColor
      : opening !== -1 ? opening
      : burn !== -1 ? burn
      : poison !== -1 ? poison
      : bleed !== -1 ? bleed
      : this.chilled ? 0x2f6fa8
      : -1;
    if (want === this.emissiveApplied) return;
    this.emissiveApplied = want;
    for (const { mat, base } of this.litMaterials) {
      mat.emissive.setHex(want === -1 ? base : want);
    }
  }

  /** True once the model has loaded and can be posed. */
  get loaded(): boolean {
    return this.ready;
  }

  get scale(): number {
    return this.instance?.scale ?? 1;
  }

  setTargetPosition(x: number, y: number, z: number): void {
    this.target.set(x, y, z);
    if (!this.snapped || !this.interpolate) {
      this.root.position.copy(this.target);
      this.snapped = true;
    }
  }

  /** Teleport with no easing — for respawns, where easing would read as a glide. */
  snapTo(x: number, y: number, z: number): void {
    this.target.set(x, y, z);
    this.root.position.copy(this.target);
    this.snapped = true;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /**
   * @param instant Skip the eased turn and apply the new facing THIS frame.
   *
   * Reported from play: a ranged shot fired while turning to face a target
   * visibly launched from behind the character — from a point BEHIND where
   * the arrow was headed, so it read as flying backwards. `muzzlePosition`
   * reads the weapon bone's CURRENT world transform, and the ordinary turn
   * (`update`'s `turnRate`) closes only a fraction of a large angle per
   * frame — so calling `faceToward` and then immediately reading the muzzle
   * in the same tick, as `onBattleResult` does the instant a swing lands,
   * caught the bone still oriented wherever the character was facing a
   * moment before (away, if they had just been backing off). Every OTHER
   * caller wants the slow turn — a wandering monster glancing around, or
   * the player's own body easing to face whatever they're circling — so
   * this stays opt-in rather than becoming the only behaviour.
   */
  faceToward(x: number, z: number, instant = false): void {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.targetFacing = Math.atan2(dx, dz);
    if (instant) {
      this.facing = this.targetFacing;
      this.pivot.rotation.y = this.facing + this.facingOffset;
    }
  }

  /**
   * Where a shot leaves this actor, in world space: the weapon socket if the
   * rig has one, otherwise chest height at the actor's feet.
   *
   * Reading the bone rather than assuming an offset is what puts an arrow on
   * the bow instead of in the archer's sternum — and it keeps tracking through
   * the draw animation, since the socket moves with the hand.
   */
  muzzlePosition(out: THREE.Vector3): THREE.Vector3 {
    if (this.weaponSocket) {
      this.weaponSocket.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(this.weaponSocket.matrixWorld);
    }
    return out.set(this.root.position.x, this.root.position.y + 1.1, this.root.position.z);
  }

  /** Unit vector the actor is currently facing, in world XZ. Lets skills and
   *  dashes aim somewhere sensible when there is no target and no input. */
  /** Compass bearing in radians, the same angle `facingVector` is built from. */
  get bearing(): number {
    return this.facing;
  }

  facingVector(): { x: number; z: number } {
    return { x: Math.sin(this.facing), z: Math.cos(this.facing) };
  }

  faceDirection(dx: number, dz: number): void {
    if (dx * dx + dz * dz < 1e-6) return;
    this.targetFacing = Math.atan2(dx, dz);
  }

  /**
   * Switches animation state. One-shots (attack/hit/die) hold the pose for their
   * clip duration and then hand control back to whatever the base state is.
   */
  play(anim: ActorAnim, immediate = false): void {
    if (!this.mixer) return;
    if (anim === "idle" || anim === "walk" || anim === "run") {
      this.baseAnim = anim;
      // A swing that is still playing normally owns the pose — letting idle
      // cut it short would mean most attacks were never seen through.
      //
      // Running is the exception, and it is the single biggest source of
      // sliding during combat: auto-attacks fire while you are moving, the
      // attack clip is around a second long, and for that whole second the
      // model held a planted swing pose while the character kept travelling.
      // Moving cancels the swing, which is also what it should mean.
      const busy = performance.now() < this.oneShotUntil;
      if (busy && anim === "idle") return;
      if (busy && this.currentAnim === "die") return;
      // A ROLL IS NOT CANCELLED BY MOVING, and it is the one one-shot that must
      // not be. Every other is interrupted by running on purpose — a planted
      // swing pose while the character travels is the sliding this rule exists
      // to stop — but a dash IS travel, so cancelling the roll on the movement
      // it causes would mean the clip never plays for more than a frame.
      if (busy && this.currentAnim === "roll") return;
      if (busy) this.oneShotUntil = 0;
    }
    if (this.currentAnim === anim && !immediate) return;

    const next = this.actions.get(anim);
    if (!next) return;
    const prev = this.actions.get(this.currentAnim);

    // RESUMING A STRIDE MUST NOT RESTART IT. Reported from play as sliding —
    // "doing Michael Jackson" — while running and auto-attacking at once.
    // Every attack interrupts run for its own one-shot pose and hands
    // control back a moment later (see the `busy` block above), and
    // `reset()` snaps an action's clip-local time to zero — so the stride
    // restarted from frame zero on EVERY attack while the character kept
    // gliding across the ground at full speed underneath it, unchanged.
    // `AnimationMixer` keeps advancing every action's own clock even while
    // its weight is faded to zero mid-crossfade, so simply not resetting
    // run lets a resumed stride carry on from wherever it naturally already
    // was — the same way a real runner's legs do not reset to a dead stop
    // and restart because their sword arm did something for a second.
    if (anim !== "run") next.reset();
    // AND THIS LINE IS WHY THE ONE ABOVE IS SAFE.
    //
    // `reset()` is the ONLY thing in three.js that sets `enabled` back to true,
    // and skipping it for run — correct, and the whole point of the comment
    // above — left run as the one action in the game that could never get that
    // flag back. It matters because three.js turns the flag OFF by itself: when
    // a crossfade-out completes, `_updateWeight` sets `enabled = false` on the
    // action that faded to zero. And a disabled action is unrecoverable through
    // the calls made here — `setEffectiveWeight(1)` stores
    // `this.enabled ? weight : 0`, so it writes 0; `play()` does not touch the
    // flag; and `_updateWeight` returns 0 without even evaluating the fade
    // interpolant while it is false, so the fade-in scheduled by
    // `crossFadeTo` below can never complete and never re-enable it.
    //
    // Which is exactly the combat slide. Auto-attack while STANDING STILL and
    // the run -> attack crossfade runs to completion (nothing calls play("run")
    // during it, because you are not moving, and play("idle") is refused by the
    // `busy` guard) — so run is disabled. Move again and `currentAnim` becomes
    // "run" with a weight of zero: the character travels at full speed in a
    // frozen pose, for the rest of the session, with nothing in the console.
    // Idle and attack keep working the whole time, because they still `reset()`,
    // which is why standing still looks completely normal and only moving is
    // broken.
    //
    // Set before `setEffectiveWeight`, not after: that call READS the flag.
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next) {
      prev.crossFadeTo(next, FADE_MS / 1000, false);
    } else if (!immediate) {
      next.fadeIn(FADE_MS / 1000);
    }

    // Where in the loop this actor's idle sits, and how fast it runs it. Set on
    // every entry into idle rather than once at load, because the actor returns
    // to idle constantly — after every swing, every stagger and every stop —
    // and a phase applied only at load would be lost the first time it moved.
    if (anim === "idle") {
      next.time = next.getClip().duration * this.variance;
      // A narrow band. Wider is more obviously varied and starts to look like
      // the creatures are different sizes, since a slower loop reads as heavier.
      next.setEffectiveTimeScale(0.9 + this.variance * 0.2);
    } else if (anim === "run") {
      // Run is not phase-offset: a pack chasing you is supposed to move
      // together. Only the rate varies, so their footfalls are not identical.
      this.runTimeScale = 0.94 + this.variance * 0.12;
      next.setEffectiveTimeScale(this.runTimeScale * this.leapMultiplier);
    } else if (anim === "walk") {
      // Walk IS phase-offset, unlike run, and for the opposite reason: nothing
      // is chasing anything, so two people crossing the same square in step
      // reads as a marching band.
      next.time = next.getClip().duration * this.variance;
      next.setEffectiveTimeScale(0.92 + this.variance * 0.16);
    }

    this.currentAnim = anim;
    if (anim === "attack" || anim === "hit") {
      const clip = next.getClip();
      this.oneShotUntil = performance.now() + clip.duration * 1000;
    } else if (anim === "die") {
      this.oneShotUntil = Number.MAX_SAFE_INTEGER;
    } else {
      this.oneShotUntil = 0;
    }
  }

  /**
   * Plays a one-shot clip stretched to last exactly `ms` instead of its own
   * native duration — for a telegraphed monster's wind-up.
   *
   * Without this the swing that a slam lands with plays only at the moment of
   * impact, so the two-second gap a player is meant to read and step out of
   * shows nothing on the monster's own body — idle or run, same as any other
   * moment. Stretching the same clip across the wind-up means the body visibly
   * rears back and the swing completes exactly as the blow does, which is the
   * one thing a ground ring and a nameplate bar cannot say by themselves: a
   * mechanic with no feedback on the thing doing it is still a mechanic
   * nobody learns to read by looking at the creature.
   *
   * No new art: every telegraphing kind already has an attack clip, and this
   * plays the same one slower rather than asking the bestiary for a pose it
   * does not have.
   */
  playTelegraph(anim: ActorAnim, ms: number): void {
    if (!this.mixer || ms <= 0) return;
    const next = this.actions.get(anim);
    if (!next) return;
    const prev = this.actions.get(this.currentAnim);
    const clipDuration = next.getClip().duration;

    next.reset();
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(clipDuration > 0 ? (clipDuration * 1000) / ms : 1);
    next.play();
    if (prev && prev !== next) prev.crossFadeTo(next, FADE_MS / 1000, false);
    else next.fadeIn(FADE_MS / 1000);

    this.currentAnim = anim;
    this.oneShotUntil = performance.now() + ms;
  }

  /**
   * A leap is a real speed multiplier on the server — "the burst is the whole
   * mechanic" — and the client had no idea it was happening: the run cycle
   * played at its ordinary rate while the body covered three times the ground,
   * legs cycling as if nothing had changed under them. That reads as skating,
   * not lunging. Driving the SAME run clip faster for the burst's own duration
   * needs no new clip and keeps every leaping kind's stride honest about the
   * distance it is actually covering.
   *
   * `multiplier` is 1 to clear. Applied every frame in `update`, not just on
   * entry, so it survives `play("run")` no-oping once a chase is already
   * running (the state-change guard that stops a moving pack's footfalls from
   * resyncing every snapshot).
   */
  setLeaping(multiplier: number): void {
    this.leapMultiplier = multiplier;
  }

  /** Cancels a death pose so a respawned monster animates again. */
  revive(): void {
    this.oneShotUntil = 0;
    this.actions.get("die")?.stop();
    this.play("idle", true);
  }

  /**
   * HOW FAR THE POSE HAS ACTUALLY ADVANCED, as one number.
   *
   * `play` is written to be silent — it has six early returns and every one of
   * them is a deliberate no-op, because "the state you asked for is the state
   * you are in" is the common case and must not cost anything. The price is
   * that a state machine which has locked LOOKS EXACTLY LIKE one that is
   * correctly idle: `play("run")` is called every frame either way and returns
   * without a word either way.
   *
   * So the lock cannot be detected from the calls. It can be detected from the
   * RESULT — an actor whose body is translating while its pose is not moving is
   * sliding, and that is a fact about the mixer's own clocks, not about what
   * anybody asked for. Summing the running actions' times (weighted, so a
   * crossfade still reads as motion) gives one number that must change on any
   * frame where the character is genuinely animating.
   *
   * This is the same measurement M70.5's freeze verification used — sampling
   * `AnimationAction.time` across an interruption — turned from a test-only
   * probe into something the game can ask itself.
   */
  poseClock(): number {
    let sum = 0;
    for (const action of this.actions.values()) {
      if (!action.isRunning()) continue;
      sum += action.time * (1 + action.getEffectiveWeight());
    }
    return sum;
  }

  /**
   * Everything that decides whether `play` will do anything, for a log line.
   *
   * The whole reason the slide has survived two fixes is that when it happens
   * there is nothing to read: no throw, no warning, and a `?.` on the mixer
   * that makes even a missing rig silent. This is the state somebody would ask
   * for first, printed at the moment it is still true rather than reconstructed
   * afterwards.
   */
  animationState(): Record<string, unknown> {
    return {
      currentAnim: this.currentAnim,
      baseAnim: this.baseAnim,
      // The one value that can hold `busy` true forever, so it is the first
      // thing worth seeing. Printed as the sentinel's name rather than as
      // 9007199254740991, which reads as noise.
      oneShotUntil:
        this.oneShotUntil === Number.MAX_SAFE_INTEGER
          ? "MAX_SAFE_INTEGER (death pose, never expires)"
          : Math.round(this.oneShotUntil - performance.now()),
      busy: performance.now() < this.oneShotUntil,
      hasMixer: this.mixer !== null,
      hasInstance: this.instance !== null,
      bodyModel: this.bodyModel,
      boundActions: [...this.actions.keys()],
      runningActions: [...this.actions.entries()]
        .filter(([, a]) => a.isRunning())
        .map(([name, a]) => `${name}@${a.time.toFixed(2)}w${a.getEffectiveWeight().toFixed(2)}`),
    };
  }

  /**
   * Force the state machine back to a state that moves, from any lock.
   *
   * Deliberately not `revive()`: that one is for a monster whose death pose is
   * over and assumes the actor is otherwise healthy, so it plays "idle" and
   * trusts it. This is the last resort, and it clears every gate `play` can be
   * held by — the never-expiring one-shot, a clamped one-shot action still
   * holding weight, and a `currentAnim` that no longer matches anything running
   * — before asking for the base state with `immediate` so the identity guard
   * cannot swallow it too.
   *
   * Returns whether it had anything to play, so a caller can tell "recovered"
   * from "this rig has no clips at all", which are very different problems.
   */
  unstick(): boolean {
    this.oneShotUntil = 0;
    for (const action of this.actions.values()) action.stop();
    // `immediate` on purpose: it is what makes `play` skip the "you are already
    // in this state" guard, which after a lock is precisely the claim that is
    // wrong — `currentAnim` says run and nothing is running.
    const target = this.baseAnim === "die" ? "idle" : this.baseAnim;
    this.play(target, true);
    return this.actions.has(target);
  }

  update(dtSeconds: number): void {
    // The leap multiplier has to be re-applied every frame rather than only on
    // entry into "run": `play` no-ops on a state that is already current, which
    // is exactly the case for a chasing monster whose leap starts and ends
    // mid-run.
    if (this.currentAnim === "run") {
      this.actions.get("run")?.setEffectiveTimeScale(this.runTimeScale * this.leapMultiplier);
    }
    this.mixer?.update(dtSeconds);
    // After the mixer, because it reads the weights the mixer just advanced.
    this.applyGroundLift();
    this.applyEmissive();
    this.updateGlance();

    // Ease toward the server position. Snapshots arrive every ~100ms, so without
    // this every actor visibly steps rather than moves. Skipped entirely for the
    // local player — see `interpolate`.
    if (this.interpolate) {
      const p = this.root.position;
      const lerp = Math.min(1, dtSeconds * 12);
      p.x += (this.target.x - p.x) * lerp;
      p.y += (this.target.y - p.y) * lerp;
      p.z += (this.target.z - p.z) * lerp;
    } else {
      this.root.position.copy(this.target);
    }

    // Shortest-path turn, so facing never spins the long way round.
    let delta = this.targetFacing - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    // A glance is a slow head-turn; being knocked around or chasing something
    // is not. One rate for both made an idle creature snap round like a turret.
    const turnRate = this.idleFacing !== null ? 2.4 : 14;
    this.facing += delta * Math.min(1, dtSeconds * turnRate);
    this.pivot.rotation.y = this.facing + this.facingOffset;

    // Hand control back to idle/run once a one-shot has finished.
    if (this.oneShotUntil !== Number.MAX_SAFE_INTEGER && performance.now() >= this.oneShotUntil) {
      if (this.currentAnim === "attack" || this.currentAnim === "hit") {
        this.oneShotUntil = 0;
        this.play(this.baseAnim, false);
      }
    }
  }

  /**
   * Idle creatures look around. Nothing else in the world turns an actor that
   * is standing still — facing is only written when something moves — so a camp
   * that has never been disturbed holds whatever heading it spawned with,
   * forever, all of it identical.
   *
   * Deliberately a change of FACING rather than a second animation: it works on
   * every model in the game whatever clips its pack shipped with, and turning
   * to look at something is the single most legible thing an idle creature can
   * do.
   */
  private updateGlance(): void {
    if (!this.idleGlance) return;
    if (this.baseAnim !== "idle" || this.currentAnim === "die") {
      // Anything that moves or fights owns the facing again, and the next
      // glance is deferred so a monster does not turn away the instant it
      // stops chasing you. Walking counts: a townsperson mid-stride whose head
      // is being turned by the glance timer walks visibly sideways.
      this.idleFacing = null;
      this.nextGlanceAt = performance.now() + this.glanceDelay();
      return;
    }
    const now = performance.now();
    if (now < this.nextGlanceAt) return;
    this.nextGlanceAt = now + this.glanceDelay();

    // Around the heading it is already idling at, not around wherever it last
    // happened to face, so repeated glances wander instead of drifting off in
    // one direction.
    if (this.idleFacing === null) this.idleFacing = this.targetFacing;
    const swing = (Math.random() - 0.5) * 1.9;
    this.targetFacing = this.idleFacing + swing;
  }

  /** Seeded, so two monsters in a camp are never due to glance at once. */
  private glanceDelay(): number {
    return 2600 + this.variance * 3400 + Math.random() * 2600;
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.clearGear();
    this.root.removeFromParent();
    for (const m of this.ownedMaterials) m.dispose();
    this.ownedMaterials.clear();
    // Geometry is deliberately NOT disposed: `SkeletonUtils.clone` shares it
    // with the cached prototype, so freeing it here would force every future
    // actor of the same model to re-upload its buffers — and monsters are torn
    // down and rebuilt constantly as the player walks past their camps.
  }
}

/** Cheap structural compare, so an ITEMS_UPDATE that only changed a ring does
 *  not rebuild a rig. */
function sameAppearance(a: Appearance, b: Appearance): boolean {
  if (a.weaponType !== b.weaponType || a.weaponRarity !== b.weaponRarity) return false;
  const slots = new Set<string>([...Object.keys(a.layers), ...Object.keys(b.layers)]);
  for (const slot of slots) {
    const x = a.layers[slot as ItemSlot];
    const y = b.layers[slot as ItemSlot];
    if (!x || !y) return false;
    if (x.style !== y.style || x.rarity !== y.rarity) return false;
  }
  return true;
}
