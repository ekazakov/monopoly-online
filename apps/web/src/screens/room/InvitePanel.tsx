import { displayNameSchema } from "@monopoly/shared";
import { useId, useRef, useState, type FormEvent } from "react";
import { isApiError } from "../../api/index.ts";
import { errorText } from "./roomModel.ts";
import type { useRoomActions } from "./useRoomActions.ts";

interface Props {
  invite: ReturnType<typeof useRoomActions>["invite"];
}

type Result = { tone: "ok" | "error"; text: string };

/**
 * "Invite by name" for the host (board LobbyStates). The match is exact and ignores case, so
 * there is no list of suggestions: the answer is one of the states of the board. A pending
 * invite shows as a row in the player list, which the room announces itself.
 */
export function InvitePanel({ invite }: Props) {
  const inputId = useId();
  const resultId = `${inputId}-result`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  function fail(name: string, error: unknown) {
    const text =
      isApiError(error) && error.code === "user_not_found"
        ? `No player called "${name}". Check the spelling, or share the invite link instead.`
        : errorText("invite", error);
    setResult({ tone: "error", text });
    inputRef.current?.focus();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (invite.isPending) return;
    const parsed = displayNameSchema.safeParse(value);
    if (!parsed.success) {
      setResult({
        tone: "error",
        text:
          value.trim().length > 16 ? "Use 16 characters or fewer." : "Use at least 2 characters.",
      });
      inputRef.current?.focus();
      return;
    }
    setResult(null);
    const name = parsed.data;
    invite.mutate(name, {
      onSuccess: (game) => {
        // The room answers with the invite under the exact name of the player.
        const sent = game.invites.find((i) => i.name.toLowerCase() === name.toLowerCase());
        setResult({ tone: "ok", text: `Invite sent to ${sent?.name ?? name}.` });
        setValue("");
        inputRef.current?.focus();
      },
      onError: (error) => fail(name, error),
    });
  }

  return (
    <section className="room__panel" aria-labelledby="room-invite">
      <h2 id="room-invite" className="room__h2">
        Invite by name
      </h2>
      <p className="room__text">
        The player sees the invite in their lobby at once. It does not hold a seat.
      </p>
      <form className="room__row" onSubmit={onSubmit} noValidate>
        <label className="room__sr" htmlFor={inputId}>
          Player name
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="room__input"
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setResult(null);
          }}
          placeholder="Player name"
          autoComplete="off"
          spellCheck={false}
          readOnly={invite.isPending}
          aria-describedby={resultId}
          aria-invalid={result?.tone === "error" ? true : undefined}
        />
        <button
          type="submit"
          className="room__button"
          aria-disabled={invite.isPending || undefined}
          aria-busy={invite.isPending || undefined}
        >
          {invite.isPending ? "Inviting" : "Invite"}
        </button>
      </form>
      <p id={resultId} className="room__hint" data-tone={result?.tone}>
        <span role={result ? (result.tone === "error" ? "alert" : "status") : undefined}>
          {result?.text ?? "Type the exact name. Capital letters do not matter."}
        </span>
      </p>
    </section>
  );
}
