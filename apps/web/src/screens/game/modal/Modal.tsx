import { useCallback, useId } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import "./Modal.css";

interface ModalProps {
  title: string;
  children: ReactNode;
  /**
   * Set: the dialog has a Close button and closes on Esc. Unset: only the game closes it, by
   * unmounting it, for a dialog that is the phase itself (the auction, the purchase).
   */
  onClose?: () => void;
}

/** The regions that a dialog makes inert: all but the top bar, which has the log and the Menu. */
const BEHIND = ":scope > .game-layout__regions > :not(.game-layout__top)";

// A dialog over the game screen (spec 5.2). It is open while it is mounted. It is a non-modal
// `<dialog>` in a scrim, not `showModal`: a native modal dialog makes the whole page inert and
// paints over it, so the top bar with the log and the Menu would be out of reach. Here the scrim
// sits below the top bar, and the dialog makes the other regions inert by hand. Mount it as a child
// of `.game-layout`, after the regions.
export function Modal({ title, children, onClose }: ModalProps) {
  const titleId = useId();
  const closable = onClose !== undefined;

  // A ref callback runs before the effects of the children, so a child that takes the focus in
  // its own effect finds the dialog open. It must be stable: a new function on every render would
  // close and open the dialog again.
  const open = useCallback((dialog: HTMLDialogElement | null) => {
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layout = dialog.closest<HTMLElement>(".game-layout");
    const behind = [...(layout?.querySelectorAll<HTMLElement>(BEHIND) ?? [])];
    for (const region of behind) region.setAttribute("inert", "");
    if (!dialog.open) dialog.show();
    return () => {
      for (const region of behind) region.removeAttribute("inert");
      if (dialog.open) dialog.close();
      // The control that had the focus may be gone (the phase moved on): the next controls get it.
      const target =
        opener?.isConnected && !opener.closest("[inert]")
          ? opener
          : layout?.querySelector<HTMLElement>('[data-region="centre"] button:not(:disabled)');
      target?.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && closable) {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="modal__scrim">
      <dialog
        ref={open}
        className="modal"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <div className="modal__inner">
          <header className="modal__head">
            <h2 id={titleId} className="modal__title">
              {title}
            </h2>
            {closable && (
              <button type="button" className="modal__close" aria-label="Close" onClick={onClose}>
                ×
              </button>
            )}
          </header>
          <div className="modal__body">{children}</div>
        </div>
      </dialog>
    </div>
  );
}
