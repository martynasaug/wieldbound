// Gear contact sheet — every body, weapon, armour style and rarity rendered
// side by side on one page.
//
// This is the 3D descendant of the 2D era's `tools/art/preview_doll.ps1`, and
// it exists for the same reason: alignment is the thing that goes wrong with a
// paperdoll, and alignment is invisible in a stat panel. Crucially it drives the
// *real* `Actor.setAppearance` path rather than a copy of it, so a helm that
// sits on a character's chin here sits on their chin in the game too.
//
// Not part of the game bundle: it is a separate Vite entry under `client/`,
// reached at http://localhost:5173/preview/ while the dev server is running.
//
//   ?sheet=weapons   the four class bodies and all eight weapon families
//   ?sheet=armour    every armour style, at every rarity
//   ?sheet=full      a full set per rarity, which is what a player actually sees
//
// and two modifiers, both of which earned their place while fitting the armour:
//
//   ?spin=<radians>  turn the characters — a cape is invisible from the front
//   ?hidebody=1      hide the body meshes, leaving only the gear. It is the only
//                    way to tell "this helm is too small" apart from "this helm
//                    is the right size but sunk inside the skull"

import * as THREE from "three";
import {
  GEAR_STYLES,
  RARITY_ORDER,
  RARITIES,
  WEAPONS,
  WEAPON_TYPES,
  classForWeapon,
  type Appearance,
  type GearStyle,
  type ItemRarity,
  type ItemSlot,
} from "../../shared/protocol-types";
import { ITEM_BASES } from "../../shared/items";
import { Actor } from "../src/three/Actor";

const CELL_PX = 260;
const CELL_HEIGHT_PX = 360;
const PLAYER_HEIGHT = 1.8;

interface Cell {
  title: string;
  subtitle: string;
  appearance: Appearance;
}

function layer(style: GearStyle, rarity: ItemRarity) {
  return { style, rarity };
}

/**
 * Every weapon in the catalogue, held.
 *
 * This is the sheet that matters most now: thirty-seven weapon bases are
 * twenty-three downloaded models fitted into a grip harvested off the rig, and
 * a fit that is wrong reads as a sword held by its blade — which is invisible
 * in a stat panel and obvious here.
 */
function weaponSheet(): Cell[] {
  const cells: Cell[] = [
    { title: "Fists", subtitle: "adventurer", appearance: { layers: {} } },
  ];
  for (const base of Object.values(ITEM_BASES)) {
    if (base.slot !== "weapon" || !base.weaponType) continue;
    cells.push({
      title: base.name,
      subtitle: `${classForWeapon(base.weaponType)} · band ${base.band} · ${base.art.palette}`,
      appearance: {
        weaponType: base.weaponType,
        weaponRarity: "honed",
        weaponBaseId: base.id,
        layers: {},
      },
    });
  }
  return cells;
}

/** Every off-hand, which hangs off a socket the pack never authored. */
function offhandSheet(): Cell[] {
  const cells: Cell[] = [];
  for (const base of Object.values(ITEM_BASES)) {
    if (base.slot !== "offhand") continue;
    for (const rarity of ["worn", "forged", "enchanted"] as ItemRarity[]) {
      cells.push({
        title: base.name,
        subtitle: `${rarity} · ${base.art.palette}`,
        appearance: {
          weaponType: "sword",
          weaponRarity: rarity,
          weaponBaseId: "armingsword",
          offhandBaseId: base.id,
          offhandRarity: rarity,
          layers: {},
        },
      });
    }
  }
  return cells;
}

/** One weapon through all seven qualities — the ladder, seen rather than read. */
function ladderSheet(): Cell[] {
  const cells: Cell[] = [];
  for (const baseId of ["claymore", "twinbite", "starcaller", "ruinstring"]) {
    const base = ITEM_BASES[baseId];
    for (const rarity of RARITY_ORDER) {
      cells.push({
        title: base.name,
        subtitle: RARITIES[rarity].name,
        appearance: {
          weaponType: base.weaponType,
          weaponRarity: rarity,
          weaponBaseId: base.id,
          layers: {},
        },
      });
    }
  }
  return cells;
}

/**
 * Every armour piece in the catalogue, worn.
 *
 * Driven off the catalogue rather than off a style list, because styles are no
 * longer rolled — a base item declares the shape it is. So this sheet is now
 * literally "every wearable thing in the game", which is what it always meant
 * to be.
 */
function armourSheet(): Cell[] {
  const cells: Cell[] = [];
  for (const base of Object.values(ITEM_BASES)) {
    if (!base.style || base.slot === "weapon" || base.slot === "offhand") continue;
    for (const rarity of ["worn", "forged", "enchanted"] as ItemRarity[]) {
      cells.push({
        title: base.name,
        subtitle: `${base.slot} · ${base.style} · ${rarity}`,
        appearance: { layers: { [base.slot]: layer(base.style, rarity) } },
      });
    }
  }
  return cells;
}

function fullSheet(): Cell[] {
  const sets: [string, Partial<Record<ItemSlot, GearStyle>>][] = [
    ["scout", { helm: "cap", armor: "leather", boots: "low" }],
    ["skirmisher", { helm: "hood", armor: "chain", boots: "tall", cape: "cape" }],
    ["knight", { helm: "full", armor: "plate", boots: "tall", cape: "cape" }],
    ["magus", { helm: "hood", armor: "robe", boots: "low", cape: "cape" }],
  ];
  const weapons: (typeof WEAPON_TYPES)[number][] = ["sword", "bow", "axe", "staff"];
  const cells: Cell[] = [];
  for (const rarity of RARITY_ORDER) {
    sets.forEach(([name, pieces], i) => {
      const layers: Appearance["layers"] = {};
      for (const [slot, style] of Object.entries(pieces) as [ItemSlot, GearStyle][]) {
        layers[slot] = layer(style, rarity);
      }
      cells.push({
        title: name,
        subtitle: `${rarity} · ${weapons[i]}`,
        appearance: { weaponType: weapons[i], weaponRarity: rarity, layers },
      });
    });
  }
  return cells;
}

const SHEETS: Record<string, () => Cell[]> = {
  weapons: weaponSheet,
  offhand: offhandSheet,
  ladder: ladderSheet,
  armour: armourSheet,
  full: fullSheet,
};

async function run(): Promise<void> {
  const which = new URLSearchParams(location.search).get("sheet") ?? "full";
  const spin = Number(new URLSearchParams(location.search).get("spin") ?? "0");
  const hideBody = new URLSearchParams(location.search).get("hidebody") === "1";
  const cells = (SHEETS[which] ?? fullSheet)();

  const columns = Math.min(6, Math.max(4, Math.ceil(Math.sqrt(cells.length * 1.4))));
  const rows = Math.ceil(cells.length / columns);
  const width = columns * CELL_PX;
  const height = rows * CELL_HEIGHT_PX;

  const sheet = document.getElementById("sheet")!;
  sheet.style.width = `${width}px`;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x191308);
  renderer.shadowMap.enabled = true;
  sheet.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x4a3a24, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d0, 2.2);
  key.position.set(3, 6, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb6ff, 0.9);
  rim.position.set(-4, 3, -5);
  scene.add(rim);

  // One camera per cell via viewport scissoring, so every character is framed
  // identically instead of shrinking as the grid grows.
  const camera = new THREE.PerspectiveCamera(26, CELL_PX / CELL_HEIGHT_PX, 0.1, 100);

  const actors: { actor: Actor; index: number }[] = [];
  await Promise.all(
    cells.map(async (cell, index) => {
      const actor = new Actor({ model: "Monk", height: PLAYER_HEIGHT });
      actor.setAppearance(cell.appearance);
      await actor.load();
      // Spread the cells apart in world space; the scissor picks one at a time,
      // but keeping them separated means no cell can leak into its neighbour.
      actor.snapTo(index * 100, 0, 0);
      actor.faceDirection(Math.sin(spin), Math.cos(spin));
      if (hideBody) {
        actor.root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && !mesh.name.startsWith("gear_") && !mesh.name.startsWith("weapon_")) {
            mesh.visible = false;
          }
        });
      }
      scene.add(actor.root);
      actors.push({ actor, index });

      const label = document.createElement("div");
      label.className = "label";
      label.style.left = `${(index % columns) * CELL_PX + CELL_PX / 2}px`;
      label.style.top = `${Math.floor(index / columns) * CELL_HEIGHT_PX + CELL_HEIGHT_PX - 46}px`;
      label.innerHTML = `<b>${cell.title}</b><span>${cell.subtitle}</span>`;
      sheet.appendChild(label);
    }),
  );

  // Ground discs, so boots have something to stand on and shadows land.
  for (const { index } of actors) {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x3b3020, roughness: 1 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(index * 100, 0, 0);
    scene.add(disc);
  }

  renderer.setScissorTest(true);
  // Each cell is its own render pass into its own scissor box. Three's
  // automatic clear would wipe the whole canvas at the start of every one of
  // them, leaving only the last cell drawn — so the frame is cleared once,
  // by hand, and the passes then accumulate.
  renderer.autoClear = false;
  const clock = new THREE.Clock();
  let framesRendered = 0;

  function frame(): void {
    const dt = Math.min(0.05, clock.getDelta());
    for (const { actor } of actors) actor.update(dt);

    renderer.setScissor(0, 0, width, height);
    renderer.setViewport(0, 0, width, height);
    renderer.clear();

    for (const { actor, index } of actors) {
      const cx = (index % columns) * CELL_PX;
      // WebGL's origin is bottom-left; the grid is laid out top-down.
      const cy = height - (Math.floor(index / columns) + 1) * CELL_HEIGHT_PX;
      renderer.setScissor(cx, cy, CELL_PX, CELL_HEIGHT_PX);
      renderer.setViewport(cx, cy, CELL_PX, CELL_HEIGHT_PX);
      camera.position.set(actor.position.x + 1.6, 1.5, 4.2);
      camera.lookAt(actor.position.x, 0.95, 0);
      renderer.render(scene, camera);
    }

    framesRendered++;
    // Give the mixers a few frames to settle into the idle pose before the
    // screenshot is taken, then say so.
    if (framesRendered > 30) {
      (window as unknown as Record<string, unknown>).__previewReady = true;
    }
    requestAnimationFrame(frame);
  }
  frame();

  (window as unknown as Record<string, unknown>).__preview = { actors, cells, GEAR_STYLES };
  (window as unknown as Record<string, unknown>).__THREE__ = THREE;
}

void run().catch((e) => {
  document.body.innerHTML = `<pre style="color:#f88">${String(e)}\n${(e as Error).stack}</pre>`;
  (window as unknown as Record<string, unknown>).__previewReady = true;
});
