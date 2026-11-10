import { useSquareView } from "./SquareViewContext.tsx";
import { SquareDetail } from "./SquareDetail.tsx";
import { SquareList } from "./SquareList.tsx";

// The square dialogs, as children of the game layout (see `Modal`). The detail replaces the list
// when a property is picked, and each closes with Esc or its Close button.
export function SquareDialogs({ userId }: { userId: string }) {
  const { detail, listOpen, openDetail, close } = useSquareView();
  if (detail !== null) return <SquareDetail userId={userId} square={detail} onClose={close} />;
  if (listOpen) return <SquareList userId={userId} onPick={openDetail} onClose={close} />;
  return null;
}
