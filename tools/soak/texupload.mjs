// WHICH TEXTURES ARE UPLOADED MID-SESSION, BY NAME.
//
// The remaining stall is a `render`-section hitch carrying `uploads=+4tex` —
// four textures uploaded on exactly the frame that spiked, 83ms and 147ms in a
// clean 16-minute run. Two guesses at the cause have now been wrong: warming the
// gear with a draw (`warmBuffers`) and warming it with `initTexture` both left
// the signature unchanged, which means the textures are not the gear's.
//
// So stop guessing and name them. three.js registers a texture with the renderer
// the first time it uploads one, and it does that by adding a 'dispose' listener
// to it (`WebGLTextures.initTexture`) — the same mechanism that made the
// geometry leak findable. Hooking `addEventListener` on the texture prototype
// therefore fires exactly once per texture, AT THE MOMENT OF UPLOAD, and a stack
// trace taken there names the code that caused it.
//
// Each upload is reported with whatever identity the texture has — its `name`,
// its image's `src`, its dimensions — plus which meshes in the scene reference
// it, which is usually the answer on its own.

import { open, login, hotbarKeys, step, nearestMonster, keysToward, insideTown, gateWaypoint } from "./driver.mjs";

const NAME = process.argv[2] ?? "Player3619";
const MINUTES = Number(process.argv[3] ?? 12);

const SPAWN = { x: 8000, y: 6000 };
const CAMPS = [
  [1320, 0], [1600, 45], [1900, 100], [1600, 135], [2000, 160], [1320, 180],
  [1900, 200], [1600, 225], [2450, 250], [1900, 280], [1600, 315], [2350, 310],
].map(([r, deg]) => {
  const a = (deg * Math.PI) / 180;
  return { x: SPAWN.x + Math.cos(a) * r, y: SPAWN.y + Math.sin(a) * r };
});

const INSTALL = () => {
  const g = window.__wieldbound;
  window.__texUploads = [];

  // WHO MADE THE IMAGE. The upload stack is always the same generic draw path
  // (`WebGLUniforms.upload -> setTexture2D -> uploadTexture`), which says when a
  // texture reached the GPU and nothing about where it came from. A texture
  // backed by a canvas can be traced, though: tag every canvas with the stack
  // that created it and the texture inherits an origin.
  const origCreate = document.createElement.bind(document);
  document.createElement = function (tag, ...rest) {
    const el = origCreate(tag, ...rest);
    if (String(tag).toLowerCase() === "canvas") {
      try {
        el.__wbStack = (new Error().stack || "").split("\n").slice(2, 7).map((s) => s.trim()).join(" | ");
      } catch {
        /* a frozen element is not worth failing the run over */
      }
    }
    return el;
  };

  // Texture.prototype, found by what it owns rather than by class name —
  // esbuild's pre-bundle renames classes.
  let proto = null;
  g.world.scene.traverse((o) => {
    if (proto || !o.material) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    for (const v of Object.values(m)) {
      if (v && v.isTexture) {
        let p = Object.getPrototypeOf(v);
        while (p && !Object.prototype.hasOwnProperty.call(p, "updateMatrix")) p = Object.getPrototypeOf(p);
        if (p) proto = p;
        break;
      }
    }
  });
  if (!proto) return { ok: false, why: "Texture.prototype not found" };

  // EventDispatcher.addEventListener lives further up the chain.
  let evProto = proto;
  while (evProto && !Object.prototype.hasOwnProperty.call(evProto, "addEventListener")) {
    evProto = Object.getPrototypeOf(evProto);
  }
  if (!evProto) return { ok: false, why: "addEventListener not found on the chain" };

  const orig = evProto.addEventListener;
  evProto.addEventListener = function (type, listener) {
    // A 'dispose' listener added to a TEXTURE is the renderer taking ownership,
    // which is to say uploading it. Anything else on the chain is not ours.
    if (type === "dispose" && this && this.isTexture) {
      const img = this.image;
      window.__texUploads.push({
        t: performance.now(),
        name: this.name || "(unnamed)",
        src: img && (img.src || img.currentSrc) ? String(img.src || img.currentSrc).slice(-70) : null,
        size: img && img.width ? `${img.width}x${img.height}` : null,
        // What KIND of thing is backing this texture, and where did it come
        // from. `imageStack` is only present for canvas-backed textures, which
        // is exactly the case the generic upload stack cannot explain.
        imageType: img ? img.constructor?.name ?? typeof img : "(none)",
        imageStack: img && img.__wbStack ? img.__wbStack : null,
        ctor: this.constructor?.name ?? "?",
        uuid: this.uuid.slice(0, 8),
        stack: (new Error().stack || "").split("\n").slice(2, 7).map((s) => s.trim()).join(" | "),
      });
    }
    return orig.call(this, type, listener);
  };

  // Who references a given texture uuid, answered on demand.
  window.__texOwners = (uuid) => {
    const owners = [];
    g.world.scene.traverse((o) => {
      const mesh = o;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        for (const [slot, v] of Object.entries(m)) {
          if (v && v.isTexture && v.uuid.slice(0, 8) === uuid) {
            owners.push(`${o.name || o.type}.${slot}`);
          }
        }
      }
    });
    return [...new Set(owners)].slice(0, 6);
  };
  return { ok: true };
};

const me = (page) =>
  page.evaluate(() => ({ x: window.__wieldbound.playerX, y: window.__wieldbound.playerY }));

const run = async () => {
  const { browser, page } = await open({ headless: false });
  const hitches = [];
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[hitch]") && !t.includes("BETWEEN")) hitches.push({ at: Date.now(), text: t.slice(0, 240) });
  });

  await login(page, NAME);
  const installed = await page.evaluate(INSTALL);
  console.log("tracker:", JSON.stringify(installed));
  if (!installed.ok) {
    await browser.close();
    process.exit(1);
  }
  const keys = await hotbarKeys(page);
  const t0 = Date.now();
  const endAt = t0 + MINUTES * 60000;
  let i = 0;
  let swings = 0;

  while (Date.now() < endAt) {
    const wp = CAMPS[i++ % CAMPS.length];
    const until = Date.now() + 22000;
    let sign = 1;
    while (Date.now() < until) {
      const p = await me(page);
      if (Math.hypot(wp.x - p.x, wp.y - p.y) < 280) break;
      const aim = insideTown(p) && !insideTown(wp) ? gateWaypoint(p) : wp;
      const dirs = keysToward(p, aim);
      const r = await step(page, dirs, 600);
      if (r.moved < 25) {
        await step(page, [sign > 0 ? "d" : "a"], 900);
        sign = -sign;
      }
    }
    const fightUntil = Date.now() + 22000;
    while (Date.now() < fightUntil) {
      const t = await nearestMonster(page);
      if (t && t.d > 240) {
        const p = await me(page);
        await step(page, keysToward(p, t), 600);
        continue;
      }
      swings++;
      const strafe = step(page, [swings % 2 ? "a" : "d"], 700);
      for (const k of keys) {
        await page.keyboard.press(k);
        await page.waitForTimeout(80);
      }
      await strafe;
    }
  }

  const uploads = await page.evaluate(() => window.__texUploads);
  // Uploads that happened well after the load are the interesting ones.
  const loadCutoffMs = 25000;
  const late = uploads.filter((u) => u.t > loadCutoffMs);
  console.log(`\n=== ${uploads.length} texture uploads total, ${late.length} after the first 25s ===`);
  console.log(`swings=${swings}, frame-cost hitches=${hitches.length}\n`);

  for (const h of hitches) console.log(`HITCH  ${h.text}`);

  // THE QUESTION THAT DECIDES WHAT THIS IS. Every upload here is three.js
  // registering a texture it had not registered a moment ago. If each one is a
  // DIFFERENT texture, something is creating them and the count would climb —
  // but `info.memory.textures` sits flat around 250, so it cannot be that alone.
  // If the same uuid appears repeatedly, the texture is being disposed and
  // re-uploaded over and over, which is pure waste and the actual finding.
  const byUuid = new Map();
  for (const u of late) byUuid.set(u.uuid, (byUuid.get(u.uuid) ?? 0) + 1);
  const repeats = [...byUuid.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  console.log(`distinct textures among the ${late.length} late uploads: ${byUuid.size}`);
  console.log(`textures uploaded more than once: ${repeats.length}`);
  for (const [uuid, n] of repeats.slice(0, 10)) {
    const sample = late.find((u) => u.uuid === uuid);
    console.log(`   ${uuid} uploaded ${n}x  size=${sample?.size ?? "?"} name=${sample?.name}`);
  }

  console.log(`\n--- late uploads, grouped by where they came from ---`);
  // Grouped by what BACKS the texture rather than by the draw that uploaded it:
  // the upload stack is identical for everything and explains nothing.
  const byOrigin = new Map();
  for (const u of late) {
    const key = `${u.ctor} <- ${u.imageType} ${u.size ?? ""} ${u.src ?? ""}\n        created at: ${u.imageStack ?? "(not a canvas — no creation stack)"}`;
    byOrigin.set(key, (byOrigin.get(key) ?? 0) + 1);
  }
  console.log(`\n--- late uploads, grouped by what backs the texture ---`);
  for (const [k, n] of [...byOrigin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`\n  ${n}x  ${k}`);
  }

  const byStack = new Map();
  for (const u of late) {
    const key = u.stack;
    const rec = byStack.get(key) ?? { n: 0, names: new Set(), sizes: new Set(), uuids: [] };
    rec.n++;
    rec.names.add(u.name);
    if (u.size) rec.sizes.add(u.size);
    if (rec.uuids.length < 3) rec.uuids.push(u.uuid);
    byStack.set(key, rec);
  }
  for (const [stack, rec] of [...byStack.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)) {
    console.log(`\n  ${rec.n}x  names=[${[...rec.names].join(",")}] sizes=[${[...rec.sizes].join(",")}]`);
    for (const uuid of rec.uuids) {
      const owners = await page.evaluate((u) => window.__texOwners(u), uuid);
      console.log(`        ${uuid} referenced by: ${owners.length ? owners.join(", ") : "(nothing in the scene)"}`);
    }
    console.log(`        ${stack}`);
  }
  console.log("\nconsole errors:", page.__errors.length);
  await browser.close();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
