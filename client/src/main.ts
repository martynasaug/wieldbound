import { Game } from "./three/Game";
import { hydrateIcons } from "./ui/icons";

// A thrown error inside Phaser's create() leaves a black canvas and nothing
// else — the failure is completely silent unless you have devtools open.
// Surfacing it on the page turns "nothing loads" into an actual report.
// This only displays errors; it never swallows them.
function showFatal(message: string): void {
  let box = document.getElementById("fatal-error");
  if (!box) {
    box = document.createElement("div");
    box.id = "fatal-error";
    box.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:9999;max-height:45%;overflow:auto;" +
      "background:#3b1418;color:#ffd9d9;font:12px/1.5 monospace;padding:10px 14px;" +
      "border-top:2px solid #a33;white-space:pre-wrap";
    document.body.appendChild(box);
  }
  box.textContent = `Client error — the game stopped loading:\n\n${message}`;
}

window.addEventListener("error", (e) => showFatal(e.error?.stack ?? e.message));
window.addEventListener("unhandledrejection", (e) =>
  showFatal(String((e.reason as Error)?.stack ?? e.reason)),
);

const loginRoot = document.getElementById("login-root")!;
const gameRoot = document.getElementById("game-root")!;
const gameFrame = document.getElementById("game-frame")!;
const nameInput = document.getElementById("name-input") as HTMLInputElement;
const playButton = document.getElementById("play-button") as HTMLButtonElement;

// There is no class picker any more. Class is whatever weapon you have
// equipped (see classForWeapon), so choosing one up front would be a promise
// the game immediately breaks the first time you swap weapons.
function startGame(characterName: string): void {
  loginRoot.style.display = "none";
  gameRoot.style.display = "flex";
  gameFrame.style.width = "100%";
  gameFrame.style.height = "100%";

  const game = new Game(gameFrame, characterName);
  void game.start().catch((e) => showFatal(String((e as Error)?.stack ?? e)));
}

function handlePlay(): void {
  const name = nameInput.value.trim();
  if (name) startGame(name);
}

playButton.addEventListener("click", handlePlay);
nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handlePlay();
});
// The static markup names its icons; this puts the glyphs in. Runs before
// anything is shown, so no panel ever renders with empty icon slots.
hydrateIcons();

nameInput.focus();
