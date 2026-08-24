import { xpToNextLevel, type LeaderboardEntry } from "../../../shared/protocol-types";
import { iconSvg } from "./icons";

const RANK_MEDAL: Record<number, string> = { 1: "rank-1", 2: "rank-2", 3: "rank-3" };

export class LeaderboardPanel {
  private overlay = document.getElementById("leaderboard-overlay")!;
  private list = document.getElementById("leaderboard-list")!;
  private closeButton = document.getElementById("leaderboard-close")!;

  constructor(private readonly localName: string) {
    this.closeButton.addEventListener("click", () => this.close());
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains("open");
  }

  open(): void {
    this.overlay.classList.add("open");
  }

  close(): void {
    this.overlay.classList.remove("open");
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  setEntries(entries: LeaderboardEntry[]): void {
    this.list.innerHTML = "";
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "inv-empty";
      empty.textContent = "No adventurers ranked yet.";
      this.list.appendChild(empty);
      return;
    }

    entries.forEach((entry, i) => {
      const rank = i + 1;
      const row = document.createElement("div");
      row.className = `lb-row${entry.name === this.localName ? " lb-self" : ""}`;

      const rankEl = document.createElement("div");
      rankEl.className = "lb-rank";
      const medal = RANK_MEDAL[rank];
      if (medal) {
        rankEl.innerHTML = iconSvg(medal);
        rankEl.classList.add(`lb-rank-${rank}`);
      } else {
        rankEl.textContent = `#${rank}`;
      }
      row.appendChild(rankEl);

      // Rank is level-first, so two players tied on level otherwise look
      // identical here even though the server already sorts xp as the
      // tiebreaker (`ORDER BY level DESC, xp DESC`) — the same fact the
      // local player's own HUD bar already shows for themselves, just
      // never carried onto anyone else's row.
      const nameEl = document.createElement("div");
      nameEl.className = "lb-name";
      const nameText = document.createElement("span");
      nameText.textContent = entry.name;
      nameEl.appendChild(nameText);
      const xpBar = document.createElement("div");
      xpBar.className = "lb-xpbar";
      const xpFill = document.createElement("i");
      const ratio = Math.max(0, Math.min(1, entry.xp / xpToNextLevel(entry.level)));
      xpFill.style.width = `${ratio * 100}%`;
      xpBar.title = `${entry.xp} / ${xpToNextLevel(entry.level)} xp toward level ${entry.level + 1}`;
      xpBar.appendChild(xpFill);
      nameEl.appendChild(xpBar);
      row.appendChild(nameEl);

      const levelEl = document.createElement("div");
      levelEl.className = "lb-level";
      levelEl.textContent = `Lv${entry.level}`;
      row.appendChild(levelEl);

      this.list.appendChild(row);
    });
  }
}
