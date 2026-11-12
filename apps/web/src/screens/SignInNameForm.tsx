import { displayNameSchema, type User } from "@monopoly/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError } from "../api.ts";
import { useT } from "../i18n/index.ts";
import type { Translate } from "../i18n/index.ts";
import "./SignInScreen.css";

const NAME_MAX = 16;

type ProblemKey = "short" | "long" | "taken" | "failed";

// Local rules come from the shared schema, so the form and the API agree.
function checkName(value: string): ProblemKey | null {
  if (displayNameSchema.safeParse(value).success) return null;
  return value.trim().length > NAME_MAX ? "long" : "short";
}

function serverProblem(
  error: unknown,
  value: string,
  t: Translate,
): { key: ProblemKey; text: string } {
  if (error instanceof ApiError) {
    if (error.code === "name_taken") return { key: "taken", text: t("nameForm.taken") };
    if (error.status === 400) {
      const local = checkName(value);
      if (local) return { key: local, text: t(`nameForm.${local}`) };
      const issue = error.issues.find((i) => i.path[0] === "name");
      if (issue) return { key: "short", text: issue.message };
    }
  }
  // 5xx, a lost connection and any other answer look the same to the user.
  return { key: "failed", text: t("nameForm.failed") };
}

export function Icon({ kind }: { kind: "ok" | "error" }) {
  return (
    <svg
      className="sign-in__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "ok" ? (
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v6M12 16.5v.5" />
        </>
      )}
    </svg>
  );
}

type NameFormProps = {
  /** The request that signs the user in with the name. */
  mutation: UseMutationResult<User, Error, string>;
  onSuccess: () => void;
  /** Return true to say the error is handled, so the form shows no message for it. */
  onFailure?: (error: unknown) => boolean;
};

/** The display name form of the guest sign-in and of the Google name step. */
export function SignInNameForm({ mutation, onSuccess, onFailure }: NameFormProps) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  // Checks run on submit. After the first error they run on every keystroke.
  const [live, setLive] = useState(false);
  const [failure, setFailure] = useState<{ key: ProblemKey; text: string } | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Stays busy after success until the router has left this screen.
  const busy = mutation.isPending || mutation.isSuccess;
  const length = value.trim().length;
  const local = checkName(value);
  const problem = failure ?? (live && local ? { key: local, text: t(`nameForm.${local}`) } : null);
  // A failed request says nothing about the name, so the field is not marked invalid then.
  const fieldProblem = problem && problem.key !== "failed";
  const valid = !problem && !busy && !focused && local === null;

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value);
    setFailure(null);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = displayNameSchema.safeParse(value);
    if (!parsed.success) {
      setLive(true);
      inputRef.current?.focus();
      return;
    }
    setFailure(null);
    mutation.mutate(parsed.data, {
      onSuccess,
      onError: (error) => {
        if (onFailure?.(error)) return;
        setLive(true);
        setFailure(serverProblem(error, value, t));
        inputRef.current?.focus();
      },
    });
  }

  let hint: { text: string; tone: "plain" | "ok" | "error" } = {
    text: t("nameForm.hint"),
    tone: "plain",
  };
  if (busy) hint = { text: t("nameForm.pending"), tone: "plain" };
  else if (problem) hint = { text: problem.text, tone: "error" };
  else if (valid) hint = { text: t("nameForm.valid"), tone: "ok" };

  return (
    <form className="sign-in__form" onSubmit={onSubmit} noValidate>
      <div className="sign-in__field">
        <label className="sign-in__label" htmlFor={inputId}>
          {t("nameForm.label")}
        </label>
        <div
          className="sign-in__control"
          data-tone={fieldProblem ? "error" : valid ? "ok" : "plain"}
          data-busy={busy || undefined}
        >
          <input
            ref={inputRef}
            id={inputId}
            className="sign-in__input"
            type="text"
            value={value}
            onChange={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("nameForm.placeholder")}
            autoComplete="nickname"
            autoCapitalize="words"
            spellCheck={false}
            aria-describedby={hintId}
            aria-invalid={fieldProblem ? true : undefined}
            aria-busy={busy || undefined}
            readOnly={busy}
          />
        </div>
        <div className="sign-in__meta">
          {/* A new element per kind of message, so a screen reader reads each alert when it appears. */}
          <span
            key={hint.tone === "error" ? hint.text : hint.tone}
            id={hintId}
            className="sign-in__hint"
            data-tone={hint.tone}
            role={hint.tone === "error" ? "alert" : undefined}
          >
            {hint.tone !== "plain" && <Icon kind={hint.tone} />}
            {hint.text}
          </span>
          <span className="sign-in__count" aria-hidden="true">
            {length}/{NAME_MAX}
          </span>
        </div>
      </div>
      <button
        type="submit"
        className="sign-in__submit"
        aria-disabled={busy || undefined}
        aria-busy={busy || undefined}
      >
        {busy && <span className="sign-in__spinner" aria-hidden="true" />}
        {busy ? t("nameForm.submitBusy") : t("nameForm.submit")}
      </button>
    </form>
  );
}
