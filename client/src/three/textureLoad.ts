import * as THREE from "three";

/**
 * A drop-in replacement for `THREE.TextureLoader` that decodes off the main
 * thread.
 *
 * WHY, MEASURED. `tools/soak/loadhitch.mjs` wraps `WebGLRenderingContext`
 * itself from an init script, so it sees the whole load rather than only what
 * happens after login — which is what every earlier attempt at this got wrong,
 * since the stutters land at about +9.7s against a ~10s load. Of the roughly
 * 300ms of expensive GL time in a load, ~250ms was two clusters of
 * `texSubImage2D` calls whose source was an `HTMLImageElement`, at over 100ms
 * per cluster. The glTF textures, which arrive as `ImageBitmap` because
 * `GLTFLoader` already does this, cost about 5.5ms each for the same 1024x1024.
 *
 * The difference is not the upload. It is that a browser decodes an `<img>`
 * lazily, and `texSubImage2D` is where the bill finally comes due — on the main
 * thread, inside a frame. `createImageBitmap` does the same decode on a worker
 * thread, so by the time the texture reaches the GPU there is nothing left to
 * do but copy bytes.
 *
 * THE TRAP, AND IT IS SILENT. `WebGLTextures.uploadTexture` reads:
 *
 *     const isImageBitmap = texture.image instanceof ImageBitmap;
 *     if ( isImageBitmap === false ) {
 *       state.pixelStorei( _gl.UNPACK_FLIP_Y_WEBGL, texture.flipY );
 *       state.pixelStorei( _gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, ... );
 *       state.pixelStorei( _gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, ... );
 *     }
 *
 * For an `ImageBitmap` those three unpack settings are SKIPPED, `texture.flipY`
 * included. `TextureLoader` leaves `flipY` at its default `true`, so swapping
 * loaders without moving the flip onto the decoder would turn every texture in
 * the game upside down — invisibly on tiled grass, and as inverted lighting on
 * the normal maps, which is the kind of bug that gets called "the ground looks
 * a bit off" six weeks later. So the options below are not preferences: each
 * one reproduces an unpack flag that three will no longer apply.
 */
const BITMAP_OPTIONS: ImageBitmapOptions = {
  // Replaces UNPACK_FLIP_Y_WEBGL, which `TextureLoader` gets from the default
  // `texture.flipY === true`.
  imageOrientation: "flipY",
  // Replaces UNPACK_PREMULTIPLY_ALPHA_WEBGL, default `texture.premultiplyAlpha
  // === false`.
  premultiplyAlpha: "none",
  // Replaces UNPACK_COLORSPACE_CONVERSION_WEBGL. Textures here are tagged
  // sRGB and the working colour space is sRGB, so three resolves that to
  // `_gl.NONE` — no conversion — and this matches it.
  colorSpaceConversion: "none",
};

/** Old Safari and old Firefox shipped `createImageBitmap` with option support
 *  broken rather than absent, which is worse than not having it; `GLTFLoader`
 *  carries version checks for exactly this. Here it is enough to check the
 *  function exists, since the fallback is the loader we used to use anyway. */
const SUPPORTED = typeof createImageBitmap !== "undefined";

export class BitmapTextureLoader {
  private readonly bitmaps = new THREE.ImageBitmapLoader();
  private readonly fallback = new THREE.TextureLoader();

  constructor() {
    this.bitmaps.setOptions(BITMAP_OPTIONS as Record<string, unknown>);
  }

  /**
   * Same shape as `TextureLoader.load`: returns the texture immediately and
   * fills in its image when the bytes arrive. That is not a convenience, it is
   * what the callers need — a material is built from the returned object long
   * before the file has landed, exactly as `TextureLoader` already worked.
   */
  load(
    url: string,
    onLoad?: (texture: THREE.Texture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void,
  ): THREE.Texture {
    if (!SUPPORTED) return this.fallback.load(url, onLoad, onProgress, onError);

    const texture = new THREE.Texture();
    // The decoder already flipped it; see BITMAP_OPTIONS. three ignores this
    // for an ImageBitmap either way, but leaving it `true` would be a lie to
    // the next person who reads the texture.
    texture.flipY = false;
    this.bitmaps.load(
      url,
      (bitmap) => {
        texture.image = bitmap;
        texture.needsUpdate = true;
        onLoad?.(texture);
      },
      onProgress,
      onError,
    );
    return texture;
  }
}

/** One shared instance, since a loader holds no per-texture state and each new
 *  one is a second `LoadingManager` subscription for nothing. */
export const bitmapTextures = new BitmapTextureLoader();
