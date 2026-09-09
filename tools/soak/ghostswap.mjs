// DOES THE OLD WEAPON'S GHOST LEAVE WITH IT?
//
// Reported from a live session: hold a staff, switch to a bow, and the staff is
// still there — see-through but visible, so it looks like both weapons at once.
//
// That is the silhouette pass. `ghostFor` and `rimFor` parent their hull to
// `mesh.parent`, which for a held weapon is the HAND BONE, so the hull is a
// sibling of the weapon rather than a child. `clearGear` removes the weapon and
// then keeps every hull whose parent is still non-null — all of them — and the
// builders only ever ran from `finishBody`, so a weapon swap rebuilt nothing.
//
// Counted rather than looked at, because a ghost drawn through the world is
// hard to be sure about in a screenshot and trivial to count in the graph: every
// hull uses the actor's one silhouette or outline material, so anything wearing
// it that is not the current gear is a leftover.
//
//   node tools/soak/ghostswap.mjs Armoury
import { open, login } from "./driver.mjs";

const { browser, page } = await open({ headless: true, width: 900, height: 700 });
await login(page, process.argv[2] ?? "Armoury");
await page.waitForTimeout(1500);

const census = () =>
  page.evaluate(() => {
    const g = window.__wieldbound;
    const a = g.localActor;
    const held = new Set();
    for (const h of a.held ?? []) h.traverse((c) => held.add(c));
    let ghosts = 0;
    let ghostNames = [];
    a.root.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      if (m !== a.silhouetteMaterial && m !== a.outlineMaterial) return;
      ghosts++;
      // A hull's geometry is shared with the mesh it mirrors, so the source can
      // be named even though the hull itself is anonymous.
      let src = "(body)";
      a.root.traverse((c) => {
        if (c !== o && c.isMesh && c.geometry === o.geometry && c.name) src = c.name;
      });
      ghostNames.push(src);
    });
    return {
      trackedGhosts: (a.silhouettes ?? []).length,
      trackedRims: (a.rims ?? []).length,
      held: [...held].filter((c) => c.name?.startsWith("held_")).map((c) => c.name),
      ghosts,
      ghostNames: [...new Set(ghostNames)],
    };
  });

const equip = async (weaponType) => {
  await page.evaluate(async (w) => {
    const g = window.__wieldbound;
    const it = g.items.find((i) => i.slot === "weapon" && i.weaponType === w && !i.equipped);
    if (it) g.socket.sendEquipItem(it.id);
    await new Promise((r) => setTimeout(r, 1800));
  }, weaponType);
  await page.waitForTimeout(700);
};

for (const w of ["staff", "bow", "sword", "dagger"]) {
  await equip(w);
  const c = await census();
  const stale = c.ghostNames.filter((n) => n.startsWith("held_") && !c.held.includes(n));
  console.log(
    `holding ${w.padEnd(7)} weapons=[${c.held.join(",") || "none"}]  hullsInGraph=${c.ghosts} tracked=${c.trackedGhosts}+${c.trackedRims}` +
      (stale.length ? `   STALE: ${stale.join(",")}` : "   no stale hulls"),
  );
}
await browser.close();
