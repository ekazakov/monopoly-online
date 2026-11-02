import { useRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import "./RouteErrorScreen.css";

// A route guard or a loader failed, for example on a network error. Retry loads the route again.
export function RouteErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const retry = () => {
    reset();
    void router.invalidate();
  };

  return (
    <main className="route-error" role="alert">
      <h1 className="route-error__title">Something went wrong</h1>
      <p className="route-error__text">
        {(error instanceof Error && error.message) || "The page could not be loaded."}
      </p>
      <button type="button" className="route-error__retry" onClick={retry}>
        Retry
      </button>
    </main>
  );
}
