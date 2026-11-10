import { useSquareView } from "./SquareViewContext.tsx";
import "./Square.css";

// The Squares button in the top bar, next to the Menu (spec 4.2, R-B5, BUG-13). It opens the list
// of properties, so a keyboard, a screen reader and a no-WebGL device reach the square detail.
export function SquaresButton() {
  const { openList } = useSquareView();
  return (
    <button type="button" className="squares-button" onClick={openList}>
      Squares
    </button>
  );
}
