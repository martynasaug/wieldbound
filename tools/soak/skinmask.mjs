// WHICH PIXELS OF THE BODY TEXTURE COUNT AS SKIN?
//
// A skin tone recolours only what `skinWeight` in `client/src/three/skin.ts`
// calls skin, so the robe, the wraps and the dark cloth keep their colours.
// That function is a guess about a painted texture until somebody looks at
// where its boundary falls — so this draws it. It imports the REAL function
// from the dev server rather than a copy, and writes:
//
//   mask.png      white where a pixel is recoloured, black where it is left
//   overlay.png   the texture with every recoloured pixel pushed to magenta
//
// The overlay is the one to judge: magenta should cover the skin areas of the
// atlas and nothing else.
//
//   node tools/soak/skinmask.mjs [out]
import { mkdirSync, writeFileSync } from "node:fs";
import { open, login } from "./driver.mjs";

const OUT = process.argv[2] ?? "tools/soak/shots/skinmask";
mkdirSync(OUT, { recursive: true });

const { browser, page } = await open({ headless: true, width: 800, height: 600 });
await login(page, `Mask${Date.now() % 100000}`);

const images = await page.evaluate(async () => {
  const { skinWeight } = await import("/src/three/skin.ts");
  const img = new Image();
  img.src = "/textures/Monk_Texture.png";
  await img.decode();
  const w = img.width, h = img.height;
  const read = document.createElement("canvas");
  read.width = w;
  read.height = h;
  const rctx = read.getContext("2d");
  rctx.drawImage(img, 0, 0);
  const src = rctx.getImageData(0, 0, w, h).data;

  const hsl = (r, g, b) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let hue;
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else hue = ((r - g) / d + 4) / 6;
    return [hue, s, l];
  };

  const out = (fill) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const data = ctx.createImageData(w, h);
    let covered = 0;
    for (let i = 0; i < src.length; i += 4) {
      const [hue, s, l] = hsl(src[i] / 255, src[i + 1] / 255, src[i + 2] / 255);
      const weight = skinWeight(hue, s, l);
      covered += weight;
      fill(data.data, i, weight);
    }
    ctx.putImageData(data, 0, 0);
    return { png: c.toDataURL("image/png").split(",")[1], share: covered / (src.length / 4) };
  };

  const mask = out((d, i, weight) => {
    const v = Math.round(weight * 255);
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  });
  const overlay = out((d, i, weight) => {
    d[i] = src[i] + (255 - src[i]) * weight;
    d[i + 1] = src[i + 1] * (1 - weight);
    d[i + 2] = src[i + 2] + (255 - src[i + 2]) * weight;
    d[i + 3] = 255;
  });
  return { mask: mask.png, overlay: overlay.png, share: mask.share };
});

writeFileSync(`${OUT}/mask.png`, Buffer.from(images.mask, "base64"));
writeFileSync(`${OUT}/overlay.png`, Buffer.from(images.overlay, "base64"));
console.log(`${(images.share * 100).toFixed(1)}% of the texture is recoloured (weighted)`);
console.log(`mask and overlay in ${OUT}/`);
await browser.close();
