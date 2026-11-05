import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { Seat } from "@monopoly/shared";
import { useHotSeatHandoff } from "../../../game/index.ts";
import { AvatarIcon } from "../rail/avatars.tsx";
import { tokenLook } from "../../../scene/colors.ts";
import "./HandoffPrompt.css";

/**
 * The "Pass to <name>" interstitial (spec 5.3). It covers the whole game screen with an opaque
 * panel, so the next hand, cash and controls stay hidden, and it makes the screen behind it
 * inert until the next player confirms. It must sit inside `GameLayout`'s `overlay` slot.
 */
export function HandoffPrompt({ userId }: { userId: string }) {
  const { pending, confirm } = useHotSeatHandoff(userId);
  if (!pending) return null;
  return <Handoff seat={pending} onConfirm={confirm} />;
}

function Handoff({ seat, onConfirm }: { seat: Seat; onConfirm: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const look = tokenLook(seat.token);

  // Mounted for the whole handoff: a newer handoff only changes the seat, so the element that
  // had focus before the first prompt is kept.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layout = root.current?.parentElement;
    const behind = layout?.querySelector<HTMLElement>(":scope > .game-layout__regions");
    behind?.setAttribute("inert", "");
    behind?.setAttribute("aria-hidden", "true");
    return () => {
      behind?.removeAttribute("inert");
      behind?.removeAttribute("aria-hidden");
      // The action that ended the turn may have removed the opener: fall back to the next
      // controls, then to the layout itself.
      const target =
        opener?.isConnected && !opener.closest("[inert]")
          ? opener
          : (layout?.querySelector<HTMLElement>('[data-region="centre"] button:not(:disabled)') ??
            layout);
      if (target === layout) layout?.setAttribute("tabindex", "-1");
      target?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    button.current?.focus({ preventScroll: true });
  }, [seat.id]);

  return (
    <div
      ref={root}
      className="handoff"
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
      aria-describedby="handoff-text"
      style={{ "--handoff-colour": look.cssColor } as CSSProperties}
    >
      <div className="handoff__avatar">
        <AvatarIcon kind={look.avatar} size={110} />
      </div>
      <p className="handoff__eyebrow">Next on this device</p>
      <h2 id="handoff-title" className="handoff__title">
        Pass to {seat.name}
      </h2>
      <p id="handoff-text" className="handoff__text">
        It&rsquo;s {seat.name}&rsquo;s turn on this device. Hand it over: {seat.name}&rsquo;s
        properties and actions stay hidden until they confirm.
      </p>
      <button ref={button} type="button" className="handoff__confirm" onClick={onConfirm}>
        I&rsquo;m {seat.name}, start my turn
      </button>
    </div>
  );
}
