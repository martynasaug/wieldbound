// Checks the buff/debuff table, and the rules it quietly relies on.
//
// The failures this exists for are all silent:
//
//   A status nothing applies is a row nobody will ever see. Four of these have
//   no skill at all and that is correct — dying applies one, a potion applies
//   another — so "unreferenced" cannot simply be an error, and the check has to
//   know which four.
//
//   A skill naming a status that cannot sit on what the skill targets is a
//   button that does nothing: a self-buff aimed at a monster, or a slow aimed
//   at the caster. Nothing throws; `applyStatus` just returns false and the
//   cooldown is spent.
//
//   A debuff with no cap composes into a root or a one-shot. Two slows must be
//   worse than one and must never be a stun, which is the same "never immunity"
//   argument the resistance cap is written under.
//
//   And a status whose modifiers use a key nothing reads is the exact failure
//   helm and cape shipped with for a year — a stat rolled and never applied.
//
//   node tools/test/statuses.mjs

import {
  DAMAGE_SCHOOLS,
  EMPTY_PASSIVES,
  MONSTER_STATS,
  RESIST_KEY,
  SKILLS,
  STATUSES,
  STATUS_IDS,
  WEAPON_TREES,
  statusDamageTaken,
  statusFits,
  statusModifiers,
  statusMoveMultiplier,
  talentTree,
  WEAPON_TYPES,
  describeRead,
  findRead,
  readCovers,
  readMultiplier,
  statusGroupIds,
} from "../../shared/protocol-types.ts";

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
}
function section(title) {
  console.log(`\n${title}`);
}

const defs = STATUS_IDS.map((id) => STATUSES[id]);
const skills = Object.values(SKILLS);

// --- 1. the table -----------------------------------------------------------
section("1. the table");
for (const def of defs) {
  check(`${def.id} knows its own id`, def.id === STATUSES[def.id].id);
  check(`${def.id} is a buff or a debuff`, def.kind === "buff" || def.kind === "debuff");
  check(`${def.id} lasts a sensible time`, def.durationMs >= 2000 && def.durationMs <= 60000,
    `${def.durationMs}ms`);
  check(`${def.id} says what it does`, !!def.blurb && def.blurb.length > 10);
  check(`${def.id} has an icon`, !!def.icon);
  check(`${def.id} says where it may sit`, ["player", "monster", "any"].includes(def.on));
  // A row that changes nothing is a picture on a bar. Every status has to do at
  // least one of the four things the vocabulary allows.
  const does =
    (def.modifiers && Object.values(def.modifiers).some((v) => v !== 0)) ||
    def.moveMultiplier !== undefined ||
    def.damageTakenMultiplier !== undefined ||
    !!def.dot;
  check(`${def.id} actually does something`, does);
}
check("icons are distinct per status",
  new Set(defs.map((d) => d.icon)).size === defs.length);
console.log(
  `  ${defs.filter((d) => d.kind === "buff").length} buffs, ` +
    `${defs.filter((d) => d.kind === "debuff").length} debuffs`,
);

// A buff that hurts you or a debuff that helps is a row somebody typed wrong,
// and it is invisible: the bar would file it on the wrong side and colour it
// the wrong colour while the numbers did the opposite.
section("2. buffs help and debuffs hurt");
for (const def of defs) {
  const mods = def.modifiers ?? {};
  // `armor: -6` on `exposed` is a debuff lowering armour, which is correct.
  // The test is about the SIGN matching the KIND, per key.
  const helps = Object.entries(mods).filter(([, v]) => v > 0).length;
  const hurts = Object.entries(mods).filter(([, v]) => v < 0).length;
  if (def.kind === "buff") {
    check(`${def.id} has no penalty in it`, hurts === 0, JSON.stringify(mods));
    check(`${def.id} does not slow you`, (def.moveMultiplier ?? 1) >= 1);
    check(`${def.id} does not raise damage taken`, (def.damageTakenMultiplier ?? 1) <= 1);
    check(`${def.id} does not tick damage on you`, !def.dot);
  } else {
    const bad = helps > 0 || (def.moveMultiplier ?? 1) > 1 || (def.damageTakenMultiplier ?? 1) < 1;
    check(`${def.id} is genuinely bad for whatever has it`, !bad, JSON.stringify(mods));
  }
}

// --- 3. the vocabulary is the shared one ------------------------------------
// The whole reason a status needs no plumbing: it speaks `PassiveBonus`, which
// `passivesOf` already totals. A key outside that bag is a modifier nothing
// reads — helm and cape shipped that way for a year.
section("3. modifiers reach the stat sheet");
for (const def of defs) {
  for (const key of Object.keys(def.modifiers ?? {})) {
    check(`${def.id}'s ${key} is a real passive key`, key in EMPTY_PASSIVES);
  }
  if (def.dot) {
    check(`${def.id}'s tick has a real school`, DAMAGE_SCHOOLS.includes(def.dot.school),
      def.dot.school);
    check(`${def.id} ticks on an interval`, (def.tickMs ?? 0) > 0);
    check(`${def.id} ticks for something`, def.dot.damage > 0);
    // A dot that fires more often than once a second is a stream of floating
    // numbers, and one that fires fewer than three times in its life is a
    // delayed hit wearing a duration.
    check(`${def.id} ticks at a readable rate`, (def.tickMs ?? 0) >= 800);
    check(`${def.id} ticks more than twice`, def.durationMs / (def.tickMs ?? 1) >= 3,
      `${def.durationMs / (def.tickMs ?? 1)} ticks`);
  }
}
// The bag a status contributes has to be summable with the others.
{
  const total = statusModifiers([
    { id: "enraged", endsAt: 0 },
    { id: "weakened", endsAt: 0 },
  ]);
  check("two opposing statuses cancel through one bag",
    total.damagePercent === STATUSES.enraged.modifiers.damagePercent +
      STATUSES.weakened.modifiers.damagePercent,
    `${total.damagePercent}`);
  check("and every key survives the sum", Object.keys(total).length === Object.keys(EMPTY_PASSIVES).length);
}

// --- 4. nothing composes into an immunity or a root -------------------------
section("4. nothing stacks into a wall");
{
  const everySlow = defs.filter((d) => d.moveMultiplier !== undefined)
    .map((d) => ({ id: d.id, endsAt: 0 }));
  const worst = statusMoveMultiplier(everySlow);
  check("every slow in the game at once still lets it move", worst >= 0.25, `${worst}`);
  check("and two slows are worse than one",
    statusMoveMultiplier(everySlow.slice(0, 2)) < statusMoveMultiplier(everySlow.slice(0, 1)) ||
      everySlow.length < 2);
  console.log(`  all ${everySlow.length} slows together: ${(worst * 100).toFixed(0)}% speed`);

  const everyTaken = defs.filter((d) => d.damageTakenMultiplier !== undefined)
    .map((d) => ({ id: d.id, endsAt: 0 }));
  const taken = statusDamageTaken(everyTaken);
  check("damage taken is clamped at both ends", taken >= 0.2 && taken <= 2, `${taken}`);
  // Marked and Shielded are the two, and one is a buff — so the interesting
  // case is that they compose rather than one winning outright.
  const both = statusDamageTaken([{ id: "marked", endsAt: 0 }, { id: "shielded", endsAt: 0 }]);
  check("a shield and a mark compose rather than cancelling to nothing",
    both > 0.2 && both < 1, `${both}`);
}

// --- 5. every status has a source, and every source can land it -------------
section("5. sources");
{
  // The four with no skill behind them. Named rather than derived, because
  // "unreferenced" is correct for exactly these and a bug for anything else.
  const NON_SKILL = {
    weakened: "applied by dying",
    enraged: "War Cry and the Wrathful Philtre",
    chilled: "frost skills",
    shielded: "Shield Wall",
  };
  const applied = new Set(skills.map((s) => s.applies).filter(Boolean));
  for (const def of defs) {
    check(`${def.id} has something that applies it`,
      applied.has(def.id) || def.id in NON_SKILL,
      "a status nothing can apply is a row nobody will ever see");
  }

  // A skill's status has to be able to sit on what the skill targets, or the
  // button spends a cooldown and does nothing at all.
  for (const skill of skills) {
    if (!skill.applies) continue;
    const def = STATUSES[skill.applies];
    check(`${skill.id} names a real status`, !!def, skill.applies);
    if (!def) continue;
    const target = skill.kind === "buff" ? "player" : "monster";
    check(`${skill.id}'s ${skill.applies} can sit on what it targets`,
      statusFits(skill.applies, target), `${skill.applies}.on = ${def.on}, needs ${target}`);
    // A buff skill must apply a buff and an offensive one a debuff, or the bar
    // files it on the wrong side of the screen from what it does.
    if (skill.kind === "buff") {
      check(`${skill.id} applies a buff`, def.kind === "buff", def.kind);
    } else {
      check(`${skill.id} applies a debuff`, def.kind === "debuff", def.kind);
    }
  }
  console.log(`  ${applied.size} statuses come off skills, ${Object.keys(NON_SKILL).length} from elsewhere`);
}

// --- 6. every weapon got one ------------------------------------------------
// The rule that decided the new skill list rather than a wish for particular
// effects: a status system half the game cannot use is half a system, and "you
// are whatever you're holding" only means something if every weapon has a new
// thing to hold.
section("6. every weapon can do this");
for (const weapon of WEAPON_TYPES) {
  const tree = talentTree(weapon);
  const actives = tree.map((n) => n.active).filter(Boolean).map((id) => SKILLS[id]);
  const withStatus = actives.filter((s) => s?.applies);
  check(`${weapon} can apply at least one status`, withStatus.length > 0);
  console.log(
    `  ${weapon.padEnd(7)} ${withStatus.map((s) => `${s.name}→${s.applies}`).join(", ") || "none"}`,
  );
}
// Fists too — an archetype, not a broken state.
{
  const fist = talentTree("fist").map((n) => n.active).filter(Boolean).map((id) => SKILLS[id]);
  check("bare hands can apply one as well", fist.some((s) => s?.applies));
}

// --- 7. the new skills are real ---------------------------------------------
section("7. the new skills");
{
  const NEW = ["focus", "rally", "bloodlust", "stagger", "expose", "huntersmark", "immolate", "stormbolt"];
  for (const id of NEW) {
    const skill = SKILLS[id];
    check(`${id} exists`, !!skill);
    if (!skill) continue;
    check(`${id} applies something`, !!skill.applies);
    check(`${id} costs a cooldown`, skill.cooldownMs >= 4000, `${skill.cooldownMs}ms`);
    // Every one has to be reachable: a skill in no tree is a skill nobody can
    // learn, which `talents.mjs` checks generally and this checks by name.
    const inTree = Object.values(WEAPON_TREES).some((nodes) =>
      nodes.some((n) => n.active === id),
    );
    check(`${id} is in a tree somebody can buy`, inTree);
  }

  // The one that closes M4's documented gap. Lightning had a single dealer in
  // the whole game and no weapon at all, so the golem's only real weakness sat
  // behind one tier-3 node in one tree.
  const lightning = skills.filter((s) => s.school === "lightning");
  check("lightning has more than one source now", lightning.length >= 2,
    lightning.map((s) => s.name).join(", "));
  console.log(`  lightning: ${lightning.map((s) => s.name).join(", ")}`);
}

// --- 7b. the harmful half goes both ways ------------------------------------
// A debuff system where only the player can apply one is half a system: the
// player's own debuff row would have exactly one thing it could ever show, and
// that only after dying.
section("7b. monsters inflict too");
{
  const inflicting = Object.entries(MONSTER_STATS).filter(([, s]) => s.inflicts);
  check("something in the world can debuff the player", inflicting.length > 0);
  for (const [kind, stats] of inflicting) {
    const def = STATUSES[stats.inflicts.status];
    check(`${kind} inflicts a real status`, !!def, stats.inflicts.status);
    if (!def) continue;
    check(`${kind} inflicts a DEBUFF`, def.kind === "debuff", def.kind);
    // It has to be able to sit on a player, or the swing spends the roll and
    // silently does nothing — `applyStatus` returns false and nothing throws.
    check(`${kind}'s ${def.id} can sit on a player`, statusFits(def.id, "player"), def.on);
    check(`${kind} inflicts it sometimes rather than always`,
      stats.inflicts.chance > 0 && stats.inflicts.chance < 1, `${stats.inflicts.chance}`);
    // Not in the opening rings. The first two bands are where a player learns
    // that swinging works, and a status they cannot read yet is noise.
    check(`${kind} is far enough out to be teaching this`, stats.band >= 3, `band ${stats.band}`);
  }
  console.log(
    `  ${inflicting.map(([k, s]) => `${k}:${s.inflicts.status}`).join(", ")}`,
  );

  // And the player can answer it. A debuff with no counter is a tax.
  for (const [, stats] of inflicting) {
    const def = STATUSES[stats.inflicts.status];
    if (!def.dot) continue;
    const school = def.dot.school;
    check(`the ${school} its tick deals can be resisted`,
      school === "physical" || !!RESIST_KEY[school], school);
  }
}

// --- 8. the old boolean is gone ---------------------------------------------
// `appliesSlow` could only ever mean one effect, so six skills used it to mean
// six slightly different things. Two of them were never really slows.
section("8. no skill still calls it a slow");
for (const skill of skills) {
  check(`${skill.id} has no leftover appliesSlow`, !("appliesSlow" in skill));
}
for (const [id, expected] of [
  ["poisonarrow", "poisoned"],
  ["rend", "bleeding"],
  ["gutpunch", "staggered"],
  ["frostnova", "chilled"],
]) {
  check(`${id} now says it applies ${expected}`, SKILLS[id].applies === expected,
    String(SKILLS[id].applies));
}

// --- 9. skills that READ a status -------------------------------------------
// The other direction, and the one with the most ways to be quietly wrong.
//
//   A read that names a status NOTHING in the game applies is a condition that
//   can never be met — the skill is simply weaker than its numbers say, for
//   ever, and nothing throws.
//
//   A read whose condition its own weapon tree cannot produce is a skill that
//   only works when somebody else is standing next to you. That is a fine thing
//   to build ON PURPOSE and a terrible thing to build by accident, so the
//   pairing is asserted rather than assumed.
//
//   A consuming read with no bonus and no cleanse behind it is a button that
//   deletes your own buff for nothing.
//
//   And a condition with no sentence for the tooltip is a conditional the
//   player cannot play around, which is the same as not having built it.
section("9. skills that read a status");
{
  const readers = skills.filter((s) => !!s.reads);
  check("something reads a status at all", readers.length > 0);

  // Every group name resolves to real rows, and to more than nothing.
  for (const group of ["dot", "buff", "debuff"]) {
    const ids = statusGroupIds(group);
    check(`the ${group} family is not empty`, ids.length > 0);
    check(`every ${group} is a real status`, ids.every((id) => !!STATUSES[id]));
  }
  // Derived, not listed: a dot is anything with a tick, and the group must be
  // exactly the rows that have one — so a fifteenth dot becomes Execute-able
  // the moment it exists, with nothing to remember.
  check(
    "the dot family is derived from the table",
    statusGroupIds("dot").every((id) => !!STATUSES[id].dot) &&
      STATUS_IDS.filter((id) => STATUSES[id].dot).length === statusGroupIds("dot").length,
  );

  // What anything in the game can put on anything, so a read can be checked
  // against what the world is actually able to produce.
  const appliable = new Set();
  for (const s of skills) if (s.applies) appliable.add(s.applies);
  for (const kind of Object.keys(MONSTER_STATS)) {
    const inflicts = MONSTER_STATS[kind].inflicts;
    if (inflicts) appliable.add(inflicts.status);
  }
  // Nobody casts Weakened — dying applies it — and a cleanse must be allowed
  // to lift it, so it counts as producible.
  appliable.add("weakened");

  for (const skill of readers) {
    const read = skill.reads;
    const ids = read.any?.length ? [...read.any] : statusGroupIds(read.group);
    check(`${skill.id} reads something`, ids.length > 0);
    check(`${skill.id} names only real statuses`, ids.every((id) => !!STATUSES[id]));
    check(`${skill.id} says where it looks`, read.on === "self" || read.on === "target");

    // A condition nothing in the world can create is a permanent miss.
    check(
      `${skill.id}'s condition can actually happen`,
      ids.some((id) => appliable.has(id)),
      ids.join(", "),
    );

    // And it has to be able to sit where the skill is looking.
    const side = read.on === "self" ? "player" : "monster";
    check(
      `${skill.id}'s condition can sit on a ${side}`,
      ids.some((id) => statusFits(id, side)),
    );

    // Consuming something for nothing is a button that makes you worse.
    if (read.consume && !read.bonus) {
      check(
        `${skill.id} consumes for a reason`,
        skill.kind === "heal",
        "a consume with no bonus is a cleanse, or it is a mistake",
      );
    }
    if (read.bonus) {
      check(`${skill.id}'s bonus is worth pressing`, read.bonus > 1.2, `${read.bonus}`);
      // And not so large that the unconditional case is a wasted button.
      check(`${skill.id}'s bonus is not the whole skill`, read.bonus <= 2.5, `${read.bonus}`);
    }

    // The tooltip sentence. A conditional the player cannot read is one they
    // will not play around.
    const line = describeRead(read);
    check(`${skill.id} has a sentence for the tooltip`, !!line && line.length > 8, String(line));
  }

  // ONE PER WEAPON TREE, the same rule the status system itself was built
  // under. A sequencing mechanic six trees cannot play is one six weapons watch.
  for (const weapon of WEAPON_TYPES.concat("fist")) {
    const mine = talentTree(weapon).filter((n) => n.active && SKILLS[n.active].reads);
    check(`${weapon} has a skill that reads a status`, mine.length > 0);
  }

  // And the pair is learnable inside one tree: whatever a tree's reader looks
  // for on a TARGET, that tree must also be able to put there. A read on the
  // caster is exempt — a cleanse needs no source, and Onslaught reads the buffs
  // its own tree grants directly.
  for (const weapon of WEAPON_TYPES.concat("fist")) {
    const tree = talentTree(weapon);
    const grants = new Set();
    for (const n of tree) {
      if (n.active && SKILLS[n.active].applies) grants.add(SKILLS[n.active].applies);
    }
    for (const n of tree) {
      const read = n.active ? SKILLS[n.active].reads : null;
      if (!read || read.on !== "target") continue;
      const ids = read.any?.length ? [...read.any] : statusGroupIds(read.group);
      check(
        `${weapon} can set up its own ${n.active}`,
        ids.some((id) => grants.has(id)),
        `tree grants ${[...grants].join(", ") || "nothing"}; ${n.active} wants ${ids.join(", ")}`,
      );
    }
  }

  // A reader has to be reachable: the tier gates run 1/3/6/10/15 and a weapon
  // caps at 20, so a node above the last tier could never be bought at all.
  for (const weapon of WEAPON_TYPES.concat("fist")) {
    for (const n of talentTree(weapon)) {
      if (!n.active || !SKILLS[n.active].reads) continue;
      check(`${weapon}.${n.active} sits inside the tiers`, n.tier <= 4, `tier ${n.tier}`);
    }
  }

  // --- the resolver itself ---------------------------------------------------
  // The half that can fail while every table above is right.
  const now = 1_000_000;
  const burning = [{ id: "burning", endsAt: now + 5000 }];
  const combust = SKILLS.combust;
  check("a detonator finds its condition", findRead(combust.reads, burning) === "burning");
  check(
    "and is worth its bonus",
    readMultiplier(combust.reads, findRead(combust.reads, burning)) === combust.reads.bonus,
  );
  check("and finds nothing on a clean target", findRead(combust.reads, []) === null);
  check("which is worth exactly one", readMultiplier(combust.reads, null) === 1);
  check("no read at all is also worth one", readMultiplier(undefined, "burning") === 1);

  // Soonest-expiring first. Spending the burn with half a second left rather
  // than the fresh one is what a player would do by hand, and a detonator that
  // eats the wrong one is a detonator nobody presses twice.
  const two = [
    { id: "bleeding", endsAt: now + 7000 },
    { id: "poisoned", endsAt: now + 900 },
  ];
  check(
    "a read takes the one about to run out",
    findRead(SKILLS.execute.reads, two) === "poisoned",
    String(findRead(SKILLS.execute.reads, two)),
  );

  // A group read covers the whole family and nothing outside it.
  check("a dot read covers a burn", readCovers(SKILLS.execute.reads, "burning"));
  check("and not a mark", !readCovers(SKILLS.execute.reads, "marked"));
  check(
    "an explicit read covers only what it names",
    readCovers(SKILLS.killshot.reads, "marked") && !readCovers(SKILLS.killshot.reads, "burning"),
  );

  // Onslaught is the only skill in the game that spends something GOOD, which
  // is what makes it a decision rather than a bonus.
  check(
    "Onslaught reads your own buffs",
    SKILLS.onslaught.reads.group === "buff" && SKILLS.onslaught.reads.on === "self",
  );
  check("and spends them", SKILLS.onslaught.reads.consume === true);
  check(
    "a cleanse can lift Weakened",
    readCovers(SKILLS.secondbreath.reads, "weakened") &&
      readCovers(SKILLS.wardoff.reads, "weakened"),
  );
  check("and cannot lift a buff", !readCovers(SKILLS.secondbreath.reads, "rallied"));

  console.log(
    `  ${readers.length} readers: ` +
      readers.map((s) => `${s.id}(${s.reads.consume ? "spends" : "reads"})`).join(", "),
  );
}

// --- done -------------------------------------------------------------------
console.log(
  failures === 0
    ? "\nOK — statuses are one table, and nothing stacks into a wall"
    : `\n${failures} FAILURES`,
);
process.exitCode = failures ? 1 : 0;
