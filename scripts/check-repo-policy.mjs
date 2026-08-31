import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { collectArchitectureViolations } from './architecture-policy.mjs'

const root = process.cwd()
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yml', '.yaml'])

const legacyToken = 'dura' + 'nti'
const legacyProductName = 'Dura' + 'nti Travel Agency'
const legacyVaultExtension = '.' + legacyToken
const legacyVaultMagic = 'DUR' + 'VLT'
const legacyDocumentMagic = 'DUR' + 'DOC'
const maximumSchemaVersionBeforeVaultMigration = 1

const violations = []

function hasPersistentLegacyIdentifier(content) {
  const patterns = [
    `DB_NAME = '${legacyToken}'`, `ROOT_DIRECTORY = '${legacyToken}'`, `${legacyToken}|vault|`,
    `${legacyToken}|encrypted-`, `${legacyToken}-vault`, `application/vnd.${legacyToken}.vault`, legacyVaultExtension,
  ]
  return patterns.some((pattern) => content.toLowerCase().includes(pattern.toLowerCase()))
}

async function scanRepositoryContracts(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) { await scanRepositoryContracts(absolute); continue }
    if (!entry.isFile() || !textExtensions.has(extname(entry.name))) continue

    const content = await readFile(absolute, 'utf8')
    const path = relative(root, absolute).replaceAll('\\', '/')
    if (hasPersistentLegacyIdentifier(content)) violations.push(`${path}: persistent predecessor identifier is forbidden`)
    if (content.includes(legacyVaultMagic)) violations.push(`${path}: predecessor Vault magic is forbidden`)
    if (content.includes(legacyDocumentMagic)) violations.push(`${path}: predecessor private-document magic is forbidden`)
    if (content.includes(legacyProductName)) violations.push(`${path}: predecessor product name is forbidden; use DTAgency`)
  }
}

async function enforceDatabaseVersionGate() {
  const databasePath = 'src/data/db/dtagency-db.ts'
  const databaseSource = await readFile(join(root, databasePath), 'utf8')
  const match = databaseSource.match(/export const DB_VERSION = (\d+)/)
  if (!match) { violations.push(`${databasePath}: DB_VERSION could not be verified`); return }
  const version = Number(match[1])
  if (version > maximumSchemaVersionBeforeVaultMigration) violations.push(`${databasePath}: DB_VERSION ${version} is blocked until Vault snapshot migration and regression tests exist`)
}

await scanRepositoryContracts(root)
violations.push(...await collectArchitectureViolations(root))
await enforceDatabaseVersionGate()

if (violations.length > 0) {
  console.error('DTAgency repository policy violations:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('DTAgency repository policy check passed.')
}
