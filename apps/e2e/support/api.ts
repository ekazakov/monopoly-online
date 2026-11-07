import { randomUUID } from "node:crypto";
import { expect, type Browser } from "@playwright/test";
import {
  actionResponseSchema,
  createSessionResponseSchema,
  gameResponseSchema,
  gameStateResponseSchema,
  startGameResponseSchema,
  type ActionInput,
  type DebugChange,
  type Game,
  type RedactedGameState,
  type Seat,
} from "../../../packages/shared/src/index.ts";
import { createDevice, test, type Device, type Table } from "./game.ts";

interface SignedInDevice extends Device {
  userId: string;
}

export interface ApiTable extends Table {
  alice: SignedInDevice;
  bob: SignedInDevice;
  game: Game;
  seats: { alice: Seat; bob: Seat; cara: Seat | undefined };
}

async function post(device: Device, path: string, data?: unknown): Promise<unknown> {
  const response = await device.context.request.post(path, { data });
  expect(response.ok(), `POST ${path}: ${response.status()} ${await response.text()}`).toBe(true);
  return response.json();
}

async function signIn(browser: Browser, name: string): Promise<SignedInDevice> {
  const device = await createDevice(browser, name);
  const { user } = createSessionResponseSchema.parse(await post(device, "/api/session", { name }));
  return { ...device, userId: user.id };
}

/** Real sessions, room, seats and start. Each device keeps the cookie from its API requests. */
export async function startGame(
  browser: Browser,
  tag: string,
  { hotSeat = true } = {},
): Promise<ApiTable> {
  const run = randomUUID().slice(0, 8);
  const alice = await signIn(browser, `Alice${run}`);
  const bob = await signIn(browser, `Bob${run}`);
  const created = gameResponseSchema.parse(
    await post(alice, "/api/games", { name: `${tag} ${run}` }),
  ).game;
  await post(bob, `/api/games/${created.id}/join`);
  if (hotSeat) await post(alice, `/api/games/${created.id}/seats`, { name: "Cara" });
  const { game, state } = startGameResponseSchema.parse(
    await post(alice, `/api/games/${created.id}/start`),
  );
  expect(state.version).toBe(0);
  const ownSeat = (userId: string) => {
    const seat = game.seats.find((candidate) => candidate.userId === userId);
    if (!seat) throw new Error(`No user seat for ${userId}`);
    return seat;
  };
  const roomUrl = new URL(`/games/${game.id}`, test.info().project.use.baseURL).href;
  const gameUrl = `${roomUrl}/play`;
  const table: ApiTable = {
    alice,
    bob,
    game,
    roomUrl,
    gameUrl,
    seats: {
      alice: ownSeat(alice.userId),
      bob: ownSeat(bob.userId),
      cara: game.seats.find((seat) => seat.kind === "hotseat"),
    },
  };
  // Both streams must be open before setup actions, so later checks prove live propagation.
  for (const device of [alice, bob]) {
    const stream = device.page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/stream" &&
        url.searchParams.get("topics")?.split(",").includes(`game:${game.id}`) === true &&
        response.ok()
      );
    });
    await device.page.goto(gameUrl);
    await stream;
    await expect(device.page.getByRole("button", { name: "Menu", exact: true })).toBeVisible();
  }
  return table;
}

export async function readState(table: ApiTable): Promise<RedactedGameState> {
  const response = await table.alice.context.request.get(`/api/games/${table.game.id}/state`);
  expect(response.ok(), `GET state: ${response.status()} ${await response.text()}`).toBe(true);
  return gameStateResponseSchema.parse(await response.json()).state;
}

/** Use the controller's cookie and a new action id, with the latest server version. */
export async function sendAction(table: ApiTable, action: ActionInput, seatId?: string) {
  const state = await readState(table);
  const actorId =
    seatId ?? state.auction?.actorId ?? state.trade?.toId ?? state.turn.currentPlayerId;
  const seat = table.game.seats.find((candidate) => candidate.id === actorId);
  const device = [table.alice, table.bob].find(
    (candidate) => candidate.userId === seat?.controllerUserId,
  );
  if (!device) throw new Error(`No device controls seat ${actorId}`);
  return actionResponseSchema.parse(
    await post(device, `/api/games/${table.game.id}/actions`, {
      seatId: actorId,
      action,
      expectedVersion: state.version,
      clientActionId: randomUUID(),
    }),
  );
}

export async function debugEdit(table: ApiTable, changes: DebugChange[]) {
  return sendAction(table, { type: "DebugEdit", changes });
}

async function advanceToRoll(table: ApiTable): Promise<RedactedGameState> {
  for (let steps = 0; steps < 40; steps++) {
    const state = await readState(table);
    switch (state.turn.phase) {
      case "awaiting_roll":
        return state;
      case "awaiting_buy_decision":
        await sendAction(table, { type: "BuyProperty" });
        break;
      case "awaiting_end_turn":
        await sendAction(table, { type: "EndTurn" });
        break;
      case "awaiting_jail_choice":
        await sendAction(table, { type: "PayJailFine" });
        break;
      case "awaiting_bid":
        await sendAction(table, { type: "PassBid" });
        break;
      default:
        throw new Error(`Cannot prepare a roll in phase ${state.turn.phase}`);
    }
  }
  throw new Error("More than 40 actions were needed to reach a roll");
}

/** Buy policy from the plan. Finish the last landing and turn, ready for the next UI roll. */
export async function playRolls(table: ApiTable, count: number) {
  const dice: Array<[number, number]> = [];
  for (let roll = 0; roll < count; roll++) {
    await advanceToRoll(table);
    const result = await sendAction(table, { type: "RollDice" });
    const event = result.events.find((candidate) => candidate.type === "DiceRolled");
    if (!event || event.type !== "DiceRolled") throw new Error("The roll had no DiceRolled event");
    dice.push(event.dice);
  }
  await advanceToRoll(table);
  return dice;
}
