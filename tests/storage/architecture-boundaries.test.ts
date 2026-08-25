import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = new URL('../../src/', import.meta.url)
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])

async function collectFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: URL[] = []
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
    if (entry.isDirectory()) files.push(...await collectFiles(child))
    else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(child)
  }
  return files
}

function importsLayer(content: string, layer: string): boolean {
  return new RegExp(`from\\s+['\"][^'\"]*\\/${layer}(?:\\/|['\"])`).test(content)
}

test('strategic dependency direction stays acyclic across architectural layers', async () => {
  const violations: string[] = []
  for (const file of await collectFiles(root)) {
    const path = relative(new URL('../../', import.meta.url).pathname, file.pathname).replaceAll('\\\\', '/')
    const content = await readFile(file, 'utf8')
    const has = (layer: string) => importsLayer(content, layer)

    if (path.startsWith('src/domain/') && ['application', 'data', 'composition', 'features', 'ui'].some(has)) {
      violations.push(`${path}: domain must not depend on outer layers`)
    }
    if (path.startsWith('src/data/') && ['application', 'composition', 'features', 'ui'].some(has)) {
      violations.push(`${path}: data adapters must not depend on application/composition/features/ui`)
    }
    if (path.startsWith('src/application/') && ['data', 'composition', 'features', 'ui'].some(has)) {
      violations.push(`${path}: application must depend on ports/domain, not outer layers`)
    }
    if (path.startsWith('src/composition/') && ['features', 'ui'].some(has)) {
      violations.push(`${path}: composition must wire application/data, not depend on presentation`)
    }
    if (path.startsWith('src/ui/') && ['data', 'composition', 'features'].some(has)) {
      violations.push(`${path}: shared UI must consume application/domain boundaries, not adapters or features`)
    }
  }
  assert.deepEqual(violations, [])
})
