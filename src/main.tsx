import { reloadSideNavPreferences } from './stores/useSideNavLayoutStore';
import { reloadUiTimeDisplayPreference } from './stores/useUiConfigStore';
import { installTauriEventCleanupGuard, subscribeTauriEvent } from "./utils/tauriEventListener";
import React, { useLayoutEffect } from "react";
import ReactDOM from "react-dom/client";
import { initI18n } from "./i18n";
import { AppRuntimeGuard } from "./components/AppRuntimeGuard";
import { CodexProxyEngineProvider } from "./components/codex/CodexProxyEngineProvider";
import {
  captureError,
  initErrorReporter,
  markFrontendReady,
  recordFrontendStage,
} from "./utils/errorReporter";
import { observeBootPresentation, setBootSplashStage } from "./utils/bootSplash";
import { isArmLinuxWebKit, startupLayoutSnapshot } from "./utils/startupPresentation";
import { applyPlatformLayoutSnapshot, hydrateUiPreferences } from "./utils/uiPreferences";
import { applyDurableUiSnapshot, hydrateDurableUiSettings } from "./utils/durableUiSettings";

initErrorReporter();
recordFrontendStage("script_loaded");
setBootSplashStage("script_loaded");
void initI18n();

observeBootPresentation(stage => recordFrontendStage(stage, startupLayoutSnapshot()));
if (isArmLinuxWebKit()) document.documentElement.dataset.webkitStartupCompat = 'true';

let rootCommitted = false;
function RootCommitMarker() {
  useLayoutEffect(() => {
    if (rootCommitted) return;
    rootCommitted = true;
    setBootSplashStage('react_mounted');
    recordFrontendStage('react_mounted', startupLayoutSnapshot());
    markFrontendReady('react_mounted');
  }, []);
  return null;
}

void (async () => {
  const { default: App } = await import("./App");

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    const error = new Error("Root element not found");
    captureError(error, { source: "frontend_boot", phase: "root_lookup" });
    throw error;
  }

  recordFrontendStage("react_mount_start");
  installTauriEventCleanupGuard();
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AppRuntimeGuard>
        <CodexProxyEngineProvider><App /></CodexProxyEngineProvider>
        <RootCommitMarker />
      </AppRuntimeGuard>
    </React.StrictMode>,
  );

  // Durable preferences hydrate in the background; never block the first render.
  void hydrateUiPreferences();
  subscribeTauriEvent<Parameters<typeof applyDurableUiSnapshot>[0]>('ui-preferences:updated', event => {
    applyDurableUiSnapshot(event.payload);
    applyPlatformLayoutSnapshot(event.payload);
  });
  window.addEventListener('agtools:ui-time-display-changed', reloadUiTimeDisplayPreference);
  window.addEventListener('agtools:side-nav-preferences-changed', reloadSideNavPreferences);
  void hydrateDurableUiSettings().catch(error => console.warn('[UI preferences]', error));
})();
