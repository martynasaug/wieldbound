/**
 * The selected enemy's nameplate and health, mirroring the player's own unit
 * frame. Without it the only readout of a target's health is the small bar
 * floating over its head, which is unreadable mid-fight in a pack.
 */
export class TargetFrame {
  private root = document.getElementById("target-frame")!;
  private nameEl = document.getElementById("target-name")!;
  private fill = document.getElementById("target-hp-fill")!;
  private hpText = document.getElementById("target-hp-text")!;

  show(name: string, hp: number, maxHp: number, extra?: string): void {
    this.root.classList.add("shown");
    // Name left, status right — "out of reach" is the thing you need to read
    // instantly mid-fight, so it gets its own column rather than being run
    // together with the name.
    this.nameEl.innerHTML = "";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = name;
    this.nameEl.appendChild(nameSpan);
    if (extra) {
      const extraSpan = document.createElement("span");
      extraSpan.className = "t-extra";
      extraSpan.textContent = extra;
      this.nameEl.appendChild(extraSpan);
    }

    // maxHp of 0 means "no health to show" — used for allies, whose HP is not
    // on the wire. Better to show nothing than to invent a number.
    const known = maxHp > 0;
    const ratio = known ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.fill.style.width = `${ratio * 100}%`;
    this.fill.textContent = "";
    (this.fill.parentElement as HTMLElement).style.visibility = known ? "visible" : "hidden";
    this.hpText.textContent = known ? `${Math.max(0, Math.round(hp))} / ${Math.round(maxHp)}` : "";
  }

  hide(): void {
    this.root.classList.remove("shown");
  }
}
