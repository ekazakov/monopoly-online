import { act, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vite-plus/test";
import { FakeEventSource, roomUpdated, topic } from "./fixtures.ts";
import { RealtimeProvider } from "./RealtimeProvider.tsx";
import { useRealtimeStatus, useTopic } from "./hooks.ts";
import { SseHttpClient } from "./SseHttpClient.ts";

function makeClient() {
  FakeEventSource.instances = [];
  return new SseHttpClient({ eventSourceFactory: (url) => new FakeEventSource(url) });
}

function Probe({ onMessage }: { onMessage: (type: string) => void }) {
  useTopic(topic, (message) => onMessage(message.type));
  return <p>status: {useRealtimeStatus()}</p>;
}

describe("react integration", () => {
  test("useTopic subscribes while mounted and useRealtimeStatus follows the client", async () => {
    const client = makeClient();
    const onMessage = vi.fn<(type: string) => void>();
    const { unmount } = render(
      <RealtimeProvider client={client}>
        <Probe onMessage={onMessage} />
      </RealtimeProvider>,
    );
    expect(screen.getByText("status: idle")).toBeInTheDocument();

    await act(async () => {});
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toBe(`/api/stream?topics=${topic}`);
    expect(screen.getByText("status: connecting")).toBeInTheDocument();

    act(() => source.open());
    expect(screen.getByText("status: open")).toBeInTheDocument();

    act(() => source.emit("room.updated", roomUpdated()));
    expect(onMessage).toHaveBeenCalledWith("room.updated");

    unmount();
    await act(async () => {});
    expect(source.closed).toBe(true);
    expect(client.getStatus()).toBe("idle");
  });

  test("useTopic calls the latest handler without resubscribing", async () => {
    const client = makeClient();
    const first = vi.fn<(type: string) => void>();
    const second = vi.fn<(type: string) => void>();
    const { rerender } = render(
      <RealtimeProvider client={client}>
        <Probe onMessage={first} />
      </RealtimeProvider>,
    );
    await act(async () => {});
    rerender(
      <RealtimeProvider client={client}>
        <Probe onMessage={second} />
      </RealtimeProvider>,
    );
    await act(async () => {});
    act(() => FakeEventSource.instances[0]!.emit("room.updated", roomUpdated()));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(1);
  });
});
