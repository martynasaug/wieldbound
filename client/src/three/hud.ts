// The HUD, rebuilt as DOM.
//
// In the Phaser client this was drawn into the canvas, which meant text was
// rendered as canvas glyphs (the source of the tofu-emoji bug in Phase 38) and
// every element needed manual repositioning on resize. As DOM it inherits the
// gold/parchment theme the rest of the UI already uses, lays itself out, and
// stays crisp at any DPI.
//
// Nameplates and floating combat text are DOM too, positioned from projected
// world coordinates each frame — the standard MMO approach, and it keeps text
// out of the 3D pipeline entirely.

const STYLE = `
#hud3d { position: fixed; inset: 0; pointer-events: none; z-index: 5; font-family: Georgia, serif; }
#hud3d .frame {
  position: absolute; left: 14px; top: 14px; width: 264px;
  background: linear-gradient(#3a2a17, #241a0f);
  border: 1px solid var(--gold, #d9a441); border-radius: 8px;
  padding: 9px 11px; box-shadow: 0 4px 18px #0008;
}
#hud3d .who { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
#hud3d .who .nm { color: var(--gold-bright, #ffd873); font-weight: bold; font-size: 14px; }
#hud3d .who .lv { color: var(--gold, #d9a441); font-size: 11px; }
#hud3d .bar {
  position: relative; height: 15px; margin-bottom: 4px; border-radius: 3px;
  background: #1b1206; border: 1px solid #58421f; overflow: hidden;
}
#hud3d .bar .fill { position: absolute; inset: 0; width: 0%; transition: width .18s ease-out; }
#hud3d .bar .txt {
  position: relative; text-align: center; font: 10px/15px monospace;
  color: #f5e7c8; text-shadow: 0 1px 1px #000;
}
#hud3d .bar.hp .fill { background: linear-gradient(#5fc45f, #3d8f3d); }
#hud3d .bar.xp .fill { background: linear-gradient(#e8c25a, #b48a26); }
#hud3d .bar.mp .fill { background: linear-gradient(#5aa8e8, #2b6ba8); }

#hud3d .plate { position: absolute; transform: translate(-50%, -100%); text-align: center; white-space: nowrap; }
#hud3d .plate .pn {
  font: 11px monospace; color: #ffe082;
  text-shadow: -1px -1px 0 #2a1f0a, 1px -1px 0 #2a1f0a, -1px 1px 0 #2a1f0a, 1px 1px 0 #2a1f0a;
}
#hud3d .plate .ph { width: 54px; height: 5px; margin: 2px auto 0; background: #2a0d0d; border: 1px solid #000; }
#hud3d .plate .ph i { display: block; height: 100%; background: #d24b4b; }
#hud3d .plate.targeted .pn { color: #fff3cf; }
#hud3d .plate.targeted .ph { outline: 1px solid var(--gold-bright, #ffd873); }

#hud3d .float {
  position: absolute; transform: translate(-50%, -50%);
  font: bold 15px Georgia, serif; text-shadow: 0 1px 2px #000, 0 0 6px #0008;
  animation: hud3dFloat 1.15s ease-out forwards;
}
@keyframes hud3dFloat {
  0%   { opacity: 0; transform: translate(-50%, -30%) scale(.85); }
  18%  { opacity: 1; transform: translate(-50%, -60%) scale(1.08); }
  100% { opacity: 0; transform: translate(-50%, -190%) scale(1); }
}
#hud3d .toasts { position: absolute; left: 14px; bottom: 190px; display: flex; flex-direction: column; gap: 5px; }
#hud3d .toast {
  background: linear-gradient(#3a2a17, #241a0f); border: 1px solid var(--gold, #d9a441);
  border-radius: 5px; padding: 6px 10px; font-size: 12px; max-width: 330px;
  animation: hud3dToast 4s ease-out forwards;
}
@keyframes hud3dToast {
  0% { opacity: 0; transform: translateY(6px); }
  8%, 78% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-4px); }
}
`;

// Screen area the unit frame occupies (left/top offsets plus its size, with a
// little slack). Nameplates falling inside it are suppressed.
const HUD_FRAME_RECT = { w: 300, h: 130 };

export interface PlateSpec {
  name: string;
  hp?: number;
  maxHp?: number;
  targeted?: boolean;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly xpText: HTMLElement;
  private readonly mpFill: HTMLElement;
  private readonly mpText: HTMLElement;
  private readonly toastHost: HTMLElement;

  private readonly plates = new Map<string, HTMLElement>();
  private seenThisFrame = new Set<string>();

  constructor(parent: HTMLElement) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.root = document.createElement("div");
    this.root.id = "hud3d";
    this.root.innerHTML = `
      <div class="frame">
        <div class="who"><span class="nm">—</span><span class="lv">Lv 1</span></div>
        <div class="bar hp"><div class="fill"></div><div class="txt">0/0</div></div>
        <div class="bar mp"><div class="fill"></div><div class="txt">0/0</div></div>
        <div class="bar xp"><div class="fill"></div><div class="txt">0/0</div></div>
      </div>
      <div class="toasts"></div>
    `;
    parent.appendChild(this.root);

    this.nameEl = this.root.querySelector(".who .nm")!;
    this.levelEl = this.root.querySelector(".who .lv")!;
    this.hpFill = this.root.querySelector(".bar.hp .fill")!;
    this.hpText = this.root.querySelector(".bar.hp .txt")!;
    this.xpFill = this.root.querySelector(".bar.xp .fill")!;
    this.xpText = this.root.querySelector(".bar.xp .txt")!;
    this.mpFill = this.root.querySelector(".bar.mp .fill")!;
    this.mpText = this.root.querySelector(".bar.mp .txt")!;
    this.toastHost = this.root.querySelector(".toasts")!;
  }

  setIdentity(name: string, level: number): void {
    this.nameEl.textContent = name;
    this.levelEl.textContent = `Lv ${level}`;
  }

  setHp(hp: number, maxHp: number): void {
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    this.hpFill.style.width = `${ratio * 100}%`;
    this.hpText.textContent = `${Math.max(0, Math.round(hp))}/${Math.round(maxHp)}`;
    // Threshold colours carry meaning, so they stay explicit rather than being
    // folded into the gradient.
    this.hpFill.style.background =
      ratio > 0.5
        ? "linear-gradient(#5fc45f, #3d8f3d)"
        : ratio > 0.25
          ? "linear-gradient(#e0c454, #a8901f)"
          : "linear-gradient(#d85252, #9e2f2f)";
  }

  setMana(mana: number, maxMana: number): void {
    const ratio = maxMana > 0 ? Math.max(0, Math.min(1, mana / maxMana)) : 0;
    this.mpFill.style.width = `${ratio * 100}%`;
    this.mpText.textContent = `${Math.round(mana)}/${Math.round(maxMana)}`;
  }

  setXp(xp: number, needed: number, level: number): void {
    const ratio = needed > 0 ? Math.max(0, Math.min(1, xp / needed)) : 0;
    this.xpFill.style.width = `${ratio * 100}%`;
    this.xpText.textContent = `XP ${Math.round(xp)}/${Math.round(needed)}`;
    this.levelEl.textContent = `Lv ${level}`;
  }

  toast(text: string, color = "#f3e3c4"): void {
    const el = document.createElement("div");
    el.className = "toast";
    el.style.color = color;
    el.textContent = text;
    this.toastHost.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  floatText(screenX: number, screenY: number, text: string, color: string): void {
    const el = document.createElement("div");
    el.className = "float";
    el.style.color = color;
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;
    el.textContent = text;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1250);
  }

  // --- nameplates: call begin, then plate() per visible actor, then end ---

  beginPlates(): void {
    this.seenThisFrame.clear();
  }

  plate(id: string, screen: { x: number; y: number } | null, spec: PlateSpec): void {
    if (!screen) return;
    // Nameplates are world-anchored and the unit frame is not, so anything
    // behind the frame drew straight over the player's own health. Suppress
    // rather than reposition: a label yanked away from the thing it names is
    // worse than a label that briefly is not there.
    if (screen.x < HUD_FRAME_RECT.w && screen.y < HUD_FRAME_RECT.h) return;
    this.seenThisFrame.add(id);
    let el = this.plates.get(id);
    if (!el) {
      el = document.createElement("div");
      el.className = "plate";
      el.innerHTML = `<div class="pn"></div><div class="ph"><i></i></div>`;
      this.root.appendChild(el);
      this.plates.set(id, el);
    }
    el.style.left = `${screen.x}px`;
    el.style.top = `${screen.y}px`;
    el.classList.toggle("targeted", !!spec.targeted);

    const nameEl = el.querySelector(".pn") as HTMLElement;
    if (nameEl.textContent !== spec.name) nameEl.textContent = spec.name;

    const barEl = el.querySelector(".ph") as HTMLElement;
    if (spec.maxHp && spec.maxHp > 0 && spec.hp !== undefined) {
      barEl.style.display = "";
      const fill = barEl.firstElementChild as HTMLElement;
      fill.style.width = `${Math.max(0, Math.min(1, spec.hp / spec.maxHp)) * 100}%`;
    } else {
      barEl.style.display = "none";
    }
  }

  endPlates(): void {
    for (const [id, el] of this.plates) {
      if (!this.seenThisFrame.has(id)) {
        el.remove();
        this.plates.delete(id);
      }
    }
  }
}
