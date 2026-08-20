/**
 * The first thing anybody sees.
 *
 * It used to be a card with a heading, a name box and a paragraph explaining
 * that there is no class to pick — and because the card had no width of its
 * own, it stretched to fit that paragraph: a thousand pixels wide, with a
 * 220px input floating at the left of it and a Play button running the whole
 * span. The information was right and the page looked broken.
 *
 * THE PARAGRAPH IS THE PART WORTH REPLACING, not just the width. "No class to
 * pick — you are whatever you're holding" is the one rule this whole game is
 * built on, and a wall of prose is the weakest possible way to say it. Four
 * tiles showing each archetype and the weapons that make it says the same thing
 * in a glance, and says it in the game's own vocabulary.
 *
 * DERIVED FROM `WEAPONS`, never written out. `classForWeapon` is the single
 * function that decides what you are; this reads the same table through it, so
 * a new weapon family appears here the moment it exists and the login page can
 * never promise an archetype the game does not have. A hand-written list would
 * be a fifth place to remember, and the failure is silent — nothing throws when
 * the first screen of the game lies about how it works.
 */
import { LoginBackdrop } from "../three/LoginBackdrop";
import {
  CLASSES,
  CLASS_IDS,
  WEAPONS,
  WEAPON_TYPES,
  classForWeapon,
  type CharacterClass,
  type WeaponType,
} from "../../../shared/protocol-types";
import { iconSvg } from "./icons";

/** Where the last character name is kept, so coming back is typing nothing. */
const LAST_NAME_KEY = "wieldbound.lastName";

/** Fists are a real archetype rather than a broken state, so the Adventurer's
 *  tile has to show something. `WEAPON_TYPES` deliberately omits `fist` — it is
 *  not a thing you can hold — so it is added back here rather than by widening
 *  that list, which every other caller reads as "weapons you can equip". */
const ALL_FAMILIES: WeaponType[] = ["fist", ...WEAPON_TYPES];

function familiesFor(cls: CharacterClass): WeaponType[] {
  return ALL_FAMILIES.filter((w) => classForWeapon(w) === cls);
}

export class LoginScreen {
  private readonly root = document.getElementById("login-root")!;
  private readonly input = document.getElementById("name-input") as HTMLInputElement;
  private readonly button = document.getElementById("play-button") as HTMLButtonElement;
  private readonly classes = document.getElementById("login-classes")!;
  private readonly note = document.getElementById("login-note")!;

  /** The world, rendering behind the card. Held so it can be given back the
   *  moment the game builds its own renderer. */
  private backdrop: LoginBackdrop | null = null;

  constructor(private readonly onPlay: (name: string) => void) {
    this.buildClasses();
    this.startBackdrop();

    // Coming back should be pressing Enter. One name is one character here, so
    // the name IS the account, and making somebody retype it every session is
    // asking them to remember a password that has no other purpose.
    const last = readLastName();
    if (last) this.input.value = last;

    this.input.addEventListener("input", () => this.validate());
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.play();
    });
    this.button.addEventListener("click", () => this.play());
    this.validate();
    this.input.focus();
    this.input.select();
  }

  /**
   * Whether the name is usable, said before the button is pressed.
   *
   * The old version simply did nothing when the field was empty: the click
   * landed, no game started, and nothing on the page explained why. A refusal
   * that is silent is indistinguishable from a bug.
   */
  private validate(): boolean {
    const name = this.input.value.trim();
    const ok = name.length >= 2;
    this.button.disabled = !ok;
    this.note.textContent = name.length === 0
      ? "One name is one character. Type the same one to come back to it."
      : ok
        ? "One name is one character. Type the same one to come back to it."
        : "A name needs at least two letters.";
    this.note.classList.toggle("warn", name.length > 0 && !ok);
    return ok;
  }

  private play(): void {
    if (!this.validate()) {
      // Focus rather than nothing at all, so the page points at the thing that
      // is wrong instead of appearing to have ignored the press.
      this.input.focus();
      return;
    }
    const name = this.input.value.trim();
    writeLastName(name);
    this.root.classList.add("leaving");
    this.onPlay(name);
  }

  hide(): void {
    this.root.style.display = "none";
    // Two WebGL contexts, two terrains and two shadow maps is not a thing to
    // carry for the rest of a session — least of all on a machine that has
    // just been asked to load every model in the game.
    this.backdrop?.dispose();
    this.backdrop = null;
  }

  /**
   * Starts the live scene, and never lets it stop the login working.
   *
   * WebGL can be unavailable — a blocked context, a software renderer that
   * refuses, an ancient driver — and the front door of the game is the last
   * place that should be a hard dependency on it. On failure the page keeps the
   * flat background it already has and everything else behaves identically.
   */
  private startBackdrop(): void {
    try {
      const backdrop = new LoginBackdrop(this.root);
      this.backdrop = backdrop;
      // Two frames, so the fade begins on something rendered rather than on an
      // empty canvas the size of the window.
      requestAnimationFrame(() => requestAnimationFrame(() => backdrop.markReady()));
    } catch (err) {
      console.warn("[login] no backdrop:", err);
    }
  }

  /** One tile per archetype, each showing what you have to be holding for it. */
  private buildClasses(): void {
    this.classes.innerHTML = "";
    for (const id of CLASS_IDS) {
      const def = CLASSES[id];
      const families = familiesFor(id);
      if (families.length === 0) continue;

      const tile = document.createElement("div");
      tile.className = "login-class";

      const crest = document.createElement("span");
      crest.className = "lc-crest";
      crest.innerHTML = iconSvg(def.icon, "icon");
      tile.appendChild(crest);

      const name = document.createElement("div");
      name.className = "lc-name";
      name.textContent = def.name;
      tile.appendChild(name);

      // The weapons themselves, which is the actual answer to "how do I become
      // this". Bare hands included, because being unarmed is an archetype here
      // rather than the absence of one.
      const arms = document.createElement("div");
      arms.className = "lc-arms";
      for (const family of families) {
        const glyph = document.createElement("span");
        glyph.className = "lc-arm";
        glyph.innerHTML = iconSvg(WEAPONS[family].icon, "icon");
        glyph.title = WEAPONS[family].name;
        arms.appendChild(glyph);
      }
      tile.appendChild(arms);

      // Said on hover rather than printed under every tile: four blurbs at once
      // is the paragraph this row replaced.
      tile.title = `${def.name} — ${def.blurb}`;
      this.classes.appendChild(tile);
    }
  }
}

function readLastName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY) ?? "";
  } catch {
    // Private browsing and blocked storage both throw here. A remembered name
    // is a convenience, so losing it must never stop the game starting.
    return "";
  }
}

function writeLastName(name: string): void {
  try {
    localStorage.setItem(LAST_NAME_KEY, name);
  } catch {
    /* see readLastName */
  }
}
