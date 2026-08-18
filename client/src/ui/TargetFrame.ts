/**
 * The selected enemy's nameplate and health, mirroring the player's own unit
 * frame. Without it the only readout of a target's health is the small bar
 * floating over its head, which is unreadable mid-fight in a pack.
 */
export class TargetFrame {
  private root = document.getElementById("target-frame")!;
  private nameEl = document.getElementById("target-name")!;
  private fill = document.getElementById("target-hp-fill")!;

  show(name: string, hp: number, maxHp: number, extra?: string): void {
    this.root.classList.add("shown");
    this.nameEl.textContent = extra ? `${name}  ${extra}` : name;
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.fill.style.width = `${ratio * 100}%`;
    this.fill.textContent = "";
    this.nameEl.title = `${hp}/${maxHp}`;
  }

  hide(): void {
    this.root.classList.remove("shown");
  }
}
