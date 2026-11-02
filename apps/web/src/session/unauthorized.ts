import type { QueryClient } from "@tanstack/react-query";
import { setUnauthorizedHandler } from "../api.ts";
import { clearSession } from "./queries.ts";

// Any 401 from an API call drops the session; the router then runs the guards again, which send
// the user to /sign-in. `invalidate` is the router method of that name.
export function installUnauthorizedHandler(
  queryClient: QueryClient,
  router: { invalidate(): Promise<void> },
) {
  return setUnauthorizedHandler(() => {
    clearSession(queryClient);
    void router.invalidate();
  });
}
