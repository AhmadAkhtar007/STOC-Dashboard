import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { isAllowedRendererUrl } from '../../electron/security';

describe('isAllowedRendererUrl', () => {
  const distRoot = path.resolve('dist');

  it('allows only the fixed loopback development origin when development is enabled', () => {
    expect(isAllowedRendererUrl('http://127.0.0.1:5173/dashboard', distRoot, true)).toBe(true);
    expect(isAllowedRendererUrl('http://localhost:5173/dashboard', distRoot, true)).toBe(false);
    expect(isAllowedRendererUrl('http://127.0.0.1:5174/dashboard', distRoot, true)).toBe(false);
    expect(isAllowedRendererUrl('https://example.com', distRoot, true)).toBe(false);
  });

  it('allows app files only within the packaged dist directory', () => {
    const appFile = pathToFileURL(path.join(distRoot, 'index.html')).toString();
    const assetFile = pathToFileURL(path.join(distRoot, 'assets', 'index.js')).toString();
    const outsideFile = pathToFileURL(path.resolve('package.json')).toString();

    expect(isAllowedRendererUrl(appFile, distRoot, false)).toBe(true);
    expect(isAllowedRendererUrl(assetFile, distRoot, false)).toBe(true);
    expect(isAllowedRendererUrl(outsideFile, distRoot, false)).toBe(false);
    expect(isAllowedRendererUrl('file:///C:/Windows/System32/calc.exe', distRoot, false)).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedRendererUrl('not a URL', distRoot, true)).toBe(false);
  });
});

describe('renderer content security policy', () => {
  it('restricts production resources to the app and disallows embedded frames', () => {
    const html = fs.readFileSync(path.resolve('index.html'), 'utf8');

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'self'");
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("frame-src 'none'");
    expect(html).not.toContain("script-src 'self' 'unsafe-inline'");
  });
});
