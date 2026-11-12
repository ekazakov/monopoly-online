import { seatNameSchema } from "@monopoly/shared";
import { useId, useState, type FormEvent, type RefObject } from "react";
import { useT } from "../../i18n/index.ts";
import { errorText } from "./roomModel.ts";
import type { useRoomActions } from "./useRoomActions.ts";

interface Props {
  add: ReturnType<typeof useRoomActions>["add"];
  inputRef: RefObject<HTMLInputElement | null>;
}

export function AddSeatForm({ add, inputRef }: Props) {
  const t = useT();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (add.isPending) return;
    const parsed = seatNameSchema.safeParse(value);
    if (!parsed.success) {
      setProblem(value.trim().length > 16 ? t("nameForm.long") : t("nameForm.short"));
      inputRef.current?.focus();
      return;
    }
    setProblem(null);
    add.mutate(parsed.data, {
      onSuccess: () => {
        setValue("");
        inputRef.current?.focus();
      },
      onError: (error) => {
        setProblem(errorText("add", error, t));
        inputRef.current?.focus();
      },
    });
  }

  return (
    <section className="room__panel" aria-labelledby="room-add">
      <h2 id="room-add" className="room__h2">
        {t("room.add.title")}
      </h2>
      <p className="room__text">{t("room.add.text")}</p>
      <form className="room__row" onSubmit={onSubmit} noValidate>
        <label className="room__sr" htmlFor={inputId}>
          {t("room.add.label")}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="room__input"
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setProblem(null);
          }}
          placeholder={t("room.add.label")}
          autoComplete="off"
          spellCheck={false}
          readOnly={add.isPending}
          aria-describedby={hintId}
          aria-invalid={problem ? true : undefined}
        />
        <button
          type="submit"
          className="room__button"
          aria-disabled={add.isPending || undefined}
          aria-busy={add.isPending || undefined}
        >
          {add.isPending ? t("room.add.adding") : t("room.add.submit")}
        </button>
      </form>
      <p id={hintId} className="room__hint" data-tone={problem ? "error" : undefined}>
        <span role={problem ? "alert" : undefined}>{problem ?? t("room.add.hint")}</span>
      </p>
    </section>
  );
}
