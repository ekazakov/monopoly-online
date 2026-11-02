import { seatNameSchema } from "@monopoly/shared";
import { useId, useState, type FormEvent, type RefObject } from "react";
import { errorText } from "./roomModel.ts";
import type { useRoomActions } from "./useRoomActions.ts";

interface Props {
  add: ReturnType<typeof useRoomActions>["add"];
  inputRef: RefObject<HTMLInputElement | null>;
}

export function AddSeatForm({ add, inputRef }: Props) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (add.isPending) return;
    const parsed = seatNameSchema.safeParse(value);
    if (!parsed.success) {
      setProblem(
        value.trim().length > 16 ? "Use 16 characters or fewer." : "Use at least 2 characters.",
      );
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
        setProblem(errorText("add", error));
        inputRef.current?.focus();
      },
    });
  }

  return (
    <section className="room__panel" aria-labelledby="room-add">
      <h2 id="room-add" className="room__h2">
        Add a player on this device
      </h2>
      <p className="room__text">
        For someone sitting with you. You pass your device between their turns.
      </p>
      <form className="room__row" onSubmit={onSubmit} noValidate>
        <label className="room__sr" htmlFor={inputId}>
          Name
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
          placeholder="Name"
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
          {add.isPending ? "Adding" : "Add seat"}
        </button>
      </form>
      <p id={hintId} className="room__hint" data-tone={problem ? "error" : undefined}>
        <span role={problem ? "alert" : undefined}>
          {problem ?? "2 to 16 characters. Each name is used once in a game."}
        </span>
      </p>
    </section>
  );
}
