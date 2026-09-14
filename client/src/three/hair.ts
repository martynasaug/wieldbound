// MODELLED HAIR, BEARDS AND BROWS, LOADED ONCE AND SHARED.
//
// Each piece is a GLB written by `tools/art/hair.py` or `tools/art/facial_hair.py`,
// modelled in Blender on the Monk's actual head. Its vertices are in the LOCAL
// space of the Monk's rigid head piece (`Monk001`), so the mesh is hung beside
// that piece with that piece's own transform and lands exactly where it was
// modelled, with no fitting done here.
//
// One geometry per file for the whole session, shared by every character who
// wears it; each wearer gets its own material, because hair colour is theirs.

import * as THREE from "three";

import type { BeardStyleId, HairStyleId } from "../../../shared/look";
import { loadModel } from "./assets";

const geometries = new Map<string, Promise<THREE.BufferGeometry | null>>();

/** A piece's geometry by file, or null if the file failed to load. */
function pieceGeometry(file: string): Promise<THREE.BufferGeometry | null> {
  let pending = geometries.get(file);
  if (!pending) {
    pending = loadModel(`hair/${file}.glb`)
      .then((group) => {
        let found: THREE.BufferGeometry | null = null;
        group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!found && mesh.isMesh) found = mesh.geometry;
        });
        if (!found) console.warn(`[look] ${file}: no mesh in the file`);
        return found;
      })
      .catch((err) => {
        console.warn(`[look] ${file}:`, err);
        return null;
      });
    geometries.set(file, pending);
  }
  return pending;
}

/**
 * The file behind each head piece a look can wear, or null for none.
 *
 * BROWS ARE NO LONGER A SLOT. They used to be hardcoded here to `Face_brows`,
 * drawn on every character whatever they chose. They are now part of the body:
 * `tools/art/base_body.py` grafts the Monk's nose and both brows onto the
 * skull's `Head` bone at export, because facial STRUCTURE is not a choice and a
 * character missing it reads as a blank rather than as bald. Asking for the
 * slot here as well would draw a second pair inside the first.
 *
 * THE BEARD FILES ARE THE PACK'S OWN NOW. `Beard_*.glb` and `Hair_*.glb` from
 * `hair.py`/`facial_hair.py` are modelled in the local frame of `Monk001` and
 * cannot be placed on this body — five derived constants tried and put hair in
 * the skull, at the ankles and underground. The harvested pieces are cut from
 * `Monk.001` by `tools/art/look_pieces.py` with their world transform baked in,
 * so they need no frame at all: see the attach site in `Actor.ts`.
 */
const HAIR_FILES: Record<string, string> = {
  // The Wizard's crest, swept back off the crown: 12 islands, 624 faces.
  swept: "Wizard_hair",
  // The Warrior's layered mop, locks reaching the jaw: 33 islands, 1392 faces.
  shaggy: "Warrior_hair",
};

const BEARD_FILES: Record<string, string> = {
  moustache: "Monk_moustache",
  monk: "Monk_beard",
  // The Wizard's beard arrives with its moustache already part of the same
  // island group, so it is one choice rather than two that can be combined.
  full: "Wizard_beard",
};

/**
 * WHICH HEAD EACH PIECE WAS CUT OFF, AND HOW BIG THAT HEAD WAS.
 *
 * Measured from the source files by `tools/art/skull_compare.py`, as the box of
 * the vertices each rig's `Head` bone dominates — not the mesh's own box, which
 * would include the shoulders. In the pack's own units, width x depth x height:
 *
 *     Rogue (the player)   0.670 x 0.814 x 0.890
 *     Monk                 0.668 x 0.812 x 0.887     the same head, to 0.3%
 *     Wizard               0.678 x 0.824 x 0.915     1-3% larger
 *     Warrior              0.571 x 0.760 x 0.811     15% NARROWER, 9% shorter
 *
 * THIS IS WHY THE WARRIOR'S HAIR NEVER SAT RIGHT. `look_pieces.py` opens by
 * asserting that these characters "all carry the same ~68-face head", and that
 * claim was made from FACE COUNTS — which cannot tell two heads of different
 * SIZE apart, because resizing a mesh does not change how many faces it has.
 * The Monk and the Wizard are close enough that the error hid; the Warrior is
 * not, and hair cut from it is a size too small for this skull.
 *
 * Stored as the scale that takes the donor's head to the player's, in the game's
 * axes (x across, y up, z forward), so the numbers can be applied directly.
 */
const DONOR: Record<string, "Monk" | "Wizard" | "Warrior"> = {
  Monk_moustache: "Monk",
  Monk_beard: "Monk",
  Monk_nose: "Monk",
  Wizard_beard: "Wizard",
  Wizard_hair: "Wizard",
  Warrior_hair: "Warrior",
};

const DONOR_SCALE: Record<string, [number, number, number]> = {
  Monk: [1.003, 1.003, 1.002],
  Wizard: [0.988, 0.973, 0.988],
  Warrior: [1.173, 1.097, 1.071],
};

/** Which of the pack's characters a piece was cut from, if it is known. */
export function donorOf(file: string): string | null {
  return DONOR[file] ?? null;
}

/** How the donor's head compares to the player's, for a piece file. */
export function donorScale(file: string): [number, number, number] {
  // An unlisted file is left at its authored size rather than guessed at. A
  // wrong scale is worse than none: it resizes art that may well have been cut
  // from this very head.
  const donor = DONOR[file];
  return donor ? DONOR_SCALE[donor] : [1, 1, 1];
}

/**
 * THE CALIBRATION IS THE MONK'S ALONE, and that is the measurement talking.
 *
 * `calibrate` derives its correction by comparing the nose baked onto the player
 * against the same nose cut loose for the creator. That reference is the MONK's
 * nose — `base_body.py` grafted the Monk's features onto the skull — so what it
 * measures is how far the graft moved them, and the answer only applies to
 * pieces that came off the same face.
 *
 * Applying it to everything was tried and is visible in the history of this
 * work: the Monk's moustache and beard snapped onto the lip and jaw, and the
 * Wizard's beard, which had been the ONE piece sitting correctly all along,
 * walked off the chin in the same instant. A correction that fixes two things
 * and breaks a third is not a correction, it is a second offset.
 *
 * The other donors need no correction because nothing moved their faces: they
 * were cut and worn in one frame. If a future body grafts a Wizard nose on,
 * this is where the second reference goes.
 */
export const CALIBRATION_DONOR = "Monk";

export function lookPieceFile(slot: "hair" | "beard", style?: HairStyleId | BeardStyleId): string | null {
  if (!style || style === "none") return null;
  // A style with no harvested art draws nothing, which is honest, rather than
  // falling back to a file authored for another rig — which is what put hair in
  // the skull, at the ankles and underground before these were cut.
  return (slot === "hair" ? HAIR_FILES : BEARD_FILES)[style] ?? null;
}

export function lookPieceGeometry(file: string | null): Promise<THREE.BufferGeometry | null> {
  return file ? pieceGeometry(file) : Promise.resolve(null);
}

/**
 * The bone every piece hangs from, and the offset that puts it in the frame it
 * was modelled in.
 *
 * A BONE RATHER THAN A MESH, because a mesh name is a property of one body and
 * the hair has now outlived two. Every piece here was modelled in the local
 * space of `Monk001` — the Monk's rigid head piece, parented to `Head` — and
 * hung beside it carrying that piece's own transform, so it landed exactly
 * where it was authored with nothing fitted at runtime. That worked precisely
 * while the player was the Monk.
 *
 * The player body is the stripped Rogue now, and its `PlayerBody` mesh is
 * SKINNED, parented to the armature rather than to a bone, carrying the whole
 * body's transform. Pointing the old mesh-name anchor at it made every piece
 * appear in the wrong place at the wrong offset — hair the size of the skull.
 *
 * Measured, the two heads are near enough the same size (Monk 0.751 x 0.815 x
 * 0.934, Rogue 0.670 x 0.814 x 0.890), so no rescaling is wanted. What differs
 * is where the frame sits: the Monk's head piece centred at world z 2.100 and
 * this skull centres at 2.501, against a `Head` bone running 2.127 to 2.756.
 * The offset below is that difference, in the bone's own axes.
 */
export const HAIR_ANCHOR_BONE = "Head";
/**
 * NOT AN OFFSET — THE HEAD PIECE'S WHOLE TRANSFORM, REPRODUCED.
 *
 * Three passes went into tuning a scalar here, and every one was two orders of
 * magnitude away from the number the geometry actually assumes. Measured at
 * last: `Hair_short.glb` is authored spanning y -3.002 to -2.242, centred near
 * y -2.62. That is not near any skull — it is the LOCAL FRAME of `Monk001`,
 * whose own local position is (0.001, -2.756, 0.003) on the `Head` bone. Each
 * piece was modelled in that frame and hung beside that mesh carrying its
 * transform wholesale, so it landed correctly with nothing fitted at runtime.
 *
 * Hanging the same geometry off the bone with a +-0.2 nudge could therefore
 * never work: it needed roughly -2.76, and I was adjusting the third decimal of
 * the wrong quantity. The fault was treating a frame mismatch as a distance.
 *
 * So this reproduces the head piece's transform, then corrects for the skulls
 * differing. Measured, in each rig's own space:
 *
 *     Monk001 piece   local (0.001, -2.756, 0.003), centred world z 2.100
 *     Rogue skull     centre 0.373 above the Head bone, crown 0.818 above
 *
 * The Monk's frame put the hair 0.373 - (2.100 - 2.127) = about 0.40 higher
 * relative to its bone than this skull wants, and hair caps a crown rather than
 * floating at a centre, so the y term carries the piece's own -2.756 plus the
 * crown difference.
 */
/**
 * AND THAT WAS THE FOURTH WRONG ANSWER, so this constant stops being tuned.
 *
 * Reproducing `Monk001`'s own -2.756 put the hair at world y 0.095 — on the
 * floor, at the character's ankles — because that translation lives in a frame
 * the MONK's rig provides, and reaching the world through this bone it is
 * multiplied by the instance scale of 0.607. Four values now (-0.401, -0.156,
 * +0.208, -1.938), each derived or tuned, each wrong, because the quantity is a
 * transform chain and I kept solving for a scalar.
 *
 * Zero is honest: the piece hangs at the bone with no invented correction, which
 * is visibly wrong rather than wrong in a way that looks deliberate. The real
 * fix is not here at all — this hair was modelled for the Monk's skull and the
 * pack ships `Face` meshes authored for THESE heads. Harvesting those as
 * character-creator options is the work, and it needs no fitting.
 *
 * FIVE VALUES, ALL WRONG, and the last is the one that settles the method
 * question: -0.401, -0.156, +0.208, -1.938, and finally the pack's own -2.756,
 * which put the hair BELOW THE GROUND at world y -0.403. That last one is the
 * tell. Every rigid head piece in this kit carries local (0.001, -2.756, 0.003)
 * on `Head` — but on the pack's own rigs, where the armature carries a scale of
 * 100. Reaching the world through this bone, which the loader has already scaled
 * to 0.607 to make the body player-height, the same number means something
 * entirely different.
 *
 * The lesson is not "try a sixth number". It is that a position in a transform
 * chain cannot be solved by substituting constants into one link of it. If this
 * ever does need placing rather than replacing, the local position should be
 * COMPUTED at attach time — bone.matrixWorld inverted against the skull's
 * measured crown — so the arithmetic happens once per body instead of once per
 * guess.
 */
export const HAIR_ANCHOR_OFFSET: [number, number, number] = [0, 0, 0];

export function hairMaterial(color: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    // Flat, like every other piece of the Monk: the export carries one normal
    // per face already, and smoothing would melt the clumps together.
    flatShading: true,
    // A lock seen from inside — under a fringe, inside a tail — must not be a hole.
    side: THREE.DoubleSide,
  });
}

/**
 * The one feature that exists both baked onto the body and cut as a loose piece,
 * which is what makes the two pipelines comparable. See `calibrate`.
 */
export const CALIBRATION_MESH = "Face_nose";
export const CALIBRATION_PIECE = "Monk_nose";
