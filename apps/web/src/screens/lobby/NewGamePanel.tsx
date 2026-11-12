import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { gameNameSchema } from "@monopoly/shared";
import { useId, useState, type FormEvent } from "react";
import { createGame } from "../../api/index.ts";
import { useT } from "../../i18n/index.ts";
import { gameIdFromInvite } from "./joinLink.ts";

/** Create a game, or open one from a pasted link. */
export function NewGamePanel({ userName }: { userName: string }) {
  const t = useT();
  const navigate = useNavigate();
  const nameId = useId();
  const linkId = useId();

  const [name, setName] = useState(() => t("lobby.new.defaultName", { name: userName }));
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
      setNameProblem(name.trim() === "" ? t("lobby.new.nameEmpty") : t("lobby.new.nameLong"));
      return;
    }
    setNameProblem(null);
    create.mutate(parsed.data);
  }

  function submitJoin(event: FormEvent) {
    event.preventDefault();
    const gameId = gameIdFromInvite(invite);
    if (!gameId) {
      setInviteProblem(t("lobby.new.linkInvalid"));
      return;
    }
    setInviteProblem(null);
    void navigate({ to: "/games/$gameId", params: { gameId } });
  }

  return (
    <section className="lobby__panel" aria-labelledby={`${nameId}-h`}>
      <h2 id={`${nameId}-h`}>{t("lobby.new.title")}</h2>
      <p className="lobby__text">{t("lobby.new.text")}</p>
      <form onSubmit={submitCreate} noValidate>
        <label htmlFor={nameId}>{t("lobby.new.nameLabel")}</label>
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
          {create.isPending ? t("lobby.new.creating") : t("lobby.new.create")}
        </button>
        {create.isError && (
          <p className="lobby__error" role="alert">
            {t("lobby.new.createFailed")}
          </p>
        )}
      </form>

      <h3 id={`${linkId}-h`}>{t("lobby.new.joinTitle")}</h3>
      <form onSubmit={submitJoin} noValidate aria-labelledby={`${linkId}-h`}>
        <label htmlFor={linkId}>{t("lobby.new.linkLabel")}</label>
        <input
          id={linkId}
          className="lobby__input"
          value={invite}
          onChange={(event) => setInvite(event.target.value)}
          autoComplete="off"
          placeholder={t("lobby.new.linkPlaceholder")}
          aria-invalid={inviteProblem ? true : undefined}
          aria-describedby={inviteProblem ? `${linkId}-err` : undefined}
        />
        {inviteProblem && (
          <p id={`${linkId}-err`} className="lobby__error" role="alert">
            {inviteProblem}
          </p>
        )}
        <button type="submit" className="lobby__button">
          {t("lobby.new.openGame")}
        </button>
      </form>
    </section>
  );
}
