// ARMOUR MUST BITE WITHOUT BECOMING IMMUNITY.
//
// Every monster added from here needs an armour number, and the whole point of
// `applyArmor` is that the number can be chosen on its own terms rather than
// against a guess about who will be swinging at it. These are the properties
// that make that true. They are stated as rules rather than as a table of
// expected values, so retuning ARMOR_MIN_THROUGH is allowed and breaking the
// shape is not.
//
//   node tools/test/armour.mjs
import {
  applyArmor,
  ARMOR_MIN_THROUGH,
  MONSTER_STATS,
  playerMinHit,
  playerMaxHit,
} from "../../shared/protocol-types.ts";

let failures = 0;
const check = (name, ok, detail = "") => {
  if (ok) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
};
const section = (t) => console.log(`\n${t}`);

const ARMOURS = [...new Set(Object.values(MONSTER_STATS).map((m) => m.armor))].sort((a, b) => a - b);
console.log(`armour values in the world: ${ARMOURS.join(", ")}`);

section("1. a blow always lands for a meaningful share of itself");
{
  // The floor is the whole fix. Without it the same armour value is a wall to a
  // new character and a rounding error to a levelled one.
  let worst = null;
  for (let damage = 1; damage <= 80; damage++) {
    for (const armor of ARMOURS) {
      const through = applyArmor(damage, armor);
      const share = through / damage;
      if (!worst || share < worst.share) worst = { damage, armor, through, share };
    }
  }
  console.log(
    `  worst case: ${worst.damage} damage against ${worst.armor} armour lands ${worst.through} ` +
      `(${Math.round(worst.share * 100)}%)`,
  );
  check(
    "no armour in the world takes more than 60% of a blow",
    worst.share >= ARMOR_MIN_THROUGH - 0.001 || worst.through === 1,
    `${worst.damage} vs ${worst.armor} left ${worst.through}`,
  );
}

section("2. armour is still flat where flat is what it should be");
{
  // The character of armour — heavy blows shrug it off, light ones do not — only
  // exists while the subtraction is real. If the floor swallowed the whole
  // range, a golem would ask nothing a slime does not.
  const heavy = 60;
  for (const armor of ARMOURS.filter((a) => a > 0)) {
    const through = applyArmor(heavy, armor);
    check(
      `a ${heavy}-damage blow loses the full ${armor} armour`,
      through === heavy - armor,
      `it lost ${heavy - through}`,
    );
  }
}

section("3. more armour is never better for the attacker");
{
  let bad = null;
  for (let damage = 1; damage <= 80 && !bad; damage++) {
    for (let i = 1; i < ARMOURS.length; i++) {
      const less = applyArmor(damage, ARMOURS[i - 1]);
      const more = applyArmor(damage, ARMOURS[i]);
      if (more > less) bad = { damage, a: ARMOURS[i - 1], b: ARMOURS[i], less, more };
    }
  }
  check(
    "damage through never rises as armour rises",
    !bad,
    bad ? `${bad.damage} damage: ${bad.a} armour let ${bad.less} through, ${bad.b} let ${bad.more}` : "",
  );
}

section("4. the monster a new character actually meets");
{
  // The case that started this. A level-1 character swings for about 3, and the
  // goblin is the second creature in the game.
  const avg = Math.round((playerMinHit(0) + playerMaxHit(0, 0)) / 2);
  const goblin = MONSTER_STATS.goblin;
  const through = applyArmor(avg, goblin.armor);
  const swings = Math.ceil(goblin.maxHp / through);
  console.log(`  a new character's ${avg}-damage blow lands ${through} on a goblin: ${swings} landed swings`);
  check(
    "a goblin does not take more than 30 landed swings from a new character",
    swings <= 30,
    `it takes ${swings} — armour ${goblin.armor} against a ${avg}-damage blow`,
  );
  // And the other direction: it must still be the harder fight.
  const slime = MONSTER_STATS.slime;
  const slimeSwings = Math.ceil(slime.maxHp / applyArmor(avg, slime.armor));
  check(
    "and a goblin is still a longer fight than a slime",
    swings > slimeSwings,
    `goblin ${swings} vs slime ${slimeSwings}`,
  );
}

console.log(failures === 0 ? "\nOK — armour bites, and never erases" : `\n${failures} FAILURES`);
process.exitCode = failures ? 1 : 0;
