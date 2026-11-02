import type { ReactNode } from "react";

export function Status({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <p className="turn-area__status">{title}</p>
      {sub && <p className="turn-area__sub">{sub}</p>}
    </>
  );
}
