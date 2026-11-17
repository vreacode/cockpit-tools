import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { needsWebKitStartupRebuild } from '../src/utils/startupPresentation.ts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script id="app-startup-fonts">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'font guard must run synchronously in the HTML head');

test('HTML bootstrap makes no font or preconnect request on Tauri ARM Linux WebKit', () => {
  const cases = [
    ['Linux aarch64', 'AppleWebKit/605.1.15', true],
    ['Linux arm64', 'AppleWebKit/605.1.15', true],
    ['Linux x86_64', 'AppleWebKit/605.1.15', true],
    ['MacIntel', 'AppleWebKit/605.1.15', true],
    ['Win32', 'AppleWebKit/537.36 Chrome/130.0', true],
    ['Linux aarch64', 'AppleWebKit/537.36 Chrome/130.0', true],
    ['Linux aarch64', 'AppleWebKit/605.1.15', false],
  ] as const;
  for (const [platform, userAgent, tauri] of cases) {
    const appended: Array<{ rel: string; href: string; media: string; onload: () => void }> = [];
    const dataset: Record<string, string> = {};
    runInNewContext(script!, {
      window: tauri ? { __TAURI_INTERNALS__: {} } : {},
      navigator: { platform, userAgent },
      document: {
        documentElement: { dataset },
        head: { appendChild: (element: typeof appended[number]) => appended.push(element) },
        createElement: () => ({}),
      },
    });
    if (needsWebKitStartupRebuild(platform, userAgent, tauri)) {
      assert.equal(appended.length, 0);
      assert.equal(dataset.webkitStartupCompat, 'true');
    } else {
      assert.deepEqual(appended.map(element => element.rel), ['preconnect', 'preconnect', 'stylesheet']);
      assert.equal(appended[2].media, 'print');
      appended[2].onload();
      assert.equal(appended[2].media, 'all');
    }
  }
  assert.equal(/<link[^>]+href="https:\/\/fonts\./.test(html), false, 'static font links would bypass the guard');
});
