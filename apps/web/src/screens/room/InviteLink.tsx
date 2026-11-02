import { useEffect, useId, useRef, useState } from "react";

type Copied = "idle" | "copied" | "manual";

export function InviteLink({ gameId }: { gameId: string }) {
  const url = `${window.location.origin}/games/${gameId}`;
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState<Copied>("idle");

  useEffect(() => {
    if (copied === "idle") return;
    const timer = window.setTimeout(() => setCopied("idle"), 4000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      // No clipboard (an insecure page, a refusal): select the link so the user can copy it.
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopied("manual");
    }
  }

  return (
    <section className="room__panel" aria-labelledby="room-invite">
      <h2 id="room-invite" className="room__h2">
        Invite link
      </h2>
      <p className="room__text">Anyone with the link can join while seats are free.</p>
      <div className="room__row">
        <label className="room__sr" htmlFor={inputId}>
          Link
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="room__input room__input--link"
          type="text"
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" className="room__button" onClick={() => void copy()}>
          {copied === "copied" ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="room__hint" role="status" aria-live="polite">
        {copied === "copied" && "Link copied. Paste it anywhere to invite people."}
        {copied === "manual" && "The link is selected. Press Ctrl+C or Cmd+C to copy it."}
      </p>
    </section>
  );
}
