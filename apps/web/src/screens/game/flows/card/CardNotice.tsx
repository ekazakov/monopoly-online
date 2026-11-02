import { useCardNotice } from "./useCardNotice.ts";
import "./CardNotice.css";

// The card reveal in the board centre (spec 5.2; design board TurnArea, Chance card). It shows on
// every device. OK only closes it on this device. One root element, because the layout `centre`
// cell is a size container. With no card to show it renders nothing.
export function CardNotice({ userId }: { userId: string }) {
  const notice = useCardNotice(userId);
  if (!notice) return null;

  return (
    <div className="card-notice" data-deck={notice.deck} key={notice.key}>
      <p className="card-notice__who">{notice.drawerName} drew a card</p>
      <div
        className="card-notice__face"
        role="group"
        aria-label={`${notice.deckLabel} card`}
        aria-live="polite"
      >
        <span className="card-notice__deck">{notice.deckLabel}</span>
        <p className="card-notice__title">{notice.title}</p>
        {notice.text && <p className="card-notice__text">{notice.text}</p>}
      </div>
      <button type="button" className="card-notice__ok" onClick={notice.dismiss}>
        OK
      </button>
    </div>
  );
}
