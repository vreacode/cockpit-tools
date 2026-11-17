# CLI history after switching from API service to an account

Codex CLI 0.169.0 checks the provider saved in each conversation before resuming.
If Cockpit removes `model_providers.codex_local_access` when switching back to
an ordinary account, Codex reports `Model provider unavailable` and refuses the
resume, even if the current default model/provider works for new conversations.
Changing only the default model or SQLite provider does not fix admission of the
original rollout. Explicit resume provider overrides cannot bypass this check.

When projecting a built-in OpenAI account, Cockpit now replaces its three reserved
provider definitions (`codex_local_access`, `cockpit_api`, `openai_api_key`) with
compatibility aliases. These use the current auth.json and current account's
endpoint. For an official account no base_url is set: Codex chooses the ChatGPT
or API endpoint according to the active authentication. Old relay endpoints,
bearer tokens, environment key names, headers and query parameters are discarded.
User-defined providers and the default provider selection retain their existing
behavior. These aliases intentionally follow the account selected in Cockpit;
they do not restore the previous relay's credentials or rewrite conversation data.

Validation:

- `node scripts/test_codex_history_provider_aliases.cjs` compiles the actual
  production helper with its Rust tests, independently of Tauri/GTK.
- A synthetic profile was resumed using the installed CLI 0.169.0 app-server
  protocol. Before the change, `thread/resume` returned error -32600 with
  `modelProviderNotConfigured` for `codex_local_access`, matching the screenshot.
  After applying the production helper and repeating the same resume in the
  same process, it returned the original thread ID and saved provider successfully.
  The preexisting rollout bytes were unchanged. This test copied no user auth,
  blocked outbound network, and sent no inference request.
- A second real-CLI test used a local HTTP Responses mock. After the same
  missing-provider rejection and repair, the resumed turn completed using the
  current synthetic credential and endpoint. The request retained the original
  historical assistant answer. No real credentials or external inference were used.
- No history database, rollout, account, or cache is cleared by this repair.

This fixes missing-provider admission. It does not promise that another
provider's models, encrypted reasoning or server-side response IDs are portable.
Those require their own concrete upstream error and cannot be fixed safely by
silently deleting conversation content.

## Installed Jetson build

Actions run [44083252819](https://github.com/vreacode/cockpit-tools/actions/runs/44083252819)
built commit `bffdb1779e36a17fc9c59f30a1be95a069d3441a` successfully, including the
three helper tests and frontend checks/build. The downloaded ARM64 executable
requires at most GLIBC 2.34 and contains the linked production alias helper.
Its SHA-256 is `98b3f2b6593d984f4b350d38b2e3292fc8f0b8b78cf041a7bdba9536c503e772`.

On 2026-11-17 it passed three complete starts in 4–4.5 seconds, with native window
captures showing the full interface and one startup rebuild per launch. It was
then installed at `target/release/cockpit-tools`; launching the existing desktop
entry also passed and showed the full interface. No Inspector, preload shim or
window manipulation was used. The earlier white-screen fix remains included.

The preceding binary, desktop entries and validation evidence are retained at
`target/jetson-history-provider-backup/20261117-204745/`. The installation left
the existing CLI config.toml and auth.json byte-for-byte unchanged. It did not
switch the user's active account: the next ordinary account switch through the
updated app writes the compatible definitions. Actual upstream continuation of
the user's private conversation has not been tested; the missing-provider
rejection and subsequent continuation were verified with synthetic history.
