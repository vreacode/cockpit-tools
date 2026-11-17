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
- No history database, rollout, account, or cache is cleared by this repair.

This fixes missing-provider admission. It does not promise that another
provider's models, encrypted reasoning or server-side response IDs are portable.
Those require their own concrete upstream error and cannot be fixed safely by
silently deleting conversation content.
