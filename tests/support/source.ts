import { readFile } from 'node:fs/promises'

/**
 * Source-text contracts must survive formatter rewraps. Prettier splits long
 * member chains and argument lists across lines and adds trailing commas, so
 * compare against a layout-independent form: wrapped chains rejoined, padding
 * inside brackets removed and every whitespace run collapsed to one space.
 * Only use this for TypeScript/TSX sources (CSS descendant selectors would merge).
 */
export function normalizeSource(source: string): string {
  return source
    .replace(/\s+\.(?=[A-Za-z_$])/g, '.')
    .replace(/([([])\s+/g, '$1')
    .replace(/,?\s+([)\]])/g, '$1')
    .replace(/,\s*\}/g, ' }')
    .replace(/\s+/g, ' ')
}

export async function readSource(path: URL | string): Promise<string> {
  return normalizeSource(await readFile(path, 'utf8'))
}
