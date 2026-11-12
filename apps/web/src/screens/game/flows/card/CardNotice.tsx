import { useT } from "../../../../i18n/index.ts";
import { Modal } from "../../modal/Modal.tsx";
import type { CardNoticeState } from "./useCardNotice.ts";
import "./CardNotice.css";

// The drawn card in a modal dialog (spec 5.2; BUG-5), on every device. OK and Esc close it on this
// device only; they send no action. The dialog is a child of the game layout (see `Modal`). The
// parent owns `useCardNotice`, so the dialog and the phase dialog never show together.
export function CardNotice({ notice }: { notice: CardNoticeState }) {
  const t = useT();
  return (
    <Modal
      key={notice.key}
      title={t("card.drew", { name: notice.drawerName })}
      onClose={notice.dismiss}
      hideClose
    >
      <div className="card-notice" data-deck={notice.deck}>
        <div
          className="card-notice__face"
          role="group"
          aria-label={t("card.label", { deck: notice.deckLabel })}
          aria-live="polite"
        >
          <span className="card-notice__deck">{notice.deckLabel}</span>
          <p className="card-notice__title">{notice.title}</p>
          {notice.text && <p className="card-notice__text">{notice.text}</p>}
        </div>
        <button type="button" className="card-notice__ok" onClick={notice.dismiss}>
          {t("common.ok")}
        </button>
      </div>
    </Modal>
  );
}
