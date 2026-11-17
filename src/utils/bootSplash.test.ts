import assert from "node:assert/strict";
import test from "node:test";
import {
  dismissBootSplash,
  observeBootPresentation,
  resetBootSplashStateForTests,
  setBootSplashStage,
} from "./bootSplash.ts";

function installSplashDom() {
  const splash = {
    className: "",
    classList: {
      add(name: string) {
        const owner = this.owner;
        if (!owner) return;
        owner.className = `${owner.className} ${name}`.trim();
      },
      owner: null as { className: string } | null,
    },
    attrs: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    },
    removed: false,
    remove() {
      this.removed = true;
    },
  };
  splash.classList.owner = splash;

  const track = {
    attrs: {} as Record<string, string>,
    setAttribute(name: string, value: string) {
      this.attrs[name] = value;
    },
  };

  const bar = {
    style: { width: "" },
    parentElement: track,
  };

  const previousDocument = (globalThis as { document?: unknown }).document;
  const previousSetTimeout = globalThis.setTimeout;
  (globalThis as { document?: unknown }).document = {
    getElementById(id: string) {
      if (id === "app-boot-splash") return splash;
      if (id === "app-boot-bar") return bar;
      return null;
    },
  };
  const timeouts: Array<() => void> = [];
  globalThis.setTimeout = ((handler: () => void) => {
    timeouts.push(handler);
    return 1;
  }) as typeof setTimeout;

  return {
    splash,
    bar,
    track,
    timeouts,
    restore() {
      (globalThis as { document?: unknown }).document = previousDocument;
      globalThis.setTimeout = previousSetTimeout;
      resetBootSplashStateForTests();
    },
  };
}

test("dismissBootSplash hides and removes the static splash once", () => {
  resetBootSplashStateForTests();
  const dom = installSplashDom();
  try {
    dismissBootSplash();
    dismissBootSplash();
    assert.match(dom.splash.className, /is-hidden/);
    assert.equal(dom.splash.attrs["aria-hidden"], "true");
    assert.equal(dom.splash.removed, false);
    assert.equal(dom.timeouts.length, 1);
    dom.timeouts[0]();
    assert.equal(dom.splash.removed, true);
  } finally {
    dom.restore();
  }
});

test('ARM WebKit reveals once after two frames; a hidden startup waits for visibility', () => {
  for (const hidden of [false, true]) {
    const dom = installSplashDom();
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const doc = document as unknown as {
      visibilityState: string;
      addEventListener: (name: string, listener: () => void) => void;
      removeEventListener: (name: string, listener: () => void) => void;
    };
    const frames: FrameRequestCallback[] = [];
    const listeners = new Set<() => void>();
    const stages: string[] = [];
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {
      __TAURI_INTERNALS__: {}, requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback),
    } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
      platform: 'Linux aarch64', userAgent: 'AppleWebKit/605.1.15',
    } });
    doc.visibilityState = hidden ? 'hidden' : 'visible';
    doc.addEventListener = (_name, listener) => { listeners.add(listener); };
    doc.removeEventListener = (_name, listener) => { listeners.delete(listener); };
    try {
      observeBootPresentation(stage => stages.push(stage));
      setBootSplashStage('script_loaded');
      assert.equal(frames.length, 0, 'script load must not reveal an uncommitted page');
      setBootSplashStage('page_ready');
      dismissBootSplash();
      assert.equal(dom.timeouts.length, 0);
      if (hidden) {
        assert.equal(frames.length, 0);
        doc.visibilityState = 'visible';
        [...listeners].forEach(listener => listener());
      }
      assert.equal(frames.length, 1);
      assert.equal(listeners.size, 0);
      frames.shift()!(0);
      assert.equal(dom.splash.removed, false, 'keep splash during layout rebuild');
      assert.equal(frames.length, 1);
      frames.shift()!(16);
      assert.equal(dom.splash.removed, true);
      assert.equal(frames.length, 0, 'no recurring repaint loop');
      assert.deepEqual(stages, ['page_committed', 'webkit_root_rebuilt', 'splash_removed']);
    } finally {
      if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator);
      else Reflect.deleteProperty(globalThis, 'navigator');
      dom.restore();
    }
  }
});

test("boot splash stages only move forward and page ready dismisses", () => {
  resetBootSplashStateForTests();
  const dom = installSplashDom();
  try {
    setBootSplashStage("script_loaded");
    assert.equal(dom.track.attrs["data-mode"], "determinate");
    assert.equal(dom.bar.style.width, "80%");

    setBootSplashStage("react_mounted");
    assert.equal(dom.bar.style.width, "90%");

    setBootSplashStage("script_loaded");
    assert.equal(dom.bar.style.width, "90%");

    setBootSplashStage("page_ready");
    assert.equal(dom.bar.style.width, "100%");
    assert.match(dom.splash.className, /is-hidden/);
  } finally {
    dom.restore();
  }
});
