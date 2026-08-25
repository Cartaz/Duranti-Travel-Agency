import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const textExtensions = new Set([
  '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yml', '.yaml',
])

const forbiddenLegacyToken = 'dura' + 'nti'
const forbiddenVaultMagic = 'DUR' + 'VLT'
const forbiddenDocumentMagic = 'DUR' + 'DOC'
const maximumSchemaVersionBeforeVaultMigration = 1

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
    const normalized = content.toLowerCase()

    if (normalized.includes(forbiddenLegacyToken)) {
      violations.push(`${path}: legacy DTAgency predecessor identifier is forbidden`)
    }
    if (content.includes(forbiddenVaultMagic)) {
      violations.push(`${path}: legacy Vault magic is forbidden`)
    }
    if (content.includes(forbiddenDocumentMagic)) {
      violations.push(`${path}: legacy private-document magic is forbidden`)
    }
  }
}

async function enforceDatabaseVersionGate() {
  const databasePath = 'src/data/db/dtagency-db.ts'
  const databaseSource = await readFile(join(root, databasePath), 'utf8')
  const match = databaseSource.match(/export const DB_VERSION = (\d+)/)
  if (!match) {
    violations.push(`${databasePath}: DB_VERSION could not be verified`)
    return
  }

  const version = Number(match[1])
  if (version > maximumSchemaVersionBeforeVaultMigration) {
    violations.push(
      `${databasePath}: DB_VERSION ${version} is blocked until Vault snapshot migration and regression tests exist`,
    )
  }
}

await scan(root)
await enforceDatabaseVersionGate()

if (violations.length > 0) {
  console.error('DTAgency repository policy violations:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('DTAgency repository policy check passed.')
}
