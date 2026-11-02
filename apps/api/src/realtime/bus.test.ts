import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createBus } from "./bus.ts";

describe("bus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("delivers a message to every subscriber of the topic", () => {
    const bus = createBus<string>();
    const a = vi.fn<(message: string) => void>();
    const b = vi.fn<(message: string) => void>();
    bus.subscribe("game:1", a);
    bus.subscribe("game:1", b);

    bus.publish("game:1", "hello");

    expect(a).toHaveBeenCalledExactlyOnceWith("hello");
    expect(b).toHaveBeenCalledExactlyOnceWith("hello");
  });

  test("does nothing when the topic has no subscribers", () => {
    const bus = createBus<string>();
    expect(() => bus.publish("game:1", "hello")).not.toThrow();
  });

  test("isolates topics and matches them exactly", () => {
    const bus = createBus<string>();
    const one = vi.fn<(message: string) => void>();
    const other = vi.fn<(message: string) => void>();
    bus.subscribe("game:1", one);
    bus.subscribe("game:10", other);

    bus.publish("game:1", "hello");

    expect(one).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
  });

  test("delivers messages in publish order", () => {
    const bus = createBus<number>();
    const received: number[] = [];
    bus.subscribe("t", (message) => received.push(message));

    bus.publish("t", 1);
    bus.publish("t", 2);
    bus.publish("t", 3);

    expect(received).toEqual([1, 2, 3]);
  });

  test("calls handlers in subscribe order", () => {
    const bus = createBus<string>();
    const calls: string[] = [];
    bus.subscribe("t", () => calls.push("first"));
    bus.subscribe("t", () => calls.push("second"));

    bus.publish("t", "x");

    expect(calls).toEqual(["first", "second"]);
  });

  test("stops delivery after unsubscribe, and unsubscribe is idempotent", () => {
    const bus = createBus<string>();
    const a = vi.fn<(message: string) => void>();
    const b = vi.fn<(message: string) => void>();
    const unsubscribeA = bus.subscribe("t", a);
    bus.subscribe("t", b);

    unsubscribeA();
    unsubscribeA();
    bus.publish("t", "x");

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(bus.subscriberCount("t")).toBe(1);
  });

  test("a second unsubscribe does not remove another subscription of the same handler", () => {
    const bus = createBus<string>();
    const handler = vi.fn<(message: string) => void>();
    const first = bus.subscribe("t", handler);
    bus.subscribe("t", handler);

    first();
    first();
    bus.publish("t", "x");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.subscriberCount("t")).toBe(1);
  });

  test("unsubscribe during publish does not break the loop", () => {
    const bus = createBus<string>();
    const calls: string[] = [];
    const unsubscribers: Array<() => void> = [];
    unsubscribers.push(
      bus.subscribe("t", () => {
        calls.push("a");
        unsubscribers[0]?.();
        unsubscribers[1]?.();
      }),
    );
    unsubscribers.push(bus.subscribe("t", () => calls.push("b")));
    bus.subscribe("t", () => calls.push("c"));

    bus.publish("t", "x");
    bus.publish("t", "y");

    // "b" left before its turn, so it gets nothing; "a" left itself and gets one message.
    expect(calls).toEqual(["a", "c", "c"]);
    expect(bus.subscriberCount("t")).toBe(1);
  });

  test("subscribe during publish does not receive the message in flight", () => {
    const bus = createBus<string>();
    const late = vi.fn<(message: string) => void>();
    let subscribed = false;
    bus.subscribe("t", () => {
      if (subscribed) return;
      subscribed = true;
      bus.subscribe("t", late);
    });

    bus.publish("t", "first");
    expect(late).not.toHaveBeenCalled();

    bus.publish("t", "second");
    expect(late).toHaveBeenCalledExactlyOnceWith("second");
  });

  test("a throwing handler does not stop other handlers or throw from publish", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const bus = createBus<string>();
    const before = vi.fn<(message: string) => void>();
    const after = vi.fn<(message: string) => void>();
    const failure = new Error("boom");
    bus.subscribe("t", before);
    bus.subscribe("t", () => {
      throw failure;
    });
    bus.subscribe("t", after);

    expect(() => bus.publish("t", "x")).not.toThrow();

    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]).toContain(failure);
  });

  test("subscriberCount tracks subscriptions per topic", () => {
    const bus = createBus<string>();
    expect(bus.subscriberCount("t")).toBe(0);

    const first = bus.subscribe("t", () => {});
    const second = bus.subscribe("t", () => {});
    bus.subscribe("other", () => {});
    expect(bus.subscriberCount("t")).toBe(2);
    expect(bus.subscriberCount("other")).toBe(1);

    first();
    expect(bus.subscriberCount("t")).toBe(1);
    second();
    expect(bus.subscriberCount("t")).toBe(0);
  });

  test("removes the topic when the last subscriber leaves, and the topic works again", () => {
    const bus = createBus<string>();
    const unsubscribe = bus.subscribe("t", () => {});
    unsubscribe();
    expect(bus.subscriberCount("t")).toBe(0);

    const handler = vi.fn<(message: string) => void>();
    bus.subscribe("t", handler);
    bus.publish("t", "x");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
