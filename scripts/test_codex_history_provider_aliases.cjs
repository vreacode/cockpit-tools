// Compile the production helper and its Rust tests without building Tauri/GTK.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const harness = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-provider-tests-'));
const source = path.join(repo, 'crates/cockpit-core/src/modules/codex_history_provider_aliases.rs');
fs.mkdirSync(path.join(harness, 'src'));
fs.writeFileSync(path.join(harness, 'Cargo.toml'), [
  '[package]', 'name = "cockpit-history-provider-tests"', 'version = "0.1.0"',
  'edition = "2021"', '[workspace]', '[dependencies]', 'toml_edit = "=0.20.2"', '',
].join('\n'));
fs.writeFileSync(path.join(harness, 'src/lib.rs'),
  `#[cfg(test)]\n#[path = ${JSON.stringify(source)}]\nmod aliases;\n`);
const result = spawnSync('cargo', [
  'test', '--manifest-path', path.join(harness, 'Cargo.toml'),
  '--target-dir', path.join(repo, 'target/history-provider-tests'),
], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
