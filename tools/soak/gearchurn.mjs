// DOES ANYTHING BUILD UP WHEN YOU CHANGE YOUR GEAR A HUNDRED TIMES?
//
// Three bugs in a row this week lived in a TRANSITION rather than in a state:
// the previous weapon's silhouette staying on the bone after a swap, the
// outline passes building hulls of each other every time they rebuilt, and a
// dagger's length being wrong only because `fitToGrip` had normalised it. Every
// capture tool here logs in clean and photographs one thing, which is precisely
// the case where none of those exist.
//
// So this does the opposite on purpose: churn every slot, over and over, and
// then ask whether the actor is carrying more than it should.
//
// WHAT IS COUNTED, and why each one is a leak worth catching:
//
//   held        objects in the hands. More than two means a weapon did not
//               leave when the next one arrived.
//   worn        armour pieces. Same rule, per slot.
//   hulls       silhouette and outline meshes. These are siblings of the gear
//               on the bone rather than children, so removing gear does not
//               remove them, and they are what made a swapped-away staff hang
//               around see-through.
//   materials   the actor's own cloned materials. `clearGear` disposes these;
//               if the count climbs, something is being cloned and not freed.
//
// A baseline is taken after the first swap rather than at login, because the
// first dress legitimately adds things. Everything after it should be flat.
//
//   node tools/soak/gearchurn.mjs Armoury 40
import { open, login } from "./driver.mjs";

const NAME = process.argv[2] ?? "Armoury";
const ROUNDS = Number(process.argv[3] ?? 40);

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, NAME);
await page.waitForTimeout(1500);

const census = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    const a = g.localActor;
    let hulls = 0;
    a.root.traverse((o) => {
      if (o.isMesh && (o.material === a.silhouetteMaterial || o.material === a.outlineMaterial)) hulls++;
    });
    let gearMeshes = 0;
    a.root.traverse((o) => {
      if (o.isMesh && typeof o.name === "string" && (o.name.startsWith("held_") || o.name.startsWith("gear_"))) gearMeshes++;
    });
    return {
      held: (a.held ?? []).length,
      worn: (a.worn ?? []).length,
      hulls,
      gearMeshes,
      materials: (a.ownedMaterials ?? new Set()).size ?? 0,
      programs: g.world.renderer.info.programs.length,
      geometries: g.world.renderer.info.memory.geometries,
    };
  });

/** One full change of everything that can be changed. */
const churn = async () => {
  await page.evaluate(async () => {
    const g = window.__wieldbound;
    const slots = ["weapon", "offhand", "helm", "armor", "boots", "cape", "ring"];
    for (const slot of slots) {
      const spare = g.items.filter((i) => i.slot === slot && !i.equipped);
      if (spare.length === 0) continue;
      const pick = spare[Math.floor(Math.random() * spare.length)];
      g.socket.sendEquipItem(pick.id);
      await new Promise((r) => setTimeout(r, 260));
    }
  });
  await page.waitForTimeout(900);
};

await churn();
const base = await census();
console.log(`baseline after one full change: ${JSON.stringify(base)}\n`);

for (let i = 1; i <= ROUNDS; i++) {
  await churn();
  if (i % 10 === 0 || i === ROUNDS) {
    const c = await census();
    console.log(
      `round ${String(i).padStart(3)}  held=${c.held} worn=${c.worn} hulls=${c.hulls} ` +
        `gearMeshes=${c.gearMeshes} materials=${c.materials} programs=${c.programs} geo=${c.geometries}`,
    );
  }
}

const end = await census();
await browser.close();

console.log("");
const grew = [];
for (const k of ["held", "worn", "hulls", "gearMeshes", "materials"]) {
  // A little slack: a swap can legitimately land mid-flight when the census is
  // taken, which shows as one extra of something.
  if (end[k] > base[k] + 2) grew.push(`${k} ${base[k]} -> ${end[k]}`);
}
console.log(
  grew.length
    ? `LEAK after ${ROUNDS} full gear changes: ${grew.join(", ")}`
    : `nothing accumulated across ${ROUNDS} full gear changes.`,
);
console.log(`programs ${base.programs} -> ${end.programs}, geometries ${base.geometries} -> ${end.geometries}`);
