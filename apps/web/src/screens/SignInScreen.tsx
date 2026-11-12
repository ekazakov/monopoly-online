import { getRouteApi, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { GOOGLE_START_PATH, isApiError } from "../api/index.ts";
import { useT } from "../i18n/index.ts";
import { useAuthMethods, useGoogleName, useSignIn } from "../session/index.ts";
import { PreferenceSwitches } from "./PreferenceSwitches.tsx";
import { Icon, SignInNameForm } from "./SignInNameForm.tsx";
import "./SignInScreen.css";

const route = getRouteApi("/sign-in");

function Frame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="sign-in">
      <header className="sign-in__top">
        <span className="sign-in__brand">Harborfront</span>
        <PreferenceSwitches />
      </header>
      <main className="sign-in__main">
        <div className="sign-in__intro">
          <p className="sign-in__eyebrow">{t("signIn.welcome")}</p>
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
  const t = useT();
  return (
    <Frame title={t("signIn.pickName")} lead={t("signIn.googleNameLead")}>
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
  const t = useT();

  if (step === "name") return <GoogleNameStep />;

  if (methods.isPending) {
    return (
      <Frame title={t("signIn.title")} lead="">
        <p className="sign-in__lead" role="status">
          {t("signIn.loading")}
        </p>
      </Frame>
    );
  }
  if (methods.isError) {
    return (
      <Frame title={t("signIn.title")} lead="">
        <div className="sign-in__card">
          <Problem>{t("signIn.optionsFailed")}</Problem>
          <button
            type="button"
            className="sign-in__secondary"
            onClick={() => void methods.refetch()}
          >
            {t("signIn.retry")}
          </button>
        </div>
      </Frame>
    );
  }

  const { google, guest } = methods.data;
  // Guest only is the first screen of the board: one form, no Google.
  if (!google) {
    return (
      <Frame title={t("signIn.pickName")} lead={t("signIn.guestLead")}>
        <div className="sign-in__card">{guest && <GuestForm />}</div>
      </Frame>
    );
  }
  return (
    <Frame title={t("signIn.title")} lead={t("signIn.googleLead")}>
      <div className="sign-in__card">
        {error === "oauth_failed" && <Problem>{t("signIn.oauthFailed")}</Problem>}
        <GoogleButton>
          {error === "oauth_failed" ? t("signIn.googleRetry") : t("signIn.googleContinue")}
        </GoogleButton>
        {guest ? (
          <>
            <div className="sign-in__separator" role="separator">
              {t("signIn.orGuest")}
            </div>
            <GuestForm />
          </>
        ) : (
          <p className="sign-in__note">{t("signIn.googleKept")}</p>
        )}
      </div>
    </Frame>
  );
}
