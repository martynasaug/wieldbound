import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    watch: {
      // The 3D models and textures are large binaries that never change while
      // the game is running, and watching them is not merely wasteful: on
      // Windows the watcher grabs a handle as the file is being written, and
      // Vite dies outright with `EBUSY: resource busy or locked` if an asset is
      // (re)generated while the dev server is up.
      //
      // THE PRICE OF THIS, which had not been written down and cost an
      // afternoon: a model file CREATED while the dev server is up is not
      // served until the server restarts. Vite answers the HTML fallback for it
      // instead, so the request returns 200, the fetch succeeds, and whatever
      // was going to parse the bytes chokes on "<". `curl -o /dev/null -w
      // "%{http_code}"` says 200 and means nothing at all.
      //
      // It matters now because `tools/art/player_rig.py` GENERATES a model.
      // Re-run it, then restart the dev server before expecting to see the
      // result.
      ignored: ["**/public/models/**", "**/public/textures/**"],
    },
  },
});
