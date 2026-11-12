import { useEffect, useRef, useState } from "react";
import { useT } from "../../../i18n/index.ts";
import { PawnStage } from "./PawnStage.tsx";
import { useTurnNotice } from "./useTurnNotice.ts";
import "./TurnToast.css";

/** The regions the notice makes inert: all but the top bar, which has the log and the Menu (as `Modal`). */
const BEHIND = ":scope > .game-layout__regions > :not(.game-layout__top)";

/** Width and height of the figure. */
const FIGURE_PX = 150;
/** The whole run: a 500 ms fade in, one second in full view, and a 500 ms fade out. Keep it equal to the CSS animation. */
export const TOAST_MS = 2000;

// The turn notice (spec 5.3, BUG-15). It is the handoff screen without the button: a dark scrim, the
// next player's figure, the name and a sentence. It fades in and out over 500 ms, shows for one second in
// between, closes after `TOAST_MS`, and does not block the controls. The live region is always mounted, so a screen reader
// hears each notice. It is a child of the game layout, outside the game regions.
export function TurnToast({ userId }: { userId: string }) {
  const t = useT();
  const notice = useTurnNotice(userId);
  const [closed, setClosed] = useState<string | null>(null);
  const shown = notice && notice.key !== closed ? notice : null;
  const key = shown?.key;
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (key === undefined) return;
    const timer = window.setTimeout(() => setClosed(key), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  // Disable the controls while the notice shows. The focus returns to where it was when it ends.
  useEffect(() => {
    if (key === undefined) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layout = host.current?.closest<HTMLElement>(".game-layout");
    const behind = [...(layout?.querySelectorAll<HTMLElement>(BEHIND) ?? [])];
    for (const region of behind) region.setAttribute("inert", "");
    return () => {
      for (const region of behind) region.removeAttribute("inert");
      if (opener?.isConnected && !opener.closest("[inert]")) opener.focus({ preventScroll: true });
    };
  }, [key]);

  return (
    <div ref={host} className="turn-toast-host" role="status" aria-live="polite">
      {shown ? (
        <div key={shown.key} className="turn-toast">
          <div className="turn-toast__stage">
            {shown.token ? <PawnStage token={shown.token} size={FIGURE_PX} /> : null}
            <p className="turn-toast__eyebrow">{t("turn.nextTurn")}</p>
            <p className="turn-toast__name">{shown.name}</p>
            <p className="turn-toast__text">{t("toast.turn", { name: shown.name })}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
