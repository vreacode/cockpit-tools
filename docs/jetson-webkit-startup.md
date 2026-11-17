# Jetson ARM64 / WebKitGTK startup

This change is a mitigation for an intermittent first-presentation failure, not a
confirmed WebKit driver root-cause fix. An already running Jetson window showed
only the body gradient while React had committed visible, nonzero layout. The
main window is visible by default; `visible: false` in tauri.conf.json belongs to
the floating card. Subsequent unmodified launches sometimes presented normally.
No individual transform/backdrop-filter has been established as the cause.

Previously `react_mounted` was emitted from a requestAnimationFrame scheduled
immediately after createRoot().render(). That does not establish React commit.
The HTML also faded the splash unconditionally after 15 seconds, independently
of page readiness. The new root marker runs in React's layout effect; the page
marker remains inside the visible Suspense page, after its DOM is committed.

Only Tauri + Linux + ARM64 + WebKit takes the compatibility path. It keeps the
splash opaque, waits for document visibility, and in a single animation frame
removes/restores the root's display declaration with a layout read on both sides.
This rebuilds the render tree without unmounting React. On the following frame
it removes the splash without a fullscreen opacity transition. There are no
polling timers, repeated React updates, resize commands or permanent root styles.
Other platforms retain the previous splash transition and timeout.

Diagnostics record `react_mounted`, `page_committed`, `webkit_root_rebuilt`, and
`splash_removed`, with dimensions, display/visibility/opacity and layer styles.
They contain no account contents or storage values. `layout: style-hidden`
indicates a CSS visibility blocker; `layout: nonzero` establishes layout only.
`pixelPresentation: unverified` is intentional: DOM metrics and animation frames
cannot prove WebKit rasterization or native compositor presentation. To separate
those last two cases requires comparing a WebKit snapshot with an OS screenshot.

## Local verification and deployment

```bash
npm run typecheck
node scripts/run_ts_tests.cjs src/utils/bootSplash.test.ts src/utils/startupPresentation.test.ts
npm run build
```

Production Tauri embeds dist in its executable. These commands alone do not
update target/release/cockpit-tools or the desktop application. The retained
Release dependency file explicitly lists dist/assets/App-DBdz4FN7.js and the
other embedded frontend assets. Do not clean target or delete the old binary.

For a formal build, push these changes to a branch in a GitHub fork, select
Actions > Jetson ARM64 (Ubuntu 22.04) > Run workflow, and select that branch.
`.github/workflows/jetson-arm64.yml` builds on a native ARM64 runner inside an
Ubuntu 22.04 container, checks required GLIBC versions are <= 2.35, and uploads
`cockpit-tools-jetson-ubuntu22.04-arm64`. It does not publish a release. The
existing general ARM64 workflows use Ubuntu 24.04 directly and should not be
used to produce a Jammy-compatible executable without such a container.

After downloading/extracting the artifact, fully quit Cockpit Tools (including
its tray process), then use these commands from the repository, replacing the
artifact source path with its actual extracted location:

```bash
install -m 755 /path/to/artifact/target/ci/cockpit-tools target/release/cockpit-tools.jetson-fixed
./target/release/cockpit-tools.jetson-fixed
```

First verify three full quit/relaunch cycles without Inspector or compositor
flags. After that, back up the original executable and replace it; the existing
desktop Exec paths then resolve the new embedded frontend:

```bash
cp -n target/release/cockpit-tools target/release/cockpit-tools.before-webkit-fix
mv target/release/cockpit-tools.jetson-fixed target/release/cockpit-tools
```

The local desktop entry named `Cockpit Tools.desktop` currently invokes
`~/.local/bin/cockpit-tools-start`, an old script that performs xdotool/wmctrl
maximize toggles. Change that entry's Exec to the absolute new executable path
when installing the formal build. This fix does not require that script. Do not
remove configuration, accounts, LocalStorage, WebKit cache or user data.

## Validation recorded on this device

- Relevant five unit tests passed, including platform isolation, exact inline
  style restoration, hidden-startup handling, frame ordering and no repaint loop.
- Full `npm run typecheck` passed.
- Production Vite build passed with existing chunk-size/dynamic import warnings.
- No Rust build or cargo clean was run.
- For fast runtime verification only, a temporary native shim in /tmp replaced
  the Tauri asset responses with the freshly generated dist. The old Rust host,
  tauri://localhost origin, IPC, WebKitGTK and actual user configuration were
  retained. No Inspector or window-toggle utility was used; complete UI was
  visible in native screen captures across three full process launches. Each
  logged one rebuild and one splash removal. This is a preview, not an installed
  production fix; the shim is not part of the source fix or Actions artifact.
- The formal rebuilt executable and installation via the GNOME icon remain to
  be verified. An intermittent baseline means successful preview launches alone
  cannot establish a complete cure.

## Follow-up: formal artifact diagnosis and production build flag

The first Actions artifact omitted `tauri/custom-protocol`. Tauri's `dev` cfg
is selected by that feature, independently of Cargo's release profile; the
artifact tried devUrl and reported no frontend stage. The workflow now passes
`--features tauri/custom-protocol` explicitly to embed and load production dist.

The next production artifact (run 44070000400) exposed a separate, reproducible
resource stall on this Jetson: `script_loaded` appeared, `#root` remained empty,
App JS and CSS fetched successfully with HTTP 200, but the dynamically appended
App stylesheet had no CSSStyleSheet and never completed its load event. Native
logs reported `WebLoaderStrategy::networkProcessCrashed()` and
`internallyFailedLoadTimerFired()`. A direct App module import completed; Vite's
original import was still waiting for its stylesheet. This is distinct from
DOM-committed-but-not-presented behavior, so a repaint alone cannot address it.

For isolation, the same production executable was run with only its index HTML
replaced, omitting the Google Fonts preconnect and stylesheet links. All JS/CSS
remained embedded in the executable, with the same accounts/configuration. With
no Inspector and no window operations, `script_loaded` -> `react_mount_start` ->
`splash_removed` completed in about four seconds and the native compositor
capture showed the full UI; NetworkProcess stayed alive. The shim was a temporary
validation instrument in /tmp and is not part of the installed fix.

The HTML now guards font loading synchronously, before any external font
request, only for Tauri ARM64 Linux WebKit. That path uses existing system font
fallbacks; Windows, macOS, Linux x64 and Chromium keep the Google Fonts links.
`tests/startupFonts.test.ts` executes the actual HTML bootstrap with platform
variants and checks no font/preconnect links are emitted on the affected path.
The distinction between avoiding the network-process trigger and the bounded
first-layout mitigation is intentional; neither clears WebKit or account data.
