import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { gameNameSchema } from "@monopoly/shared";
import { useId, useState, type FormEvent } from "react";
import { createGame } from "../../api/index.ts";
import { gameIdFromInvite } from "./joinLink.ts";

/** Create a game, or open one from a pasted link. */
export function NewGamePanel({ userName }: { userName: string }) {
  const navigate = useNavigate();
  const nameId = useId();
  const linkId = useId();

  const [name, setName] = useState(`${userName}'s game`);
  const [nameProblem, setNameProblem] = useState<string | null>(null);
  const [invite, setInvite] = useState("");
  const [inviteProblem, setInviteProblem] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: createGame,
    onSuccess: (game) => navigate({ to: "/games/$gameId", params: { gameId: game.id } }),
  });

  function submitCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = gameNameSchema.safeParse(name);
    if (!parsed.success) {
      setNameProblem(
        name.trim() === "" ? "Enter a name for the game." : "Use 60 characters or fewer.",
      );
      return;
    }
    setNameProblem(null);
    create.mutate(parsed.data);
  }

  function submitJoin(event: FormEvent) {
    event.preventDefault();
    const gameId = gameIdFromInvite(invite);
    if (!gameId) {
      setInviteProblem("This is not a game link. Paste the link you were given.");
      return;
    }
    setInviteProblem(null);
    void navigate({ to: "/games/$gameId", params: { gameId } });
  }

  return (
    <section className="lobby__panel" aria-labelledby={`${nameId}-h`}>
      <h2 id={`${nameId}-h`}>New game</h2>
      <p className="lobby__text">
        All games are public. Join one that is waiting for players, or start your own and invite
        friends.
      </p>
      <form onSubmit={submitCreate} noValidate>
        <label htmlFor={nameId}>Game name</label>
        <input
          id={nameId}
          className="lobby__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          aria-invalid={nameProblem ? true : undefined}
          aria-describedby={nameProblem ? `${nameId}-err` : undefined}
        />
        {nameProblem && (
          <p id={`${nameId}-err`} className="lobby__error" role="alert">
            {nameProblem}
          </p>
        )}
        <button
          type="submit"
          className="lobby__button lobby__button--primary"
          disabled={create.isPending}
        >
          {create.isPending ? "Creating…" : "Create game"}
        </button>
        {create.isError && (
          <p className="lobby__error" role="alert">
            Could not create the game. Try again.
          </p>
        )}
      </form>

      <h3 id={`${linkId}-h`}>Join by link</h3>
      <form onSubmit={submitJoin} noValidate aria-labelledby={`${linkId}-h`}>
        <label htmlFor={linkId}>Game link</label>
        <input
          id={linkId}
          className="lobby__input"
          value={invite}
          onChange={(event) => setInvite(event.target.value)}
          autoComplete="off"
          placeholder="Paste the invite link"
          aria-invalid={inviteProblem ? true : undefined}
          aria-describedby={inviteProblem ? `${linkId}-err` : undefined}
        />
        {inviteProblem && (
          <p id={`${linkId}-err`} className="lobby__error" role="alert">
            {inviteProblem}
          </p>
        )}
        <button type="submit" className="lobby__button">
          Open game
        </button>
      </form>
    </section>
  );
}
