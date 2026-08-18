// Ground indicators: the flat rings that tell you what you have selected, how
// far you can reach, and where a boss is about to land its slam.
//
// The telegraph one matters most. `MonsterState.windingUp` and the per-kind
// `slamRadiusPx` have been on the wire since Phase 42, but the 3D client was
// not drawing them at all â€” so the troll's whole design (an attack you answer
// by walking out of it, rather than by out-healing it) was invisible and the
// fight just looked like it hit unfairly hard.

import * as THREE from "three";

function ring(inner: number, outer: number, color: number, opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  // Just above the ground plane, or it z-fights with the terrain.
  mesh.position.y = 0.03;
  mesh.renderOrder = 2;
  mesh.visible = false;
  return mesh;
}

function disc(radius: number, color: number, opacity: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;
  return mesh;
}

export class Indicators {
  private readonly targetRing: THREE.Mesh;
  private readonly reachRing: THREE.Mesh;
  private readonly dangerZones = new Map<string, { fill: THREE.Mesh; edge: THREE.Mesh }>();
  private seen = new Set<string>();

  constructor(private readonly scene: THREE.Scene) {
    this.targetRing = ring(0.42, 0.55, 0xffd873, 0.9);
    this.reachRing = ring(0.97, 1.0, 0xffe9c4, 0.22);
    scene.add(this.targetRing);
    scene.add(this.reachRing);
  }

  /** Gold in reach, grey out of it â€” the ring doubles as a range readout. */
  showTarget(x: number, z: number, inReach: boolean, radius: number): void {
    this.targetRing.visible = true;
    this.targetRing.position.set(x, 0.03, z);
    this.targetRing.scale.setScalar(Math.max(0.6, radius));
    const mat = this.targetRing.material as THREE.MeshBasicMaterial;
    mat.color.setHex(inReach ? 0xffd873 : 0x9a8d76);
    mat.opacity = inReach ? 0.95 : 0.55;
  }

  hideTarget(): void {
    this.targetRing.visible = false;
  }

  /** The player's own melee/spell reach, shown only while actually fighting. */
  showReach(x: number, z: number, radiusUnits: number): void {
    this.reachRing.visible = true;
    this.reachRing.position.set(x, 0.028, z);
    this.reachRing.scale.setScalar(radiusUnits);
  }

  hideReach(): void {
    this.reachRing.visible = false;
  }

  beginDanger(): void {
    this.seen.clear();
  }

  /**
   * A filled circle under a monster that is winding up, covering exactly the
   * area its slam will hit. Pulses so it reads as a countdown rather than
   * decoration.
   */
  danger(id: string, x: number, z: number, radiusUnits: number): void {
    this.seen.add(id);
    let d = this.dangerZones.get(id);
    if (!d) {
      d = { fill: disc(1, 0xff5a3c, 0.22), edge: ring(0.94, 1.0, 0xff7a4a, 0.8) };
      d.edge.visible = true;
      this.scene.add(d.fill);
      this.scene.add(d.edge);
      this.dangerZones.set(id, d);
    }
    const pulse = 0.78 + Math.sin(performance.now() / 90) * 0.22;
    d.fill.position.set(x, 0.02, z);
    d.fill.scale.setScalar(radiusUnits);
    (d.fill.material as THREE.MeshBasicMaterial).opacity = 0.14 + pulse * 0.16;
    d.edge.position.set(x, 0.032, z);
    d.edge.scale.setScalar(radiusUnits);
    (d.edge.material as THREE.MeshBasicMaterial).opacity = 0.45 + pulse * 0.45;
  }

  endDanger(): void {
    for (const [id, d] of this.dangerZones) {
      if (this.seen.has(id)) continue;
      this.scene.remove(d.fill);
      this.scene.remove(d.edge);
      (d.fill.material as THREE.Material).dispose();
      d.fill.geometry.dispose();
      (d.edge.material as THREE.Material).dispose();
      d.edge.geometry.dispose();
      this.dangerZones.delete(id);
    }
  }
}
