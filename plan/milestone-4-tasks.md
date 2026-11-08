# Harborfront: Milestone 4 tasks (sign-in and room control)

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md), [api-schema.md](api-schema.md) (section "Milestone 4"), [game-screen-2-gameplay.md](game-screen-2-gameplay.md) (Q25), [milestone-3-tasks.md](milestone-3-tasks.md), [e2e-test-plan.md](e2e-test-plan.md) |
| Status         | In progress. A1 to A4 are done. Last updated 2026-11-08                                 |

**Goal.** On production, a player signs in with Google and keeps one account in each browser. The host decides who stays in the room.

**Done when** these steps pass on `localhost`, and the Playwright scripts pass:

1. Sign in with a real Google account. Sign out, sign in again, and get the same user and games.
2. With `GUEST_SIGN_IN_ENABLED` not set, the sign-in screen shows only Google, and `POST /api/session` returns 404.
3. The host removes a joined player from the room. The removed player sees a notice and goes to the lobby.
4. No rematch reference stays in the project.

## Scope rules

- In M4: the rematch removal, host removes a player, Google sign-in, and guest sign-in behind an environment variable.
- Not in M4:
  - The accessibility pass. It moves to after the first release (M5). See "Future work".
  - WebSocket transport. It moves to after deployment (M5), and only if real use shows a problem with SSE.
  - Rematch. It is removed from the project.
  - The autopilot, and claim from another browser (gameplay Q25). See "Open questions".
  - A link or a merge of a guest user and a Google user.
  - A ban list. A removed player can join again with the game link.
  - Reduced motion fallback (M2 H4). It is done in M3 (commit `ccf7543`).
- No engine change.
- Keep SQL portable (roadmap 3.3).
- Each task: small, own commit (Conventional Commits), `pnpm check` and `pnpm test` green. Controller or DTO changes regenerate `apps/api/openapi.json` (`pnpm openapi`).
- Design: ask before you add or change a board on the canvas. Sync `artifacts/` when the design system or the game screen prototype changes (AGENTS.md).
- Never commit `.env` files. The Google client values stay in a local `.env`.
- Task names: the name comes first, the task code follows in parentheses.

## Decisions

| Topic | Decision |
| --- | --- |
| Rematch | Removed from the project. The game-over dialog has one action, Leave game |
| Accessibility pass | After the first release (M5). See "Future work" |
| WebSocket | After M5, only if SSE has a problem through Cloudflare. Actions stay on POST in all cases |
| Production sign-in | Google only. Cloudflare Access (M5) stays the gate to the site |
| Guest sign-in | Test and development only. On when `GUEST_SIGN_IN_ENABLED=true`, off when the variable is not set. When it is off, `POST /api/session` is not registered (404) |
| Production guard | The API does not start when `GUEST_SIGN_IN_ENABLED=true` and `NODE_ENV=production`, with a clear error message |
| Start rule | Google client values are required in production. In other environments the API needs at least one sign-in method, or it does not start |
| Sign-in methods | `GET /api/auth/methods` returns `{ google, guest }`. The web app reads it at run time, so one build works in all environments |
| Google data | Table `auth_identities` (provider, subject, user). Keep only the Google subject. Do not keep the email, the Google name or the Google tokens |
| Google client | Arctic (roadmap section 5). `state` and PKCE in short HttpOnly, SameSite=Lax cookies |
| New Google user | The user types a display name. The current unique name rule applies. The Google name is not used |
| Known Google user | Sign in as that user. No link step, no collision, no merge |
| Guest and Google | Always separate users. The sign-in screen shows only when nobody is signed in. The Google start route refuses a signed-in user with `already_signed_in` |
| Session | Reuse our sessions and cookie code. A new session token at each sign-in. The web app reloads after sign-in, so the old stream closes |
| Existing data | Nothing is deployed. Local guest users continue to work. No migration of users and no purge |
| Remove a player | Host only, `waiting` only, not the host's own seat. Removes the player's seat and the hot-seat seats that the player controls. No ban |
| Word "guest" | Two meanings stay: a player who is not the host of a room, and a guest user for test and development. Record this in `GLOSSARY.md` |

## Tasks

Mark a task `[x]` in the commit that completes it.

### A. Docs and design

Ask before you add or change a board. Sync the artifacts.

- [x] **Rematch removal (A1).** Prototype game-over dialog, `Dialogs.dc.html`, `GameResult.dc.html`, `OwnerControls.dc.html`, the roadmap and the scope lines of the M1 to M3 task files. Commit `77c6d62`.
- [x] **Milestone 4 docs (A2).** This list. The M4 section of [api-schema.md](api-schema.md). The roadmap: M4 scope, the accessibility pass and WebSocket after M5, section 5 (Google sign-in, guest sign-in for test and development), and remove the idea in section 10 to link users from the Access email. The glossary: the two meanings of "guest", and the new environment variables. The README: the new environment variables and the Google client setup.
- [x] **Remove player boards (A3).** A Remove control and a confirm step in the host view of `LobbyHost.dc.html` and `LobbyHostReady.dc.html`. The notice for the removed player.
- [x] **Sign-in board (A4).** `SignIn.dc.html`: the Google button, the name step for a new Google user, the guest name form only when guest sign-in is on, and the errors (Google refused, name taken).

### B. Shared and database

- [ ] **Milestone 4 shared schemas (B1).** The remove player response. The `room.removed` message on `user:<id>` with `{ gameId }`. The sign-in methods response `{ google, guest }`. The name step request for a new Google user. New error codes, in the code list **and** in the status map: `cannot_remove_self`, `oauth_failed`. Keep `drift.test.ts` green.
- [ ] **Auth identities migration (B2).** Migration `0008_auth_identities`: provider, subject, user id, created time. A unique index on provider and subject. Update `db/schema.ts`.

### C. Host removes a player API

- [ ] **Remove player endpoint (C1).** `DELETE /api/games/:id/players/:userId`. A new `RoomService.removePlayer`. Host only: 403 `not_game_owner`. `waiting` only: 409 `game_not_waiting`. The host's own user: 409 `cannot_remove_self`. A user with no seat: 404 `not_found`. Reuse `removeSeats` in `rooms/service.ts` for the player's seat and the hot-seat seats that the player controls, in one transaction.
- [ ] **Remove player messages (C2).** After the commit: `room.updated` on `game:<id>`, `lobby.updated` for the open list, and `room.removed` on `user:<userId>`. Decide if the server must also close the removed user's game subscription. Tests: the removed user gets `room.removed`; the others get the new seats; the removed user can join again with the game link.

### D. Google sign-in API

- [ ] **Sign-in configuration (D1).** Read `GUEST_SIGN_IN_ENABLED`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` in `index.ts`, in the same pattern as `GAME_SEED`. The production guard and the start rule (see "Decisions"). `GET /api/auth/methods`. Tests for each configuration.
- [ ] **Guest sign-in behind the variable (D2).** Register `POST /api/session` only when guest sign-in is on. Keep `createGuestSession`. `createTestApp` turns guest sign-in on, so the `signIn` helper and most API tests do not change. Test: 404 when it is off.
- [ ] **Google start and callback (D3).** Check the current Arctic API first. `GET /api/auth/google/start` sets the `state` and PKCE cookies and goes to Google. It refuses a signed-in user with `already_signed_in`. `GET /api/auth/google/callback` checks `state`, gets the Google subject, and clears the cookies. Inject the Google provider, so that tests do not call Google.
- [ ] **Google users and sessions (D4).** A known subject: a new session for its user. A new subject: a short pending sign-in, then `POST /api/auth/google/name` with the display name makes the user, the identity row and the session in one transaction. Reuse the cookie and session code in `apps/api/src/auth/`. Tests: new user, known user, bad `state`, name taken, already signed in.

### E. Web

- [ ] **Remove player in the room (E1).** A Remove control with a confirm step in the host view of `screens/room/`. The removed player gets a notice from `room.removed` and goes to the lobby. Depends on Remove player boards (A3).
- [ ] **Sign-in screen (E2).** `SignInScreen.tsx` reads `GET /api/auth/methods` through the API helpers. The Google button, and the name step after the callback. The guest name form only when `guest` is on. Reload after sign-in. Depends on Sign-in board (A4).
- [ ] **Web tests (E3).** Components and API helpers for each task above. Update `testing/fakeApi.ts`.

### F. Browser tests

- [ ] **Guest sign-in for browser tests (F1).** Set `GUEST_SIGN_IN_ENABLED=true` for the Playwright API server and for `pnpm dev`. The current scripts stay green.
- [ ] **Remove player script (F2).** Two contexts: the host removes the guest, the guest sees the notice and goes to the lobby, and joins again with the link.

### G. Close

- [ ] **Manual run (G1).** Two browser profiles and one hot-seat seat. Real Google sign-in on `localhost`, and the remove player flow. Fix the defects that you find. This task needs the Google Cloud client (see "Setup").
- [ ] **Milestone 4 close (G2).** Roadmap status and change log. "As built" notes in [api-schema.md](api-schema.md). Copy the open questions to the roadmap if they stay open. Sync `artifacts/`.

## Setup

The project owner must create a Google Cloud OAuth client, with the redirect address for local development. Put the values in a local `.env`. Only the real Google checks need this client: the Manual run (G1). The other tasks use the injected provider in tests.

## Order and dependencies

- Docs and design (A1 to A4) are done. Shared and database (B) is next.
- Shared and database (B) → Host removes a player API (C) and Google sign-in API (D) → Web (E) → Browser tests (F) → Close (G).
- C and D do not depend on each other after B, but both change `app.ts`, the shared schemas and `openapi.json`. Do them one after the other.
- Guest sign-in for browser tests (F1) goes in the same change as Guest sign-in behind the variable (D2), so the Playwright scripts do not break.
- The boards (A3, A4) come before their web tasks.

## Future work (after the first release)

Not in M4. Plan these tasks after the first release (M5). Start from the known gaps in section 6 of [game-screen-2-spec.md](game-screen-2-spec.md).

- **Accessibility pass.**
  - Active player marker: a visible marker or a "Turn" tag for the player on turn, not only colour (spec R-P3). It needs a board change first.
  - Hand keyboard: the expanded hand opens on focus and closes on Esc. Its card actions work with a keyboard.
  - Dialog semantics: only `HandoffPrompt` has them now. Add the dialog role, a focus trap and the focus return to auction, trade, debt, card and leave.
  - Board text equivalent: the canvas is `aria-hidden`. Add the square of each player and the owner of each property as text. Keep the no-WebGL path.
  - Keyboard order: verify log toggle → Menu → turn actions → hand, and the order in the room, the lobby and the new sign-in screen.
  - Automatic checks: `vitest-axe` or `jest-axe` in the web tests, and `@axe-core/playwright` on the lobby, room, game and result screens.
  - Browser test: one turn with the keyboard only. Manual run: one turn with a screen reader.
  - Update the status table in spec section 6.
- **WebSocket transport.** Only if real use shows a problem with SSE through Cloudflare.

## Open questions

Not decided, and not in M4 scope.

- **One account in two browsers.** With Google sign-in, one user can open the same game in two browsers at the same time. The Q25 rule in [game-screen-2-gameplay.md](game-screen-2-gameplay.md) still says "original browser". No M4 task changes this rule or tests this case.
  - Possible rule: a seat belongs to the account, so the account can play it from any browser.
  - Not verified: the seat check, the refusal of an old action by `expectedVersion`, and presence with two streams.
  - Largest risk: state that is only on one screen, such as a half-built trade or a hot-seat handoff prompt.

## Risks

| Risk | Action |
| --- | --- |
| On production, each player needs a Google account | Accepted. Cloudflare Access already limits the players to a known list |
| If Google is not available, nobody can make a new sign-in | Open sessions continue to work (30 days) |
| Most tests and local runs use guest users, so the Google path gets less use | The Google path has its own API tests with the injected provider, and the Manual run (G1) uses real Google |
| A manual run of real Google sign-in with two players needs two Google accounts | Other manual runs use guest users |
| After M5, a player passes Access and then signs in to the game | Accepted. Long sessions make it rare |
| The Access session cookie with SameSite=Strict breaks the Google callback | Keep the Access cookie on Lax in M5. Production needs its own redirect address, added in M5 |
| While the Google consent screen is in "Testing", only listed test users can sign in | Check the current Google rules during setup |
| A removed player keeps an open game stream until the client drops the topic | Decide in Remove player messages (C2) |

## Critical files

- `packages/shared/src/games.ts`, `stream.ts`, `errors.ts`, `index.ts`, new auth schemas
- `apps/api/src/index.ts`, `app.ts`, `auth/sessions.ts`, `auth/cookie.ts`, `auth/test-helpers.ts`, `routes/session.ts`, new `routes/auth.ts`, `rooms/service.ts`, `routes/games.ts`, `db/migrations.ts`, `db/schema.ts`, `openapi.json`
- `apps/web/src/screens/SignInScreen.tsx`, `screens/room/`, `api/session.ts`, `testing/fakeApi.ts`
- `apps/e2e/playwright.config.ts`, `apps/e2e/tests/`
- `artifacts/design-system/project/LobbyHost*.dc.html`, `SignIn.dc.html`, `artifacts/game-screen/js/app.js`
