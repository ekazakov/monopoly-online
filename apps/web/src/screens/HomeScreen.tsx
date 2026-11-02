import { useNavigate } from "@tanstack/react-router";
import { useSession, useSignOut } from "../session/index.ts";

// Placeholder. Task G2 replaces it with the create-game flow.
export function HomeScreen() {
  const { data: user } = useSession();
  const signOut = useSignOut();
  const navigate = useNavigate();

  return (
    <main className="screen">
      <h1>Home</h1>
      <p>
        Signed in as <strong>{user?.name}</strong>
      </p>
      {/* G2: the create-game flow goes here. */}
      <button
        type="button"
        disabled={signOut.isPending}
        onClick={() =>
          signOut.mutate(undefined, { onSuccess: () => void navigate({ to: "/sign-in" }) })
        }
      >
        Sign out
      </button>
      {signOut.isError && <p role="alert">Could not sign out. Try again.</p>}
    </main>
  );
}
