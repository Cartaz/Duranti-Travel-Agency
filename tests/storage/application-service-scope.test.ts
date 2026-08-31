import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

async function collect(directory: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collect(path))
    else if (entry.isFile() && ['.ts', '.tsx'].includes(extname(path))) files.push(path)
  }
  return files
}

test('presentation declares application capabilities instead of resolving the whole registry', async () => {
  for (const path of await collect(new URL('../../src/features', import.meta.url).pathname)) {
    const source = await readFile(path, 'utf8')
    assert.doesNotMatch(source, /useApplicationServices\s*\(\s*\)/, `${path} resolves the whole application registry`)
  }
})
