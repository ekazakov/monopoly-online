import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { gameNameSchema } from "@monopoly/shared";
import { useId, useState, type FormEvent } from "react";
import { createGame } from "../api/index.ts";
import { useSession, useSignOut } from "../session/index.ts";
import "./HomeScreen.css";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// The game id is the invite: accept a pasted link (`.../games/<uuid>`) or the bare id.
export function gameIdFromInvite(text: string): string | null {
  return text.match(UUID)?.[0].toLowerCase() ?? null;
}

export function HomeScreen() {
  const { data: user } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const nameId = useId();
  const linkId = useId();

  const [name, setName] = useState(() => (user ? `${user.name}'s game` : ""));
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
    <main className="screen home">
      <h1>Home</h1>
      <p>
        Signed in as <strong>{user?.name}</strong>
      </p>

      <section className="home__panel" aria-labelledby={`${nameId}-h`}>
        <h2 id={`${nameId}-h`}>New game</h2>
        <form onSubmit={submitCreate} noValidate>
          <label htmlFor={nameId}>Game name</label>
          <input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            aria-invalid={nameProblem ? true : undefined}
            aria-describedby={nameProblem ? `${nameId}-err` : undefined}
          />
          {nameProblem && (
            <p id={`${nameId}-err`} className="home__error" role="alert">
              {nameProblem}
            </p>
          )}
          <button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create game"}
          </button>
          {create.isError && (
            <p className="home__error" role="alert">
              Could not create the game. Try again.
            </p>
          )}
        </form>
      </section>

      <section className="home__panel" aria-labelledby={`${linkId}-h`}>
        <h2 id={`${linkId}-h`}>Join a game</h2>
        <form onSubmit={submitJoin} noValidate>
          <label htmlFor={linkId}>Game link</label>
          <input
            id={linkId}
            value={invite}
            onChange={(event) => setInvite(event.target.value)}
            autoComplete="off"
            placeholder="Paste the invite link"
            aria-invalid={inviteProblem ? true : undefined}
            aria-describedby={inviteProblem ? `${linkId}-err` : undefined}
          />
          {inviteProblem && (
            <p id={`${linkId}-err`} className="home__error" role="alert">
              {inviteProblem}
            </p>
          )}
          <button type="submit">Open game</button>
        </form>
      </section>

      <button
        type="button"
        disabled={signOut.isPending}
        onClick={() =>
          signOut.mutate(undefined, { onSuccess: () => void navigate({ to: "/sign-in" }) })
        }
      >
        Sign out
      </button>
      {signOut.isError && <p role="alert">Could not sign out. Try again.</p>}
    </main>
  );
}
