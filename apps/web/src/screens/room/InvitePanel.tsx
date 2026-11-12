import { displayNameSchema } from "@monopoly/shared";
import { useId, useRef, useState, type FormEvent } from "react";
import { isApiError } from "../../api/index.ts";
import { useT } from "../../i18n/index.ts";
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
  const t = useT();
  const inputId = useId();
  const resultId = `${inputId}-result`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  function fail(name: string, error: unknown) {
    const text =
      isApiError(error) && error.code === "user_not_found"
        ? t("room.invite.userNotFound", { name })
        : errorText("invite", error, t);
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
        text: value.trim().length > 16 ? t("nameForm.long") : t("nameForm.short"),
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
        setResult({ tone: "ok", text: t("room.invite.sent", { name: sent?.name ?? name }) });
        setValue("");
        inputRef.current?.focus();
      },
      onError: (error) => fail(name, error),
    });
  }

  return (
    <section className="room__panel" aria-labelledby="room-invite">
      <h2 id="room-invite" className="room__h2">
        {t("room.invite.title")}
      </h2>
      <p className="room__text">{t("room.invite.text")}</p>
      <form className="room__row" onSubmit={onSubmit} noValidate>
        <label className="room__sr" htmlFor={inputId}>
          {t("room.invite.label")}
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
          placeholder={t("room.invite.label")}
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
          {invite.isPending ? t("room.invite.inviting") : t("room.invite.submit")}
        </button>
      </form>
      <p id={resultId} className="room__hint" data-tone={result?.tone}>
        <span role={result ? (result.tone === "error" ? "alert" : "status") : undefined}>
          {result?.text ?? t("room.invite.hint")}
        </span>
      </p>
    </section>
  );
}
