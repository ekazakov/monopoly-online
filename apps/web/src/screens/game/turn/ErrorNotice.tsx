import { useState } from "react";
import type { ApiError } from "../../../api.ts";
import { useGameActions } from "../../../game/index.ts";
import { errorMessage, useT } from "../../../i18n/index.ts";

// The live region stays in the DOM, so a screen reader announces the message that appears in it.
export function ErrorNotice() {
  const t = useT();
  const { error, errorSource } = useGameActions();
  const [dismissed, setDismissed] = useState<ApiError | null>(null);
  // The hand and the menu show the errors of their own sends.
  const shown = error && !errorSource && error !== dismissed ? error : null;

  return (
    <div className="turn-area__errors" role="status" aria-live="polite" aria-atomic="true">
      {shown && (
        <div className="turn-area__error" data-code={shown.code}>
          <p className="turn-area__error-text">{errorMessage(shown, t)}</p>
          <button
            type="button"
            className="turn-area__btn turn-area__btn--outline turn-area__btn--small"
            onClick={() => setDismissed(shown)}
          >
            {t("turn.dismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
