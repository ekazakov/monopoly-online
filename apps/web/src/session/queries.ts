import type { User } from "@monopoly/shared";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  chooseGoogleName,
  createSession,
  deleteSession,
  getAuthMethods,
  getMe,
  isApiError,
} from "../api/index.ts";

export const sessionKey = ["session"] as const;

// `null` means signed out. A 401 is the normal answer there, so it is a value and not an error.
export const sessionQuery = queryOptions({
  queryKey: sessionKey,
  queryFn: async (): Promise<User | null> => {
    try {
      return await getMe();
    } catch (error) {
      if (isApiError(error) && error.status === 401) return null;
      throw error;
    }
  },
  // The guard reads the cache, so the session must outlive screens that do not watch it.
  gcTime: Infinity,
  // A fresh answer is not asked again when a screen mounts, e.g. just after sign-in.
  staleTime: 30_000,
  retry: false,
});

// The server reads its sign-in settings at start, so the answer holds until the next load.
export const authMethodsQuery = queryOptions({
  queryKey: ["auth-methods"] as const,
  queryFn: getAuthMethods,
  staleTime: Infinity,
  retry: false,
});

export function useAuthMethods() {
  return useQuery(authMethodsQuery);
}

export function useSession() {
  return useQuery(sessionQuery);
}

// Signed out: the session is null and every other cached answer belongs to the old user.
export function clearSession(queryClient: QueryClient) {
  queryClient.setQueryData(sessionKey, null);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== sessionKey[0] });
}

// 409 `already_signed_in` means another tab signed in: read /api/me and go on with that user.
export async function signIn(name: string): Promise<User> {
  try {
    return await createSession(name);
  } catch (error) {
    if (isApiError(error, "already_signed_in")) return getMe();
    throw error;
  }
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signIn,
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  });
}

// The name step of a new Google user. The session cookie comes with the answer.
export function useGoogleName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chooseGoogleName,
    onSuccess: (user) => queryClient.setQueryData(sessionKey, user),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        await deleteSession();
      } catch (error) {
        // Already signed out is the goal.
        if (!(isApiError(error) && error.status === 401)) throw error;
      }
    },
    onSuccess: () => clearSession(queryClient),
  });
}
