# AGENTS.md — dsh-client-ui-chat-timeline

Package-local guidance for AI agents.

- Standalone plugin package (not part of the dsh-web monorepo workspace); install via `dsh plugin --profile web add link:<dir>` and restart `dsh web` to mount a rebuilt bundle.
- The client bundle must keep the closure-factory artifact shape (`window.__ModuleLoader__.load`) configured in `tsdown.config.ts`; only `react`/`react-dom`/module-table entries may stay external.
- All `@deepseek-ai/*` usage in `src/client` must stay type-only; runtime services are reached through the cordis context. A value import from dsh packages would either throw in the frozen module table or duplicate runtime state.
- DOM coupling is quarantined in `src/client/dom.ts` (stable `data-*` hooks, defensive fallbacks); do not spread selectors into components.
- Preview/ripple constants in `directory.ts` / `rail.tsx` replicate the ZCode TurnNavigator spec (`docs/spec.md` in this repo); change them only alongside that spec.
- No emoji in code, comments, docs, or commit messages.
