## Communication style

Write your response using ASD-STE100 Simplified Technical English."

## Serena

Use the Serena MCP tools for all code work in this project.

- At the start of a session, activate the project and read the Serena Instructions Manual (`initial_instructions`). Do this before any other work.
- To find or read code, use the symbolic tools: `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`. Do not read whole files or run `grep` when a symbolic tool can answer.
- To change code, use the symbolic edit tools (`replace_symbol_body`, `insert_before_symbol`, `insert_after_symbol`, `rename_symbol`, `safe_delete_symbol`) when they fit.
- Use `Read`, `grep` and `Bash` only for non-code files (Markdown, JSON, config) or when Serena cannot do the job. If this happens, say why.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<optional scope>): <description>`.

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Scope is the area, e.g. `api`, `web`, `auth`, `db`, `deps`.
- Description: imperative mood, lowercase, no trailing period, header at most 72 characters (`feat(api): add expense filtering`).
- Breaking changes: `!` after the type/scope (`feat(api)!: ...`) and a `BREAKING CHANGE:` footer.
- Body (optional, after a blank line) explains why, not what. Keep one logical change per commit; don't mix unrelated changes.
- Run `pnpm check` and `pnpm test` before committing. If a controller or DTO changed, include the regenerated `apps/api/openapi.json` in the same commit.
- Never commit `.env` files, SQLite databases or their sidecar files (`*.db-shm`, `*.db-wal`).

## Artifacts

Whenever the changes introduces to GameScreen prototype or DesignSystem, sync updated versions with local artifacts.
If new artifacts introduced to the project, then pleas ask before saving.

<!-- groma:start -->
## Groma

This project uses Groma. Before you scan, inspect, or curate architecture, or change files for a Backlog task, run `groma agent-instructions` and read the guide it names for that job. When it reports a first scan, ask the user whether they want you to curate the architecture. Do not edit Groma-owned architecture files directly.
<!-- groma:end -->
