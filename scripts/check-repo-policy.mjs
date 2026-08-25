import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const textExtensions = new Set([
  '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yml', '.yaml',
])

const forbiddenVaultExtension = '.' + 'duranti'
const forbiddenLegacyProductName = 'Duranti' + ' Travel Agency'

const violations = []

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue

    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) {
      await scan(absolute)
      continue
    }

    if (!entry.isFile() || !textExtensions.has(extname(entry.name))) continue

    const content = await readFile(absolute, 'utf8')
    const path = relative(root, absolute)

    if (content.includes(forbiddenVaultExtension)) {
      violations.push(`${path}: legacy Vault extension is forbidden; use .dtagency`)
    }
    if (content.includes(forbiddenLegacyProductName)) {
      violations.push(`${path}: legacy product name is forbidden; use DTAgency`)
    }
  }
}

await scan(root)

if (violations.length > 0) {
  console.error('DTAgency repository policy violations:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('DTAgency repository policy check passed.')
}
