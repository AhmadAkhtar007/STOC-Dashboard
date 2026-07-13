import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEV_SERVER_ORIGIN = 'http://127.0.0.1:5173';

export function isAllowedRendererUrl(rawUrl: string, distRoot: string, allowDevelopmentOrigin: boolean): boolean {
  try {
    const url = new URL(rawUrl);
    if (
      allowDevelopmentOrigin &&
      url.origin === DEV_SERVER_ORIGIN &&
      !url.username &&
      !url.password
    ) return true;
    if (url.protocol !== 'file:') return false;
    const requestedPath = path.resolve(fileURLToPath(url));
    const relative = path.relative(path.resolve(distRoot), requestedPath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  } catch {
    return false;
  }
}
