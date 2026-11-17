import { isArmLinuxWebKit, rebuildStartupRoot } from './startupPresentation';

const BOOT_SPLASH_ID = "app-boot-splash";
const BOOT_BAR_ID = "app-boot-bar";
const BOOT_SPLASH_HIDDEN_CLASS = "is-hidden";
const BOOT_SPLASH_REMOVE_DELAY_MS = 280;

export type BootSplashStage = "script_loaded" | "react_mounted" | "page_ready";

const STAGE_PROGRESS: Record<BootSplashStage, number> = {
  script_loaded: 80,
  react_mounted: 90,
  page_ready: 100,
};

let bootSplashDismissed = false;
let lastProgress = 0;
let reportPresentation: (stage: string) => void = () => {};

export function observeBootPresentation(report: (stage: string) => void): void {
  reportPresentation = report;
}

function bootSplashElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.getElementById(BOOT_SPLASH_ID);
}

function bootBarElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return document.getElementById(BOOT_BAR_ID);
}

export function setBootSplashStage(stage: BootSplashStage): void {
  if (bootSplashDismissed) {
    return;
  }
  const progress = STAGE_PROGRESS[stage];
  if (progress < lastProgress) {
    return;
  }
  lastProgress = progress;

  const bar = bootBarElement();
  const track = bar?.parentElement;
  if (track) {
    track.setAttribute("data-mode", "determinate");
  }
  if (bar) {
    bar.style.width = `${progress}%`;
  }

  if (stage === "page_ready") {
    dismissBootSplash();
  }
}

export function dismissBootSplash(): void {
  if (bootSplashDismissed || typeof document === "undefined") {
    return;
  }
  const splash = bootSplashElement();
  if (!splash) {
    bootSplashDismissed = true;
    return;
  }
  bootSplashDismissed = true;
  if (isArmLinuxWebKit()) {
    // Do not fade a fullscreen composited layer while React's first tree is
    // being installed. Rebuild once, behind the splash, then reveal next frame.
    const prepare = () => {
      if (document.visibilityState === 'hidden') return;
      document.removeEventListener('visibilitychange', prepare);
      window.requestAnimationFrame(() => {
        const root = document.getElementById('root');
        reportPresentation('page_committed');
        if (root) rebuildStartupRoot(root);
        reportPresentation('webkit_root_rebuilt');
        window.requestAnimationFrame(() => {
          splash.remove();
          reportPresentation('splash_removed');
        });
      });
    };
    document.addEventListener('visibilitychange', prepare);
    prepare();
    return;
  }
  splash.classList.add(BOOT_SPLASH_HIDDEN_CLASS);
  splash.setAttribute("aria-hidden", "true");
  globalThis.setTimeout(() => {
    splash.remove();
    reportPresentation('splash_removed');
  }, BOOT_SPLASH_REMOVE_DELAY_MS);
}

export function resetBootSplashStateForTests(): void {
  bootSplashDismissed = false;
  lastProgress = 0;
  reportPresentation = () => {};
}
