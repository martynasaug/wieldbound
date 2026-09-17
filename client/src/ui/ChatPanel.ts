import { CHAT_MAX_CHARS, type ChatChannel } from "../../../shared/protocol-types";

/**
 * The chat box.
 *
 * THE WHOLE RISK IN THIS FILE IS FOCUS, and it is not hypothetical — this
 * codebase has already been bitten by it once, which is why `Game.bindInput`
 * opens with a `typing` guard and why the debug handle exists at all ("the keys
 * stick after a panel steals focus" is the bug it was added to find).
 *
 * Three things have to be true or walking breaks:
 *
 *   1. While the input has focus, movement keys must not move anybody. That is
 *      the existing `typing` guard on `keydown`, which returns early when the
 *      event target is an INPUT. It already covers this box.
 *
 *   2. Keys HELD when the box takes focus must be released. The guard above
 *      only stops NEW presses; a player holding W who presses Enter to talk
 *      keeps W in the held set, and `keyup` while typing is not enough because
 *      they may never let go until after they have finished the sentence. So
 *      focusing clears the held set explicitly, the same way the window's own
 *      `blur` handler does.
 *
 *   3. Escape must give the keyboard back. A box you can enter and not leave is
 *      worse than no box.
 */
export class ChatPanel {
  private readonly root: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly channelButton: HTMLButtonElement;
  private channel: ChatChannel = "local";

  constructor(
    parent: HTMLElement,
    private readonly onSay: (text: string, channel: ChatChannel) => void,
    /** Release every held key. See point 2 in the note above. */
    private readonly releaseKeys: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.id = "chat";

    this.log = document.createElement("div");
    this.log.id = "chat-log";
    this.root.appendChild(this.log);

    const row = document.createElement("div");
    row.id = "chat-row";

    this.channelButton = document.createElement("button");
    this.channelButton.id = "chat-channel";
    this.channelButton.type = "button";
    this.channelButton.addEventListener("click", () => {
      this.setChannel(this.channel === "local" ? "city" : "local");
      this.input.focus();
    });
    row.appendChild(this.channelButton);

    this.input = document.createElement("input");
    this.input.id = "chat-input";
    this.input.type = "text";
    this.input.autocomplete = "off";
    // Also capped on the SERVER. This one is so the field behaves; that one is
    // so the rule is real.
    this.input.maxLength = CHAT_MAX_CHARS;
    this.input.placeholder = "Press Enter to talk";
    row.appendChild(this.input);
    this.root.appendChild(row);
    parent.appendChild(this.root);

    this.input.addEventListener("focus", () => {
      this.root.classList.add("typing");
      // POINT 2. Without this a player who walks into town holding W and
      // presses Enter keeps walking while they type.
      this.releaseKeys();
    });
    this.input.addEventListener("blur", () => this.root.classList.remove("typing"));

    this.input.addEventListener("keydown", (e) => {
      // Stopped here so the window handler never sees a keystroke meant for the
      // box. The `typing` guard there would drop it anyway; this makes the box
      // responsible for its own keys rather than relying on that.
      e.stopPropagation();
      if (e.key === "Enter") {
        const text = this.input.value.trim();
        this.input.value = "";
        if (text) this.onSay(text, this.channel);
        this.input.blur();
      } else if (e.key === "Escape") {
        this.input.value = "";
        this.input.blur();
      }
    });

    this.setChannel("local");
  }

  /** Enter, from the game. Opens the box and hands it the keyboard. */
  focusInput(): void {
    this.input.focus();
  }

  get isTyping(): boolean {
    return document.activeElement === this.input;
  }

  private setChannel(channel: ChatChannel): void {
    this.channel = channel;
    this.channelButton.textContent = channel === "local" ? "Local" : "City";
    this.channelButton.className = channel;
    this.input.placeholder =
      channel === "local" ? "Anyone nearby will hear you" : "Everyone inside the walls";
  }

  /**
   * A line arrives.
   *
   * `own` is the speaker being this client, which is worth colouring because
   * the single most confusing thing a chat box can do is leave you unsure
   * whether your own message went anywhere.
   */
  push(from: string, text: string, channel: ChatChannel, own: boolean): void {
    const entry = document.createElement("div");
    entry.className = `chat-entry ${channel}${own ? " own" : ""}`;

    const who = document.createElement("span");
    who.className = "chat-who";
    who.textContent = `${from}: `;
    entry.appendChild(who);
    // From the wire, so never as markup.
    entry.appendChild(document.createTextNode(text));

    this.log.appendChild(entry);
    while (this.log.children.length > 80) this.log.removeChild(this.log.firstChild!);
    this.log.scrollTop = this.log.scrollHeight;
  }

  /** The game's own voice — a refusal, a hint. Not from any player. */
  note(text: string): void {
    const entry = document.createElement("div");
    entry.className = "chat-entry note";
    entry.textContent = text;
    this.log.appendChild(entry);
    this.log.scrollTop = this.log.scrollHeight;
  }
}
