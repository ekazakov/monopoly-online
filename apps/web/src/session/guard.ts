import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { safeRedirect } from "./redirect.ts";
import { sessionQuery } from "./queries.ts";

// `beforeLoad` of every route but /sign-in. The cache answers; a 401 anywhere clears it.
export async function requireSession(queryClient: QueryClient, location: { href: string }) {
  const user = await queryClient.ensureQueryData(sessionQuery);
  if (!user) {
    // "/" is the default target, so it stays out of the URL.
    const target = location.href === "/" ? undefined : safeRedirect(location.href);
    throw redirect({ to: "/sign-in", search: { redirect: target } });
  }
  return { user };
}

// `beforeLoad` of /sign-in: a signed-in user has nothing to do here.
export async function redirectIfSignedIn(queryClient: QueryClient, search: { redirect?: string }) {
  const user = await queryClient.ensureQueryData(sessionQuery);
  if (user) throw redirect({ href: safeRedirect(search.redirect) ?? "/" });
}
