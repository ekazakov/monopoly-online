## Communication style

Write your response using ASD-STE100 Simplified Technical English."

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<optional scope>): <description>`.

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Scope is the area, e.g. `api`, `web`, `auth`, `db`, `deps`.
- Description: imperative mood, lowercase, no trailing period, header at most 72 characters (`feat(api): add expense filtering`).
- Breaking changes: `!` after the type/scope (`feat(api)!: ...`) and a `BREAKING CHANGE:` footer.
- Body (optional, after a blank line) explains why, not what. Keep one logical change per commit; don't mix unrelated changes.
- Run `pnpm check` and `pnpm test` before committing. If a controller or DTO changed, include the regenerated `apps/api/openapi.json` in the same commit.
- Never commit `.env` files, SQLite databases or their sidecar files (`*.db-shm`, `*.db-wal`).
