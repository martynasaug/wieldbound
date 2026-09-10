// WHICH WAY IS THE BLADE POINTING *DURING THE SWING*?
//
// `weaponfacing.mjs` answers this for the idle pose and finds nothing pointing
// at the player. But idle is the one pose the character spends the least
// interesting time in, and it is the only one that had ever been measured or
// photographed: `weapongrip.mjs` deliberately captures a character standing
// alone and still, because that is how you judge a grip.
//
// A swing is a different question. The weapon is carried through an arc by the
// hand bone, and if a model is socketed backwards the arc is where it shows —
// the edge leads from the wrong side, or the point passes through the character
// on the way round. Nothing here had ever sampled it.
//
// So: hold each weapon, throw an attack, and sample the tip direction across
// the whole animation rather than at one instant. Reported as the WORST frame,
// because a blade that points at its owner for a fifth of a swing is still
// wrong however good the other four fifths are.
//
// Forward is the PIVOT's +Z. See the long note in `weaponfacing.mjs`: the actor
// root carries no facing at all, and building a forward vector from it reports
// every weapon backwards including the donor sword.
//
//   node tools/soak/weaponswing.mjs Armoury
import { open, login } from "./driver.mjs";
import { ITEM_BASES } from "../../shared/items.ts";

const NAME = process.argv[2] ?? "Armoury";
const SAMPLES = 14;
const GAP_MS = 60;

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, NAME);
await page.evaluate(() => window.__wieldbound.world.dayNight.freeze(0.5));
await page.waitForTimeout(1200);

const owned = await page.evaluate(() =>
  window.__wieldbound.items
    .filter((i) => i.slot === "weapon")
    .map((i) => ({ id: i.id, baseId: i.baseId })),
);
const key = (b) => `${b?.art?.model ?? b?.art?.build ?? "?"}|${b?.art?.lay ?? "along"}`;
const seen = new Set();
const toCheck = [];
for (const it of owned) {
  const k = key(ITEM_BASES[it.baseId]);
  if (seen.has(k)) continue;
  seen.add(k);
  toCheck.push({ ...it, key: k });
}
console.log(`${toCheck.length} distinct weapon models, sampled ${SAMPLES}x through a swing\n`);

const rows = [];
for (const item of toCheck) {
  const r = await page.evaluate(
    async (args) => {
      const { it, samples, gap } = args;
      const g = window.__wieldbound;
      g.socket.sendEquipItem(it.id);
      await new Promise((res) => setTimeout(res, 1500));

      const actor = g.localActor;
      let object = null;
      for (const h of actor?.held ?? []) {
        h.traverse((c) => {
          if (!object && c.name === `held_${it.baseId}`) object = h;
        });
      }
      if (!object) return { ok: false };

      // Throw a real attack rather than posing the clip by hand, so what is
      // sampled is what a player sees.
      actor.play("attack", true);

      const out = [];
      for (let i = 0; i < samples; i++) {
        await new Promise((res) => setTimeout(res, gap));
        object.updateWorldMatrix(true, true);
        const p = object.parent;
        p.updateWorldMatrix(true, false);
        const hand = {
          x: p.matrixWorld.elements[12],
          y: p.matrixWorld.elements[13],
          z: p.matrixWorld.elements[14],
        };
        let far = null;
        let farD = -1;
        object.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox;
          for (const cx of [bb.min.x, bb.max.x])
            for (const cy of [bb.min.y, bb.max.y])
              for (const cz of [bb.min.z, bb.max.z]) {
                const e = o.matrixWorld.elements;
                const wx = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
                const wy = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
                const wz = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
                const d = Math.hypot(wx - hand.x, wy - hand.y, wz - hand.z);
                if (d > farD) { farD = d; far = { x: wx, y: wy, z: wz }; }
              }
        });
        if (!far) continue;
        const pivot = actor.pivot ?? actor.root;
        pivot.updateWorldMatrix(true, false);
        const e = pivot.matrixWorld.elements;
        const fwd = { x: e[8], y: e[9], z: e[10] };
        const fl = Math.hypot(fwd.x, fwd.y, fwd.z) || 1;
        const v = { x: far.x - hand.x, y: far.y - hand.y, z: far.z - hand.z };
        const vl = Math.hypot(v.x, v.y, v.z) || 1;
        out.push(((v.x * fwd.x + v.y * fwd.y + v.z * fwd.z) / fl) / vl);
      }
      return { ok: true, forwards: out, anim: actor.currentAnim };
    },
    { it: item, samples: SAMPLES, gap: GAP_MS },
  );

  if (!r.ok) {
    console.log(`  ${item.key.padEnd(34)} NOT HELD`);
    continue;
  }
  const worst = Math.min(...r.forwards);
  const best = Math.max(...r.forwards);
  rows.push({ key: item.key, worst, best, anim: r.anim });
}
await browser.close();

rows.sort((a, b) => a.worst - b.worst);
console.log("model (lay)                        worst   best   verdict");
for (const r of rows) {
  const verdict =
    r.worst < -0.4 ? "BACKWARDS at some point in the swing" :
    r.worst < -0.1 ? "grazes backwards" : "stays forward";
  console.log(
    `  ${r.key.padEnd(33)} ${r.worst.toFixed(2).padStart(5)}  ${r.best.toFixed(2).padStart(5)}   ${verdict}`,
  );
}
const bad = rows.filter((r) => r.worst < -0.4);
console.log(`\n${bad.length} of ${rows.length} point at the player at some point in the swing.`);
