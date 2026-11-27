import { readFile } from 'node:fs/promises'

/**
 * Source-text contracts must survive formatter rewraps. Prettier splits long
 * member chains and argument lists across lines and adds trailing commas, so
 * compare against a layout-independent form: line comments stripped, wrapped
 * chains (including `?.`) rejoined, padding inside brackets and trailing commas
 * removed, and every whitespace run collapsed to one space.
 *
 * The transformation is not literal-aware: text inside strings, templates and
 * regular expressions is normalized too, so assert on code shape rather than
 * on exact copy. Only use this for TypeScript/TSX sources (CSS descendant
 * selectors and markup whitespace would be rewritten).
 */
export function normalizeSource(source: string): string {
  return source
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
    .replace(/\s+(\??\.)(?=[A-Za-z_$])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .replace(/,?\s+([)\]])/g, '$1')
    .replace(/,\s*\}/g, ' }')
    .replace(/\s+/g, ' ')
}

export async function readSource(path: URL | string): Promise<string> {
  return normalizeSource(await readFile(path, 'utf8'))
}
