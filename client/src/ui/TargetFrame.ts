/**
 * The selected enemy's nameplate and health, mirroring the player's own unit
 * frame. Without it the only readout of a target's health is the small bar
 * floating over its head, which is unreadable mid-fight in a pack.
 */
import { iconSvg } from "./icons";

/** Everything the frame shows beyond a name and a health value. */
export interface TargetLook {
  /** 1..5 difficulty band. Tints the portrait and the name. */
  band?: number;
  /** A boss. Gets the bright border, the same promotion its nameplate gets. */
  elite?: boolean;
  /** Icon key for the portrait. */
  icon?: string;
  /**
   * The one item this creature is known for.
   *
   * Bosses only, which is what makes it worth saying — "the thing it is known
   * for" stops meaning anything if everything has one, the same rule that gives
   * only bosses a framed nameplate. It was in the loot table from the start and
   * nowhere on the screen, so a player could kill a dragon a dozen times and
   * never learn there was a reason to.
   */
  knownFor?: string;
  /**
   * What hurts it and what it shrugs off.
   *
   * On the FRAME and not the nameplate, the same call M2.3 made about a boss's
   * signature and for the same reason: reading it costs a deliberate look at
   * one creature, which is the walk-up-and-size-it-up gesture the rest of the
   * game is built on, and a line of resistances floating over every monster in
   * a camp is exactly the clutter the nameplate hierarchy exists to prevent.
   *
   * Spoken as names rather than percentages. "Weak to fire" is a plan; "-45%
   * fire" is a spreadsheet, and the player cannot act on the difference between
   * 45 and 30 anyway.
   */
  resists?: { school: string; name: string; color: string }[];
  weakTo?: { school: string; name: string; color: string }[];
  /**
   * What is running on it right now.
   *
   * Answers the question a debuff makes a player ask constantly and that
   * nothing could answer before: is my poison still on it, or am I about to
   * waste a nine-second cooldown re-applying something that has four seconds
   * left. Same two-column split as the player's own row, so there is one
   * arrangement to learn rather than two.
   */
  statuses?: { id: string; name: string; icon: string; kind: "buff" | "debuff"; blurb: string }[];
}

export class TargetFrame {
  private root = document.getElementById("target-frame")!;
  private nameEl = document.getElementById("target-name")!;
  private fill = document.getElementById("target-hp-fill")!;
  private hpText = document.getElementById("target-hp-text")!;
  private cast = document.getElementById("target-cast")!;
  private castFill = document.getElementById("target-cast-fill")!;
  private portrait = document.getElementById("target-portrait")!;
  private known = document.getElementById("target-known")!;
  private schools = document.getElementById("target-schools")!;
  private statusRow = document.getElementById("target-statuses")!;
  /** Composed separately from `lastLook`: a creature's resistances never
   *  change while you are looking at it and its statuses change constantly,
   *  so folding the two into one key would rebuild the portrait every time a
   *  poison ticked. */
  private lastStatuses = "";
  /** Last look applied, so the DOM is untouched while a target stays the same. */
  private lastLook = "";

  show(name: string, hp: number, maxHp: number, extra?: string, look?: TargetLook): void {
    this.root.classList.add("shown");

    // Band, elite and portrait are one composed key: this runs every frame a
    // target is selected, and rewriting an identical portrait sixty times a
    // second is the sort of thing that never shows up until it does.
    const schoolKey =
      (look?.resists ?? []).map((r) => r.school).join(",") +
      "/" +
      (look?.weakTo ?? []).map((r) => r.school).join(",");
    const key =
      `${look?.band ?? 0}|${look?.elite ? 1 : 0}|${look?.icon ?? ""}|${look?.knownFor ?? ""}|${schoolKey}`;
    if (key !== this.lastLook) {
      this.lastLook = key;
      this.root.className =
        "shown" +
        (look?.band ? ` band-${look.band}` : "") +
        (look?.elite ? " elite" : "");
      this.portrait.innerHTML = look?.icon ? iconSvg(look.icon, "icon") : "";
      this.known.classList.toggle("shown", !!look?.knownFor);
      this.known.innerHTML = "";
      if (look?.knownFor) {
        this.known.append("Known for ");
        const what = document.createElement("span");
        what.className = "k-what";
        what.textContent = look.knownFor;
        this.known.appendChild(what);
      }

      // Weakness first. It is the actionable half — a player reads this to
      // decide what to bring, and "bring fire" is a decision where "do not
      // bother bringing a sword" is only a complaint.
      this.schools.innerHTML = "";
      const rows: [string, TargetLook["weakTo"]][] = [
        ["Weak to", look?.weakTo],
        ["Resists", look?.resists],
      ];
      let any = false;
      for (const [label, list] of rows) {
        if (!list || list.length === 0) continue;
        any = true;
        const row = document.createElement("div");
        row.className = "t-school";
        row.append(`${label} `);
        list.forEach((entry, i) => {
          if (i > 0) row.append(", ");
          const tag = document.createElement("span");
          tag.textContent = entry.name.toLowerCase();
          tag.style.color = entry.color;
          row.appendChild(tag);
        });
        this.schools.appendChild(row);
      }
      this.schools.classList.toggle("shown", any);
    }
    const statusKey = (look?.statuses ?? []).map((s) => s.id).join(",");
    if (statusKey !== this.lastStatuses) {
      this.lastStatuses = statusKey;
      this.statusRow.innerHTML = "";
      // Debuffs first here, unlike the player's own row where buffs lead.
      // On something you are fighting, what YOU have put on it is the
      // actionable half — the same reason the schools line leads with the
      // weakness rather than the resistance.
      const ordered = [...(look?.statuses ?? [])].sort(
        (a, b) => Number(a.kind === "buff") - Number(b.kind === "buff"),
      );
      for (const status of ordered) {
        const cell = document.createElement("div");
        cell.className = `status-cell ${status.kind}`;
        const icon = document.createElement("span");
        icon.className = "status-icon";
        icon.innerHTML = iconSvg(status.icon, "icon");
        cell.appendChild(icon);
        cell.title = `${status.name} — ${status.blurb}`;
        this.statusRow.appendChild(cell);
      }
      this.statusRow.classList.toggle("shown", ordered.length > 0);
    }

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

  /**
   * The target's wind-up, as a filling bar.
   *
   * The danger circle on the ground says where a telegraphed slam will land;
   * this says when. Without it a player can see that something is coming and
   * still has no way to judge whether there is time to walk out, which turns a
   * mechanic meant to be answered by moving into one answered by guessing.
   */
  setWindup(progress: number | null): void {
    if (progress === null) {
      this.cast.classList.remove("shown");
      return;
    }
    this.cast.classList.add("shown");
    this.castFill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  }

  hide(): void {
    this.root.classList.remove("shown");
    this.cast.classList.remove("shown");
    this.known.classList.remove("shown");
    this.schools.classList.remove("shown");
    this.statusRow.classList.remove("shown");
    this.lastStatuses = "";
    // Forces the look to be re-applied on the next target, since `show` skips
    // the work when the composed key is unchanged.
    this.lastLook = "";
  }
}
