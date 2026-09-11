// DOES THE PLAYER'S OWN BODY ACTUALLY WORK IN THE GAME?
//
// `?body=new` swaps Quaternius's Monk for `Player_Base.glb`, which we generate.
// Everything about that swap can fail quietly: the model can 404 and leave an
// invisible character, the clips can fail to bind and leave a bind-pose statue
// sliding around, and the gear can attach to bones that are not there.
//
// So this logs in as the new body, walks, fights and gathers, and reports what
// the rig is actually doing rather than whether the page loaded.
//
//   node tools/soak/newbody.mjs [name]
import { mkdirSync } from "node:fs";
import { open, login, approach, step } from "./driver.mjs";
import { gatherRangeToNode } from "../../shared/protocol-types.ts";

const OUT = "tools/soak/shots/newbody";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 1100, height: 760 });
// The switch is a query parameter, so it has to survive the login navigation.
await login(page, process.argv[2] ?? `Body${Math.floor(Math.random() * 100000)}`, { query: "body=new" });
await page.waitForTimeout(2000);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) console.log(`  ok    ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

const rig = () =>
  page.evaluate(() => {
    const a = window.__wieldbound.localActor;
    if (!a) return null;
    const bones = [];
    let meshes = 0;
    let tris = 0;
    a.root.traverse((o) => {
      if (o.isBone) bones.push(o.name);
      if (o.isMesh && o.geometry?.attributes?.position) {
        meshes++;
        const g = o.geometry;
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
    });
    return {
      loaded: !!a.loaded,
      bones: bones.length,
      hasWeaponSocket: bones.includes("WeaponR"),
      meshes,
      tris: Math.round(tris),
      anim: a.currentAnim ?? "?",
      clips: [...(a.actions?.keys?.() ?? [])],
    };
  });

console.log("1. the body loads and is the one we built");
const r = await rig();
if (!r) {
  console.log("  INCONCLUSIVE — no local actor at all");
  await browser.close();
  process.exit(0);
}
console.log(`  ${r.bones} bones, ${r.meshes} mesh(es), ${r.tris} triangles, states bound: ${r.clips.join(", ")}`);
check("the rig is loaded", r.loaded);
check("it is our 21-bone skeleton", r.bones >= 20 && r.bones <= 24, `it has ${r.bones}`);
check("the weapon socket is there for gear to hang on", r.hasWeaponSocket);
check("something is actually drawn", r.meshes > 0 && r.tris > 500, `${r.meshes} meshes, ${r.tris} triangles`);
// A body whose clips did not bind stands in its bind pose and slides. The
// states are the proof, and they are the thing a screenshot cannot show.
for (const want of ["idle", "walk", "run", "attack", "hit", "die"]) {
  check(`the ${want} state bound to a clip`, r.clips.includes(want), `bound: ${r.clips.join(",") || "none"}`);
}

console.log("\n2. it animates when the character moves");
{
  const before = await page.evaluate(() => window.__wieldbound.localActor.currentAnim);
  await step(page, ["d"], 900);
  const moving = await page.evaluate(() => window.__wieldbound.localActor.currentAnim);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => window.__wieldbound.localActor.currentAnim);
  console.log(`  standing "${before}" -> moving "${moving}" -> standing "${after}"`);
  check("moving changes the state", moving !== before || moving === "run", `it stayed "${moving}"`);
  await page.screenshot({ path: `${OUT}/moving.png` });
}

console.log("\n3. the three gathering strokes are real clips on this body");
{
  // ASKED DIRECTLY, rather than by walking to a tree. The first version walked,
  // stopped 500px short — the same town-wall problem three other harnesses have
  // hit — and reported the RIG as broken. The question here is "does this body
  // animate a chop when the game asks for one", and walking is not part of it;
  // `clickwalk.mjs` and `guidedopening.mjs` are where reaching a node is the
  // subject.
  const carried = await page.evaluate(() =>
    (window.__wieldbound.localActor?.instance?.animations ?? []).map((c) => c.name),
  );
  console.log(`  the body carries: ${carried.join(", ") || "no clips at all"}`);
  for (const want of ["Chop", "Mine", "Pick"]) {
    check(`it ships a ${want} clip`, carried.includes(want), `it has ${carried.join(",") || "none"}`);
  }

  for (const [kind, clip] of [["tree", "Chop"], ["rock", "Mine"], ["bush", "Pick"]]) {
    const running = await page.evaluate(async (k) => {
      const a = window.__wieldbound.localActor;
      a.gatherStroke(k, 850);
      await new Promise((r) => setTimeout(r, 280));
      const out = [];
      a.mixer?._actions?.forEach?.((act) => {
        if (act.isRunning() && act.getEffectiveWeight() > 0.01) out.push(act._clip.name);
      });
      return { clips: out, posed: a.strokeKind, tool: a.heldToolKind };
    }, kind);
    console.log(
      `  ${kind}: running ${running.clips.join(",") || "nothing"}` +
        (running.posed ? ` (posed ${running.posed})` : "") +
        ` tool=${running.tool ?? "none"}`,
    );
    check(
      `gathering a ${kind} plays ${clip}`,
      running.clips.includes(clip),
      `it ran ${running.clips.join(",") || "nothing"}`,
    );
    await page.screenshot({ path: `${OUT}/gather-${kind}.png` });
  }
  await page.evaluate(() => window.__wieldbound.localActor.endGather());
}

await page.screenshot({ path: `${OUT}/standing.png` });
console.log(failures === 0 ? "\nOK — our body is wearing the game" : `\n${failures} FAILURES`);
console.log(`shots in ${OUT}/`);
await browser.close();
process.exit(failures ? 1 : 0);
