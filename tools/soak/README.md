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
  Worse, the obvious repair is *also* wrong: `localActor` plus
  `geometries > 100` lands partway through the load, while the world is still
  being warmed. That quietly ruined two measurements — a load-time run reported
  6.4s and three phases because it stopped the clock mid-sequence, and a gear
  probe drove 25 weapon swaps into a still-loading client and screenshotted the
  loading screen. Wait for `LoadingScreen` to remove its own element:
  `!document.getElementById("loading")` is the game's own statement that it is
  done, and nothing has to be guessed.
- **The anti-throttle flags do NOT make headed frame timing honest.** Tested,
  not assumed: with `--disable-renderer-backgrounding`,
  `--disable-backgrounding-occluded-windows` and
  `--disable-background-timer-throttling` all set, an 8-minute headed run still
  produced p50 16.7ms with p95 *and* p99 at 1016ms. Chromium throttles in
  bursts, so the median stays perfect while the tail is fabricated. Check for
  the cluster, never the median: a throttled run has a tight band of frames near
  1000ms and nothing between 100ms and 900ms — one run had exactly 179 frames
  over 33ms, over 50ms, over 100ms and over 250ms, which is one spike at a
  second wearing four disguises.
- **Frame COST survives a throttled run; the frame INTERVAL does not.** The
  profiler labels them: `Nms frame — worst section: ...` timed work inside a
  frame and is trustworthy, while `Nms BETWEEN frames` timed a gap in
  scheduling, which is exactly what throttling manufactures. This is how a
  previous session came to blame `net:STATE_SNAPSHOT` for a 1000ms stall whose
  handler took 8ms.
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

- **Never write a movement loop in a harness.** Use `approach` from
  `driver.mjs`. It routes through a town gate, steers around props and
  buildings, sidesteps, and escalates to `unstick` when wedged. This was
  learned three separate times: the gate half was solved in `invariants.mjs`
  and not shared, the wedge half in `bagspam.mjs` and not shared, and the
  steering half only after somebody watched a run and said "your gameplay is
  running into a town fence". Nine harnesses, one of them using the shared
  helper. `keysToward` should have no callers outside the driver.
- **A bot grinding a wall still finishes the run.** That is what makes this
  dangerous rather than obvious: the numbers come back, they are just partly
  a measurement of scraping. Watch `blocked` and the travel rate — 4,581px/min
  with 22 blocked legs was the grinding, 13,622px/min with 10 was the fix.
- **A character can be saved into a stuck position.** One seeded character sat
  wedged against the palisade for an unknown number of sessions, and every
  harness pointed at it reported zero fights and a clean pass. `unstick` frees
  it; the liveness checks catch it if anything else does not.

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
| `frames.mjs` | frame distribution and hitch attribution while playing. Reports whether the run was throttled instead of letting you read fiction. |
| `loadtime.mjs` | `Game.loadPhases` — what each load phase cost and how many shader programs it added. Headed, for the reason above. |
| `gearcheck.mjs` | swaps every weapon in the bag and checks each one still has drawable, renderer-registered geometry. |
| `raritytint.mjs` | checks that sharing geometry across rarities did not also share the tint. |
| `invariants.mjs` | asserts state coherence several times a second while playing. Prints RUN VOID if it never actually fought. |
| `death.mjs` | walks a fresh level 1 into a camp and asserts the whole defeat and respawn sequence. |
| `multiplayer.mjs` | two clients in one world; checks each sees the other and that the gap between them stays bounded. |
| `qualityswitch.mjs` | cycles graphics quality 24 times while fighting — the path `compileSafely` most affects. |
| `bagspam.mjs` | counts "Bag is full" warnings per minute with a full bag standing on loot. |
| `facing.mjs` | measures the angle between where the body points and where it is walking, fighting and not. |
| `texupload.mjs` | names every texture uploaded mid-session by what backs it, with a creation stack. |
| `fxshot.mjs` | fires one effect somewhere quiet and captures it with real elapsed timings. |
| `uishot.mjs` / `crop.mjs` | screenshot one element, and magnify a region of a frame. A 190px widget cannot be judged inside a 1600px screenshot. |
| `collcost.mjs` | what the iterated collision resolver costs per call, in the worst place for it. |
| `whereami.mjs` | where is this character and can it move. The first thing to run when a soak reports nothing happening. |

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
