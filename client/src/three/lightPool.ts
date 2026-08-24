import * as THREE from "three";

// Adding or removing a THREE.Light from the scene changes the light count the
// renderer bakes into every lit material's shader program (NUM_POINT_LIGHTS
// and friends), and a material that has never been compiled for that exact
// light count before pays a real GPU shader-compile stall on its next
// frame — for every lit material in view, not just the light's own.
//
// Combat spawns and despawns a `THREE.PointLight` per bolt, beam and skill
// flash, created fresh and added/removed as each one comes and goes
// (attacks.ts's `bolt()`/`beam()`, skillfx.ts's `flash()`). With several
// players and monsters able to be mid-attack at once, the number of active
// point lights is different on practically every frame, and shader
// recompiles never stop — reported as a random stutter, worst exactly when
// attacking, which is when a light is most likely to appear or disappear.
//
// A fixed pool of lights added to the scene ONCE keeps the count constant
// from the renderer's point of view: every light stays in the scene graph
// permanently, "off" is intensity 0 rather than removed, and the very first
// frame pays for the one compile this pool will ever need.
const POOL_SIZE = 16;

export class LightPool {
  private readonly free: THREE.PointLight[] = [];

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      // Tagged so a scene inspector (or a test) can tell a pooled combat
      // light apart from an environment light at a glance.
      light.userData.pooled = true;
      scene.add(light);
      this.free.push(light);
    }
  }

  /**
   * Borrow a light, configured and ready to place. Returns null if every
   * slot is already in use — callers must treat that as "no light this
   * time," never fall back to `new THREE.PointLight()`, which would
   * reintroduce the exact stall this pool exists to prevent.
   */
  acquire(color: number, intensity: number, distance: number, decay: number): THREE.PointLight | null {
    const light = this.free.pop();
    if (!light) return null;
    light.color.set(color);
    light.intensity = intensity;
    light.distance = distance;
    light.decay = decay;
    return light;
  }

  release(light: THREE.PointLight): void {
    light.intensity = 0;
    // Callers parent an acquired light under a per-effect Group (a bolt's
    // trail, a beam's core) so it travels and expires with the rest of that
    // effect's visuals. When that group is removed from the scene, the
    // light — still its child — goes with it, even though only its
    // *reference* was handed back here. Re-parenting onto the scene root
    // undoes that before the light re-enters the free list, or a released
    // light that nothing reacquires stays orphaned off-graph forever and
    // the pool silently shrinks every time a bolt or flash finishes.
    this.scene.add(light);
    this.free.push(light);
  }
}
