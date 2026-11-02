import { centrePhases } from "./centrePhases.ts";
import { ErrorNotice } from "./ErrorNotice.tsx";
import { useTurn } from "./useTurn.ts";
import { WaitingView } from "./WaitingView.tsx";
import "./TurnArea.css";

// The board centre (spec 4.5 and 5.2): the content of the phase, then its actions. One root
// element, because the layout `centre` cell is a size container.
export function TurnArea({ userId }: { userId: string }) {
  const turn = useTurn(userId);
  const { phase } = turn.view;
  const PhaseView = (phase && centrePhases[phase]) || WaitingView;

  return (
    <div className="turn-area" aria-busy={turn.pending || undefined}>
      <PhaseView turn={turn} />
      <ErrorNotice />
    </div>
  );
}
