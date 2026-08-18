const MAX_ENTRIES = 40;
const VISIBLE_FRESH = 8;

export class CombatLog {
  private container = document.getElementById("combat-log")!;

  push(text: string, color: string): void {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    entry.style.color = color;
    entry.textContent = text;
    this.container.appendChild(entry);

    const entries = this.container.children;
    for (let i = 0; i < entries.length; i++) {
      entries[i].classList.toggle("log-fade", i < entries.length - VISIBLE_FRESH);
    }
    while (this.container.children.length > MAX_ENTRIES) {
      this.container.removeChild(this.container.firstChild!);
    }
    this.container.scrollTop = this.container.scrollHeight;
  }
}
