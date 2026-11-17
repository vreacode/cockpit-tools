import assert from 'node:assert/strict';
import test from 'node:test';
import { needsWebKitStartupRebuild, rebuildStartupRoot } from './startupPresentation.ts';

test('startup workaround is restricted to Tauri ARM Linux WebKit', () => {
  const webkit = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/605.1.15 Safari/605.1.15';
  assert.equal(needsWebKitStartupRebuild('Linux aarch64', webkit, true), true);
  assert.equal(needsWebKitStartupRebuild('Linux arm64', webkit, true), true);
  assert.equal(needsWebKitStartupRebuild('Linux aarch64', webkit, false), false);
  assert.equal(needsWebKitStartupRebuild('Linux x86_64', webkit.replace('aarch64', 'x86_64'), true), false);
  assert.equal(needsWebKitStartupRebuild('MacIntel', webkit, true), false);
  assert.equal(needsWebKitStartupRebuild('Win32', webkit, true), false);
  assert.equal(needsWebKitStartupRebuild('Linux aarch64', webkit + ' Chrome/130.0', true), false);
});

test('render tree rebuild forces both layouts and restores the exact inline display declaration', () => {
  for (const initial of ['', 'flex']) {
    let value = initial;
    let priority = initial ? 'important' : '';
    const reads: string[] = [];
    const root = {
      style: {
        getPropertyValue: () => value,
        getPropertyPriority: () => priority,
        setProperty: (_name: string, next: string, nextPriority: string) => { value = next; priority = nextPriority; },
        removeProperty: () => { value = ''; priority = ''; },
      },
      get offsetHeight() { reads.push(value); return value === 'none' ? 0 : 800; },
    };
    rebuildStartupRoot(root as unknown as HTMLElement);
    assert.deepEqual(reads, ['none', initial]);
    assert.equal(value, initial);
    assert.equal(priority, initial ? 'important' : '');
  }
});
