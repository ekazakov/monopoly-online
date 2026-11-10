import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

// Which square dialog is open (spec 5.2, R-B5, BUG-13). The board, the Squares button in the top bar
// and the dialogs share it, so a click on a square and a pick from the list open the same detail.
interface SquareView {
  /** The square whose detail shows, or null. */
  detail: number | null;
  /** The list of all properties shows. */
  listOpen: boolean;
  openDetail: (square: number) => void;
  openList: () => void;
  close: () => void;
}

const idle: SquareView = {
  detail: null,
  listOpen: false,
  openDetail: () => {},
  openList: () => {},
  close: () => {},
};

const SquareViewContext = createContext<SquareView>(idle);

export function SquareViewProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ detail: number | null; listOpen: boolean }>({
    detail: null,
    listOpen: false,
  });
  const openDetail = useCallback(
    (square: number) => setOpen({ detail: square, listOpen: false }),
    [],
  );
  const openList = useCallback(() => setOpen({ detail: null, listOpen: true }), []);
  const close = useCallback(() => setOpen({ detail: null, listOpen: false }), []);
  const value = useMemo(
    () => ({ ...open, openDetail, openList, close }),
    [open, openDetail, openList, close],
  );
  return <SquareViewContext value={value}>{children}</SquareViewContext>;
}

export function useSquareView(): SquareView {
  return useContext(SquareViewContext);
}
