import { Game } from "./three/Game";
import { hydrateIcons } from "./ui/icons";
import { LoadingScreen, randomHint } from "./ui/LoadingScreen";
import { LoginScreen } from "./ui/LoginScreen";

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

const gameRoot = document.getElementById("game-root")!;
const gameFrame = document.getElementById("game-frame")!;

// There is no class picker any more. Class is whatever weapon you have
// equipped (see classForWeapon), so choosing one up front would be a promise
// the game immediately breaks the first time you swap weapons.
function startGame(characterName: string): void {
  // The card plays itself out first, so the hand-over reads as a transition
  // rather than a cut. The loading screen goes over the top of it either way,
  // which is why this can wait for the animation without holding anything up.
  window.setTimeout(() => login.hide(), 280);
  gameRoot.style.display = "flex";
  gameFrame.style.width = "100%";
  gameFrame.style.height = "100%";

  // Shown before the Game is even constructed, so the very first thing that
  // happens after Play is something appearing rather than a blank page holding
  // still for several seconds. Its own removal is deferred to `finish`, which
  // only runs once the world is standing.
  const loading = new LoadingScreen(document.body, randomHint());

  const game = new Game(gameFrame, characterName);
  void game
    .start()
    .then(() => loading.finish())
    .catch((e) => {
      // The screen comes down on failure too, or the error report it is meant
      // to make visible is behind it.
      loading.finish();
      showFatal(String((e as Error)?.stack ?? e));
    });
}

// The static markup names its icons; this puts the glyphs in. Runs BEFORE the
// login screen is constructed, since that screen draws class and weapon glyphs
// of its own and would otherwise render its tiles as empty boxes.
hydrateIcons();

const login = new LoginScreen(startGame);
