import {
  LANDMARKS,
  landmarkPosition,
  type Landmark,
} from "../../../shared/landmarks";
import { PLAYER_SPAWN } from "../../../shared/protocol-types";

/**
 * Where you can get to from here.
 *
 * THE PANEL SHOWS EVERY STONE, INCLUDING THE ONES IT CANNOT OFFER, and that is
 * the point of it rather than an oversight. A list of four places you have been
 * tells you where you can go; a list of seven, three of them greyed with the
 * ring they stand in, tells you what is left — which is the only thing in the
 * game that says "there are places you have not walked to yet" out loud.
 *
 * It is the same argument the forge's locked recipes are shown under: a rule
 * nobody ever sees a refusal of is a rule nobody learns.
 */
export class TravelPanel {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly header: HTMLElement;
  private reached = new Set<string>();
  private origin: string | null = null;
  private here: string | null = null;
  private open = false;

  constructor(
    parent: HTMLElement,
    private readonly onTravel: (landmarkId: string) => void,
  ) {
    this.root = document.createElement("div");
    this.root.id = "travel";

    const title = document.createElement("div");
    title.id = "travel-title";
    title.textContent = "Travel";
    this.root.appendChild(title);

    this.header = document.createElement("div");
    this.header.id = "travel-from";
    this.root.appendChild(this.header);

    this.list = document.createElement("div");
    this.list.id = "travel-list";
    this.root.appendChild(this.list);

    const close = document.createElement("button");
    close.id = "travel-close";
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => this.close());
    this.root.appendChild(close);

    parent.appendChild(this.root);
    this.render();
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** Whether this character has stood at a stone. Exposed for the harness:
   *  it is the server's answer, and a test that recomputes it is a second
   *  answer to a question already being answered. */
  knows(landmarkId: string): boolean {
    return this.reached.has(landmarkId);
  }

  setReached(ids: string[]): void {
    this.reached = new Set(ids);
    if (this.open) this.render();
  }

  /** Where the player is standing, and whether that is somewhere you can leave
   *  from. Both come from the shared rule, so the panel cannot disagree with
   *  the server about what it may offer. */
  setOrigin(originName: string | null, hereId: string | null): void {
    if (originName === this.origin && hereId === this.here) return;
    this.origin = originName;
    this.here = hereId;
    if (this.open) this.render();
  }

  toggle(): void {
    this.open ? this.close() : this.show();
  }

  show(): void {
    this.open = true;
    this.root.classList.add("open");
    this.render();
  }

  close(): void {
    this.open = false;
    this.root.classList.remove("open");
  }

  private render(): void {
    this.header.textContent = this.origin
      ? `Setting off from ${this.origin}`
      : "You can only set off from a waystone or a town.";
    this.header.className = this.origin ? "" : "nowhere";

    this.list.innerHTML = "";
    for (const l of LANDMARKS) {
      this.list.appendChild(this.row(l));
    }
  }

  private row(l: Landmark): HTMLElement {
    const known = this.reached.has(l.id);
    const isHere = this.here === l.id;
    const usable = known && !isHere && !!this.origin;

    const row = document.createElement("button");
    row.type = "button";
    row.className = `travel-row${known ? "" : " unknown"}${isHere ? " here" : ""}`;
    row.disabled = !usable;

    const name = document.createElement("div");
    name.className = "travel-name";
    name.textContent = known ? l.name : "— not yet walked to —";
    row.appendChild(name);

    const note = document.createElement("div");
    note.className = "travel-note";
    if (isHere) {
      note.textContent = "you are here";
    } else if (known) {
      note.textContent = l.blurb;
    } else {
      // The DIRECTION and the DISTANCE, which is the whole of what an unvisited
      // stone is allowed to tell you: enough to go and find it, nothing that
      // saves you the walk.
      const at = landmarkPosition(l);
      const north = PLAYER_SPAWN.y - at.y;
      const east = at.x - PLAYER_SPAWN.x;
      const bearing =
        Math.abs(north) > Math.abs(east)
          ? north > 0 ? "north" : "south"
          : east > 0 ? "east" : "west";
      const away = Math.round(Math.hypot(north, east) / 100) * 100;
      note.textContent = `${bearing}, about ${away}px out of Emberhold`;
    }
    row.appendChild(note);

    if (usable) row.addEventListener("click", () => this.onTravel(l.id));
    return row;
  }
}
