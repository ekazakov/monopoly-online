import { useState } from "react";
import type { ApiError } from "../../../api.ts";
import { useGameActions } from "../../../game/index.ts";

// The live region stays in the DOM, so a screen reader announces the message that appears in it.
export function ErrorNotice() {
  const { error, errorSource } = useGameActions();
  const [dismissed, setDismissed] = useState<ApiError | null>(null);
  // The hand and the menu show the errors of their own sends.
  const shown = error && !errorSource && error !== dismissed ? error : null;

  return (
    <div className="turn-area__errors" role="status" aria-live="polite" aria-atomic="true">
      {shown && (
        <div className="turn-area__error" data-code={shown.code}>
          <p className="turn-area__error-text">{shown.message}</p>
          <button
            type="button"
            className="turn-area__btn turn-area__btn--outline turn-area__btn--small"
            onClick={() => setDismissed(shown)}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
