import { parseArgs } from "node:util";
import { SQUARES } from "../../../packages/game-engine/src/index.ts";
import { replaySeed } from "../support/seed-replay.ts";

const { values } = parseArgs({
  options: {
    players: { type: "string", default: "3" },
    roll: { type: "string", default: "7" },
    dice: { type: "string", default: "3,3" },
    from: { type: "string", default: "1" },
    to: { type: "string", default: "10000" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(
    "Usage: pnpm --filter @monopoly/e2e find-seed [--players 2..6] [--roll 7] [--dice 3,3] [--from 1] [--to 10000]",
  );
} else {
  const players = Number(values.players);
  const count = Number(values.roll);
  const from = Number(values.from);
  const to = Number(values.to);
  const dice = values.dice.split(",").map(Number);
  if (
    !Number.isInteger(players) ||
    players < 2 ||
    players > 6 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100 ||
    !Number.isInteger(from) ||
    from < 0 ||
    !Number.isInteger(to) ||
    to < from ||
    to > 0xffffffff ||
    dice.length !== 2 ||
    dice.some((die) => !Number.isInteger(die) || die < 1 || die > 6)
  ) {
    throw new Error(
      "Use 2 to 6 players, 1 to 100 rolls, two dice from 1 to 6, and an ordered uint32 seed range",
    );
  }
  let found = false;
  for (let seed = from; seed <= to; seed++) {
    let replay: ReturnType<typeof replaySeed>;
    try {
      replay = replaySeed(seed, players, count);
    } catch {
      // A game can end or need debt decisions before the requested roll. Try the next seed.
      continue;
    }
    const last = replay.rolls.at(-1)!;
    if (last.dice[0] !== dice[0] || last.dice[1] !== dice[1]) continue;
    console.log(`Seed ${seed}; ${players} seats; turn order: ${replay.turnOrder.join(", ")}`);
    console.table(
      replay.rolls.map((roll, index) => ({
        roll: index + 1,
        player: roll.player,
        dice: roll.dice.join(","),
        square: roll.square,
        name: SQUARES[roll.square]?.name,
        phase: roll.phase,
      })),
    );
    found = true;
    break;
  }
  if (!found) {
    console.error(
      `No seed from ${from} to ${to} reached roll ${count} with dice ${dice.join(",")}`,
    );
    process.exitCode = 1;
  }
}
