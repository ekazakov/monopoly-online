import { useEffect, useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import { Modal } from "./Modal.tsx";

// The same structure as `GameLayout`: the regions, then the dialog as a child of the layout.
function Layout({ dialog }: { dialog: boolean }) {
  return (
    <main className="game-layout">
      <div className="game-layout__regions">
        <section className="game-layout__board">
          <button type="button">Board button</button>
        </section>
        <div className="game-layout__top">
          <button type="button">Menu</button>
        </div>
        <section className="game-layout__centre" data-region="centre">
          <button type="button">Centre button</button>
        </section>
      </div>
      {dialog && (
        <Modal title="Auction">
          <button type="button">Bid</button>
        </Modal>
      )}
    </main>
  );
}

describe("Modal", () => {
  test("opens a dialog named by its title while it is mounted", () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, "show");
    render(<Layout dialog />);
    expect(show).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Auction" })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    show.mockRestore();
  });

  test("makes the regions behind it inert, but not the top bar", () => {
    const { container, rerender } = render(<Layout dialog />);
    expect(container.querySelector(".game-layout__board")).toHaveAttribute("inert");
    expect(container.querySelector(".game-layout__centre")).toHaveAttribute("inert");
    expect(container.querySelector(".game-layout__top")).not.toHaveAttribute("inert");

    rerender(<Layout dialog={false} />);
    expect(container.querySelector(".game-layout__board")).not.toHaveAttribute("inert");
    expect(container.querySelector(".game-layout__centre")).not.toHaveAttribute("inert");
  });

  test("gives the focus back to the control that had it when the dialog goes", () => {
    const { rerender } = render(<Layout dialog={false} />);
    const opener = screen.getByRole("button", { name: "Centre button" });
    opener.focus();
    rerender(<Layout dialog />);
    rerender(<Layout dialog={false} />);
    expect(opener).toHaveFocus();
  });

  test("the dialog is open when the effects of its children run, so a child can take the focus", () => {
    const openInEffect: boolean[] = [];
    function Child() {
      const ref = useRef<HTMLInputElement>(null);
      useEffect(() => {
        openInEffect.push(Boolean(ref.current?.closest("dialog")?.open));
      }, []);
      return <input ref={ref} aria-label="Bid" />;
    }
    render(
      <Modal title="Auction">
        <Child />
      </Modal>,
    );
    expect(openInEffect).toEqual([true]);
  });

  test("a dialog with no onClose has no Close button and stays open on Esc", async () => {
    render(
      <Modal title="Auction">
        <button type="button">Bid</button>
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Bid" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  test("a closable dialog has a Close button and closes on Esc", async () => {
    const onClose = vi.fn<() => void>();
    render(
      <Modal title="Cards" onClose={onClose}>
        <button type="button">OK</button>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "OK" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("a re-render keeps the dialog open and does not open it again", () => {
    const show = vi.spyOn(HTMLDialogElement.prototype, "show");
    const { rerender } = render(<Modal title="Auction">one</Modal>);
    rerender(<Modal title="Auction">two</Modal>);
    expect(show).toHaveBeenCalledTimes(1);
    expect(screen.getByText("two")).toBeInTheDocument();
    show.mockRestore();
  });

  test("unmounting closes the dialog", () => {
    const close = vi.spyOn(HTMLDialogElement.prototype, "close");
    const { unmount } = render(<Modal title="Auction">text</Modal>);
    unmount();
    expect(close).toHaveBeenCalled();
    close.mockRestore();
  });
});
