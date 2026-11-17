//! Keep Codex's persisted managed provider IDs resolvable after an account switch.
//! Only the routing definition changes; rollout bytes and SQLite history stay intact.
use toml_edit::{value, Document, Table};

pub(crate) const MANAGED_HISTORY_PROVIDER_IDS: [&str; 3] =
    ["codex_local_access", "cockpit_api", "openai_api_key"];

pub(crate) fn write_builtin_aliases(
    doc: &mut Document,
    base_url: Option<&str>,
) -> Result<(), String> {
    if doc.get("model_providers").is_none() {
        doc["model_providers"] = toml_edit::table();
    }
    let providers = doc["model_providers"]
        .as_table_mut()
        .ok_or("config.toml 中 model_providers 不是合法表结构")?;
    for id in MANAGED_HISTORY_PROVIDER_IDS {
        // Replace the whole managed entry: never retain a relay token, auth header,
        // env key, query parameter, or dead loopback URL from the previous account.
        let mut provider = Table::new();
        provider["name"] = value("OpenAI");
        provider["wire_api"] = value("responses");
        provider["requires_openai_auth"] = value(true);
        provider["supports_websockets"] = value(base_url.is_none());
        if let Some(url) = base_url {
            provider["base_url"] = value(url);
        }
        // Without base_url Codex selects the ChatGPT or API endpoint from the
        // current auth.json, just as its built-in OpenAI provider does.
        providers.insert(id, toml_edit::Item::Table(provider));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn official_switch_replaces_all_managed_secrets_and_preserves_user_settings() {
        let mut doc = r#"model = "keep-model"
[model_providers.codex_local_access]
name = "Old gateway"
base_url = "http://127.0.0.1:1/v1"
experimental_bearer_token = "old-secret"
env_key = "OLD_KEY"
http_headers = { Authorization = "old-secret" }
query_params = { key = "old-secret" }
[model_providers.user_custom]
name = "Keep"
base_url = "https://user.example/v1"
"#
        .parse::<Document>()
        .unwrap();
        let custom = doc["model_providers"]["user_custom"].to_string();
        write_builtin_aliases(&mut doc, None).unwrap();
        assert_eq!(doc["model"].as_str(), Some("keep-model"));
        assert!(doc.get("model_provider").is_none());
        assert_eq!(doc["model_providers"]["user_custom"].to_string(), custom);
        assert!(!doc.to_string().contains("old-secret"));
        for id in MANAGED_HISTORY_PROVIDER_IDS {
            let provider = &doc["model_providers"][id];
            assert_eq!(provider["name"].as_str(), Some("OpenAI"));
            assert_eq!(provider["requires_openai_auth"].as_bool(), Some(true));
            assert!(provider.get("base_url").is_none());
            assert!(provider.get("env_key").is_none());
            assert!(provider.get("http_headers").is_none());
        }
    }

    #[test]
    fn api_switch_uses_only_current_endpoint_and_is_idempotent() {
        let mut doc = Document::new();
        write_builtin_aliases(&mut doc, Some("https://current.example/v1")).unwrap();
        for id in MANAGED_HISTORY_PROVIDER_IDS {
            assert_eq!(
                doc["model_providers"][id]["base_url"].as_str(),
                Some("https://current.example/v1")
            );
            assert_eq!(
                doc["model_providers"][id]["supports_websockets"].as_bool(),
                Some(false)
            );
        }
        let once = doc.to_string();
        write_builtin_aliases(&mut doc, Some("https://current.example/v1")).unwrap();
        assert_eq!(doc.to_string(), once);
        write_builtin_aliases(&mut doc, None).unwrap();
        assert!(!doc.to_string().contains("current.example"));
    }

    #[test]
    fn malformed_provider_map_is_not_overwritten() {
        let mut doc = "model_providers = 'invalid'\n".parse::<Document>().unwrap();
        let original = doc.to_string();
        assert!(write_builtin_aliases(&mut doc, None).is_err());
        assert_eq!(doc.to_string(), original);
    }
}
