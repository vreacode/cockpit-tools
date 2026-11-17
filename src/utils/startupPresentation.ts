/** Keep startup diagnostics structural: never include account text or stored preferences. */
export function startupLayoutSnapshot(): Record<string, unknown> {
  const selectors = ['html', 'body', '#root', '.app-container', '.main-wrapper', '.side-nav'];
  const boxes = selectors.flatMap(selector => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return [];
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return [{
      selector, width: rect.width, height: rect.height,
      display: style.display, visibility: style.visibility, opacity: style.opacity,
      transform: style.transform, filter: style.filter,
      backdropFilter: style.getPropertyValue('backdrop-filter'),
    }];
  });
  const blocked = boxes.some(box => box.display === 'none' || box.visibility === 'hidden'
    || box.visibility === 'collapse' || Number(box.opacity) === 0);
  const root = boxes.find(box => box.selector === '#root');
  return {
    visibility: document.visibilityState,
    rootChildren: document.getElementById('root')?.childElementCount ?? 0,
    splashPresent: Boolean(document.getElementById('app-boot-splash')),
    layout: blocked ? 'style-hidden' : root && root.width > 0 && root.height > 0 ? 'nonzero' : 'empty',
    // DOM/rAF cannot establish that WebKit or the native compositor presented pixels.
    pixelPresentation: 'unverified', boxes,
  };
}

export function needsWebKitStartupRebuild(platform: string, userAgent: string, tauri: boolean): boolean {
  return tauri && /^Linux\b/i.test(platform) && /\b(aarch64|arm64)\b/i.test(`${platform} ${userAgent}`)
    && /AppleWebKit\//.test(userAgent) && !/(Chrome|Chromium|Edg)\//.test(userAgent);
}

export function isArmLinuxWebKit(): boolean {
  return typeof navigator !== 'undefined' && typeof window !== 'undefined'
    && needsWebKitStartupRebuild(navigator.platform, navigator.userAgent, '__TAURI_INTERNALS__' in window);
}

/**
 * Reconstruct the render tree underneath the still-opaque splash. A layout read
 * on each side of display:none prevents WebKit coalescing the change away.
 * Restore the exact inline declaration; React nodes/state and data stay intact.
 */
export function rebuildStartupRoot(root: HTMLElement): void {
  const value = root.style.getPropertyValue('display');
  const priority = root.style.getPropertyPriority('display');
  try {
    root.style.setProperty('display', 'none', 'important');
    void root.offsetHeight;
  } finally {
    if (value) root.style.setProperty('display', value, priority);
    else root.style.removeProperty('display');
  }
  void root.offsetHeight;
}
