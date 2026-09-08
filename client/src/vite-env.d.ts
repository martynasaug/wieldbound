/// <reference types="vite/client" />

// Vite's own ambient types, which this project had never needed until something
// wanted to know whether it was a development server or a build.
//
// `World.ts` reads `import.meta.env.DEV` to decide whether to keep three's
// shader error checking, which costs about 350ms of blocked main thread across
// a load and is worth having while shaders are being changed.
