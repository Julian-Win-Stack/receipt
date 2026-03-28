# Changelog

All notable changes to this project should be documented in this file.

The format is based on Keep a Changelog and this project uses Semantic Versioning.

## [0.1.2] - 2026-03-27

### Added
- Published package now includes bundled browser server runtime (`dist/server.js`) and bundled factory route modules (`dist/agent-routes`) so `receipt dev` works from npm installs.
- Packed-install smoke now verifies browser runtime end-to-end by probing `/healthz` and `/factory`.

### Changed
- Interactive `receipt` now auto-runs onboarding when setup is missing, then opens the TUI by default and prints a browser UI URL as an alternative.
- Published package contents now include `skills`, `profiles`, `AGENTS.md`, and source/runtime artifacts needed by TUI and browser flows.
- Factory profile/helper resolution now falls back to packaged runtime assets when workspace-local copies are missing.

## [0.1.1] - 2026-03-28

### Fixed
- `receipt new --template basic` now generates a runtime-safe scaffold for public CLI usage.

## [0.1.0] - 2026-03-26

### Added
- Public CLI packaging for Node.js with `dist/cli.js` binary output.
- `receipt start` setup wizard for OpenAI key, GitHub auth, and AWS auth/profile/account selection.
- Local setup config persistence at `~/.receipt/config.json` with strict permissions.
- Packed artifact smoke test via `npm run pack:smoke`.
- Setup flow smoke tests for failure and success branches.

### Changed
- CLI packaging target renamed to `receipt-agent-cli`.
- `receipt start` now reruns setup checks and reuses saved selections by default.
- `receipt start --reset` now ignores saved selections and reconfigures from scratch.
