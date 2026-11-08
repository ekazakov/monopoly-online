import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { GOOGLE_START_PATH, isApiError } from "../api/index.ts";
import { useAuthMethods, useGoogleName, useSignIn } from "../session/index.ts";
import { Icon, SignInNameForm } from "./SignInNameForm.tsx";
import "./SignInScreen.css";

const route = getRouteApi("/sign-in");

const copy = {
  loading: "Loading the sign-in options…",
  optionsFailed: "We could not load the sign-in options. Check the connection and try again.",
  retry: "Try again",
  oauthFailed: "Google did not sign you in. Try again, or ask the host to check the setup.",
  googleKept:
    "We keep only your Google account id. We do not keep your email, your Google name or your tokens.",
} as const;

function Frame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="sign-in">
      <header className="sign-in__top">
        <span className="sign-in__brand">Harborfront</span>
      </header>
      <main className="sign-in__main">
        <div className="sign-in__intro">
          <p className="sign-in__eyebrow">Welcome</p>
          <h1 className="sign-in__title">{title}</h1>
          {lead && <p className="sign-in__lead">{lead}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

// A link, not a button: Google sign-in leaves the app, so the browser must load the address.
function GoogleButton({ children }: { children: string }) {
  return (
    <a className="sign-in__google" href={GOOGLE_START_PATH}>
      <span className="sign-in__google-mark" aria-hidden="true">
        G
      </span>
      {children}
    </a>
  );
}

function Problem({ children }: { children: string }) {
  return (
    <div className="sign-in__problem" role="alert">
      <Icon kind="error" />
      <span>{children}</span>
    </div>
  );
}

/** Step 2 of Google sign-in: a new Google user chooses the display name. */
function GoogleNameStep() {
  const { redirect } = route.useSearch();
  const navigate = useNavigate();
  const mutation = useGoogleName();
  return (
    <Frame
      title="Pick a name to play"
      lead="You are signed in with Google. Pick the name friends see at the table."
    >
      <div className="sign-in__card">
        <SignInNameForm
          mutation={mutation}
          onSuccess={() => void navigate({ href: redirect ?? "/" })}
          // 401: the pending sign-in is gone (it lives 10 minutes). Start again.
          onFailure={(error) => {
            if (!isApiError(error) || error.status !== 401) return false;
            void navigate({ to: "/sign-in", search: { error: "oauth_failed" }, replace: true });
            return true;
          }}
        />
      </div>
    </Frame>
  );
}

function GuestForm() {
  const { redirect } = route.useSearch();
  const navigate = useNavigate();
  const signIn = useSignIn();
  return (
    <SignInNameForm mutation={signIn} onSuccess={() => void navigate({ href: redirect ?? "/" })} />
  );
}

export function SignInScreen() {
  const { error, step } = route.useSearch();
  const methods = useAuthMethods();

  if (step === "name") return <GoogleNameStep />;

  if (methods.isPending) {
    return (
      <Frame title="Sign in to play" lead="">
        <p className="sign-in__lead" role="status">
          {copy.loading}
        </p>
      </Frame>
    );
  }
  if (methods.isError) {
    return (
      <Frame title="Sign in to play" lead="">
        <div className="sign-in__card">
          <Problem>{copy.optionsFailed}</Problem>
          <button
            type="button"
            className="sign-in__secondary"
            onClick={() => void methods.refetch()}
          >
            {copy.retry}
          </button>
        </div>
      </Frame>
    );
  }

  const { google, guest } = methods.data;
  // Guest only is the first screen of the board: one form, no Google.
  if (!google) {
    return (
      <Frame
        title="Pick a name to play"
        lead="Friends see this name at the table. No password. Names are unique, and capital letters do not matter."
      >
        <div className="sign-in__card">{guest && <GuestForm />}</div>
      </Frame>
    );
  }
  return (
    <Frame
      title="Sign in to play"
      lead="Sign in with Google. Friends see the name you pick at the table, not your Google name."
    >
      <div className="sign-in__card">
        {error === "oauth_failed" && <Problem>{copy.oauthFailed}</Problem>}
        <GoogleButton>
          {error === "oauth_failed" ? "Try again with Google" : "Continue with Google"}
        </GoogleButton>
        {guest ? (
          <>
            <div className="sign-in__separator" role="separator">
              or, guest name
            </div>
            <GuestForm />
          </>
        ) : (
          <p className="sign-in__note">{copy.googleKept}</p>
        )}
      </div>
    </Frame>
  );
}
