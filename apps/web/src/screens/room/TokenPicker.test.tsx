import { TOKENS } from "@monopoly/shared";
import type { Game, Seat } from "@monopoly/shared";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { roomMessage } from "../../game/fixtures.ts";
import { sessionKey } from "../../session/index.ts";
import { errorReply, gameFixture, mockApi, userFixture } from "../../testing/fakeApi.ts";
import { FakeRealtimeClient } from "../../testing/fakeRealtime.ts";
import { createTestQueryClient, renderRoute } from "../../testing/render.tsx";

const base = gameFixture();
const gameId = base.id;
const me = userFixture.id;
const otherId = "1b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d02";
const visitorId = "9b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d09";

// The host has the dog. Ines is a guest with the cat. Tove is a hot-seat seat of the host.
const owner = base.seats[0]!;
const seatOf = (n: number, fields: Partial<Seat>): Seat => ({
  id: `5b0f7a3e-3a53-4c2e-9a53-2f0d5f6f9d${String(40 + n)}`,
  order: n,
  name: `Seat${String(n)}`,
  kind: "user",
  userId: me,
  controllerUserId: me,
  token: TOKENS[n - 1]!,
  ...fields,
});
const ines = seatOf(2, { name: "Ines", userId: otherId, controllerUserId: otherId });
const tove = seatOf(3, { name: "Tove", kind: "hotseat", userId: null });

const room = (seats: Seat[], fields: Partial<Game> = {}) => gameFixture({ seats, ...fields });
const tokenUrl = (seatId: string) => `/api/games/${gameId}/seats/${seatId}/token`;

async function setup(game: Game, userId = me, routes: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({ [`GET /api/games/${gameId}`]: Response.json({ game }), ...routes });
  const realtime = new FakeRealtimeClient();
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(sessionKey, { ...userFixture, id: userId });
  const view = await renderRoute(`/games/${gameId}`, queryClient, { realtime });
  return { ...view, calls, realtime, user: userEvent.setup() };
}

const pickerOf = (name: string) => within(screen.getByRole("group", { name }));
const pressed = (name: string) =>
  pickerOf(name)
    .getAllByRole("button")
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.getAttribute("aria-label"));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("token picker", () => {
  test("the owner picks from six figures; their own is pressed", async () => {
    await setup(room([owner, ines]));
    await screen.findByRole("group", { name: "Your token" });
    expect(screen.getByRole("heading", { name: "Your token" })).toBeVisible();
    expect(pickerOf("Your token").getAllByRole("button")).toHaveLength(6);
    expect(pressed("Your token")).toEqual(["Scottish terrier"]);
    expect(pickerOf("Your token").getByRole("button", { name: "Horse" })).toBeEnabled();
    expect(pickerOf("Your token").getByRole("button", { name: "Duck" })).toBeEnabled();
  });

  test("a figure that another seat has is disabled and says who has it", async () => {
    await setup(room([owner, ines]));
    const taken = await screen.findByRole("button", { name: "Cat, taken by Ines" });
    expect(taken).toBeDisabled();
    expect(taken).toHaveAttribute("aria-pressed", "false");
    expect(within(taken).getByText("Ines")).toBeVisible();
  });

  test("seat rows show the avatar with its token", async () => {
    await setup(room([owner, ines]));
    expect(await screen.findByRole("img", { name: "Marlow, Scottish terrier" })).toBeVisible();
    expect(screen.getByRole("img", { name: "Ines, Cat" })).toBeVisible();
  });

  test("picking a free figure calls the API and moves the pressed state", async () => {
    const { user, calls } = await setup(room([owner, ines]), me, {
      [`PUT ${tokenUrl(owner.id)}`]: Response.json({
        game: room([{ ...owner, token: "horse" }, ines]),
      }),
    });
    await user.click(await screen.findByRole("button", { name: "Horse" }));
    await waitFor(() => expect(pressed("Your token")).toEqual(["Horse"]));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      path: tokenUrl(owner.id),
      body: { token: "horse" },
    });
    // The figure that was freed can be taken now.
    expect(pickerOf("Your token").getByRole("button", { name: "Scottish terrier" })).toBeEnabled();
    expect(screen.getByRole("img", { name: "Marlow, Horse" })).toBeVisible();
  });

  test("token_taken shows the error, keeps the old figure and reads the room again", async () => {
    let reads = 0;
    const { user } = await setup(room([owner, ines]), me, {
      [`GET /api/games/${gameId}`]: () => {
        reads += 1;
        // After the refusal the room shows that the duck went to another seat.
        return Response.json({
          game: room(reads > 1 ? [owner, { ...ines, token: "duck" }] : [owner, ines]),
        });
      },
      [`PUT ${tokenUrl(owner.id)}`]: errorReply(409, "token_taken"),
    });
    await user.click(await screen.findByRole("button", { name: "Duck" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("took that figure");
    expect(pressed("Your token")).toEqual(["Scottish terrier"]);
    expect(await screen.findByRole("button", { name: "Duck, taken by Ines" })).toBeDisabled();
  });

  test("a guest has a picker for their own seat only", async () => {
    await setup(room([owner, ines]), otherId);
    await screen.findByRole("group", { name: "Your token" });
    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(pressed("Your token")).toEqual(["Cat"]);
    expect(
      pickerOf("Your token").getByRole("button", { name: "Scottish terrier, taken by Marlow" }),
    ).toBeDisabled();
  });

  test("each seat the device controls has a picker, and a hot-seat pick sends its seat", async () => {
    const { user, calls } = await setup(room([owner, ines, tove]), me, {
      [`PUT ${tokenUrl(tove.id)}`]: Response.json({
        game: room([owner, ines, { ...tove, token: "car" }]),
      }),
    });
    await screen.findByRole("group", { name: "Your token" });
    expect(screen.getByRole("heading", { name: "Tokens" })).toBeVisible();
    expect(pressed("Your token")).toEqual(["Scottish terrier"]);
    expect(pressed("Tove's token")).toEqual(["Penguin"]);
    // The figures of other seats are disabled in every picker.
    expect(
      pickerOf("Tove's token").getByRole("button", { name: "Cat, taken by Ines" }),
    ).toBeDisabled();

    await user.click(pickerOf("Tove's token").getByRole("button", { name: "Racing car" }));
    await waitFor(() => expect(pressed("Tove's token")).toEqual(["Racing car"]));
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({
      path: tokenUrl(tove.id),
      body: { token: "car" },
    });
  });

  test("a room.updated from the stream disables the figure another seat took", async () => {
    const { realtime } = await setup(room([owner, ines]));
    expect(await screen.findByRole("button", { name: "Horse" })).toBeEnabled();
    act(() => realtime.emit(roomMessage(room([owner, { ...ines, token: "horse" }]))));
    expect(await screen.findByRole("button", { name: "Horse, taken by Ines" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cat" })).toBeEnabled();
  });

  test("a visitor has no picker", async () => {
    await setup(room([owner]), visitorId);
    await screen.findByRole("button", { name: "Join game" });
    expect(screen.queryByRole("group", { name: "Your token" })).toBeNull();
  });
});
