import { createSilentLogger, type Logger } from "../log.ts";

export type Bus<TMessage> = {
  publish(topic: string, message: TMessage): void;
  subscribe(topic: string, handler: (message: TMessage) => void): () => void;
  subscriberCount(topic: string): number;
};

type Subscription<TMessage> = { handler: (message: TMessage) => void };

/** `log` defaults to a silent logger. */
export function createBus<TMessage>(log: Logger = createSilentLogger()): Bus<TMessage> {
  const topics = new Map<string, Set<Subscription<TMessage>>>();

  return {
    publish(topic, message) {
      const subscriptions = topics.get(topic);
      if (!subscriptions) return;
      // Copy first: handlers may subscribe or unsubscribe while the loop runs.
      for (const subscription of [...subscriptions]) {
        // Skip a handler that another handler removed earlier in this loop.
        if (!subscriptions.has(subscription)) continue;
        try {
          subscription.handler(message);
        } catch (err) {
          log.error({ err, topic }, "bus handler failed");
        }
      }
    },

    subscribe(topic, handler) {
      // One object per call, so the same function can subscribe twice.
      const subscription: Subscription<TMessage> = { handler };
      let subscriptions = topics.get(topic);
      if (!subscriptions) {
        subscriptions = new Set();
        topics.set(topic, subscriptions);
      }
      subscriptions.add(subscription);

      return () => {
        const current = topics.get(topic);
        if (!current?.delete(subscription)) return;
        if (current.size === 0) topics.delete(topic);
      };
    },

    subscriberCount(topic) {
      return topics.get(topic)?.size ?? 0;
    },
  };
}
