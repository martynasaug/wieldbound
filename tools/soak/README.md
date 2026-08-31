# Soak harness

Playwright drivers that log into the real client and play the game, for
measurements the unit suite cannot make: leaks, frame pacing, load cost, and
"does this still work after forty minutes".

```
npm i -D playwright && npx playwright install chromium   # once per machine
node tools/seed.mjs Player3619 --level 84                # server must be stopped
npm run dev
node tools/soak/soak.mjs Player3619 3 20000 > soak.log 2>&1   # 3 laps, 20s a camp
node tools/soak/geoleak.mjs Player3619 12                     # 12min, one place
```

Redirect long runs to a file. Node buffers stdout when it is not a terminal and
a run watched live can appear to have hung when it is fine.

## Why this lives in the repo

Three sessions in a row rebuilt a harness from scratch in a scratchpad
directory, and none of it survived a `git clone` onto another machine. The
browser binary cannot be committed. Everything below can be, and it was always
the expensive half.

## The mistakes, so they are not made a fourth time

Each of these produced a confident, wrong number before the cause was found.

- **A canvas click does not blur the login input.** `Game.bindInput` ignores any
  keydown whose target is an `INPUT`, so until `document.activeElement.blur()`
  is called explicitly, every movement key is swallowed. The bot stands still
  for the whole run while reporting that it pressed thousands of keys.
- **`g.running` is true about three seconds in, long before the world loads.**
  Wait for something that implies content — `localActor` plus
  `renderer.info.memory.geometries > 100`. A probe installed at `running` sees
  an empty scene and reports, correctly and uselessly, that there is nothing
  there.
- **Stuck detection must compare position before AND after a leg.** Sampling
  only afterwards makes a moving character look motionless, which once sent a
  run detouring past every camp it was supposed to fight in: `fights=0`,
  `stuck=44`.
- **N/E/S/W in equal legs is a closed loop.** It returns to where it started and
  never leaves town. It looks like exploring until you plot it.
- **Headed Chromium throttles to ~1fps when unfocused**, manufacturing fake
  ~1000ms hitches. Use headless for anything timed over a long run. Use headed
  only for load timing, where headless's SwiftShader — no
  `KHR_parallel_shader_compile` — is the bigger distortion (~90s against ~28s).
- **Hotbar keys are data**, `hotbar.layout.keys`, not fixed to 1..9.
- **A level 1 character with an empty hotbar presses empty slots.** Seed the
  character and spend its talent points, or the run measures nothing. The talent
  panel re-renders between clicks, so re-query `button.talent-node` before each
  one instead of holding element handles.
- **Class names are not stable.** esbuild's dep pre-bundle renames
  `BufferGeometry` to `_BufferGeometry`, so a probe that looks up a prototype by
  `constructor.name` finds nothing. Identify prototypes by what they OWN
  (`hasOwnProperty('setAttribute')`), which no bundler rewrites.
- **Check that only one run is writing the log.** A `nohup` believed to have
  failed had in fact started, and two soaks drove one character into one file.
  The tell was values alternating between two states and a counter jumping in a
  way one run cannot.

## The standing rule

That last one generalises, and it is the rule this directory exists under:

> Before believing a result, check that the instrument reproduces the state it
> claims to measure.

`TypeScript`'s `private` is a compile-time fiction — `window.__wieldbound` is the
whole `Game`, so `playerX`, `monsters`, `hotbar` and the renderer are all
readable from a probe without adding a debug hook to ship code.

## What each file is

| file | what it does |
|---|---|
| `driver.mjs` | launch, login, probe, movement primitives. Import this; do not re-derive it. |
| `soak.mjs` | tours all 21 camps for N laps, fighting at each. Answers "does lap 3 cost as much as lap 1". |
| `geoleak.mjs` | stays in one place and names every geometry the renderer holds, by creation stack. |

### How the geometry census works

three.js registers a geometry with the renderer by adding a `dispose` listener
to it (`WebGLGeometries.get`) and removes that listener when it is disposed. So

```
renderer holds this geometry  ===  geometry._listeners.dispose is non-empty
```

which is exactly the set `info.memory.geometries` counts, one by one rather than
as a total. A scene walk cannot find a leak, because a leaked geometry is by
definition one the scene has released and the renderer has not — it lives
precisely in the scene walk's blind spot. Patching `BufferGeometry.setAttribute`
to record a stack trace turns the survivors from a number into a line of code.
