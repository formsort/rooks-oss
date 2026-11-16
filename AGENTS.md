# AGENTS.md

Public npm packages for Rooks forms. One pnpm workspace; each package in `packages/` is released on
its own.

## Rules

- Packages have zero runtime dependencies. Why: customers load them on their own pages.
- Never log or persist answer values or responder data. Why: most customers are in healthcare.
- Use pnpm only. New dependency versions wait 7 days (`minimumReleaseAge`).
- Release only with the Release workflow. No npm token exists; npm trusts that workflow through
  OIDC. Steps and new-package setup: [RELEASING.md](RELEASING.md).
- Tests run in a real browser (Vitest browser mode). A test must catch a bug that would otherwise
  ship.
