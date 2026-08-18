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
      ignored: ["**/public/models/**", "**/public/textures/**"],
    },
  },
});
