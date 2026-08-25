import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const textExtensions = new Set([
  '.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yml', '.yaml',
])

const legacyToken = 'dura' + 'nti'
const legacyProductName = 'Dura' + 'nti Travel Agency'
const legacyVaultExtension = '.' + legacyToken
const legacyVaultMagic = 'DUR' + 'VLT'
const legacyDocumentMagic = 'DUR' + 'DOC'
const maximumSchemaVersionBeforeVaultMigration = 1

const violations = []

function hasPersistentLegacyIdentifier(content) {
  const patterns = [
    `DB_NAME = '${legacyToken}'`,
    `ROOT_DIRECTORY = '${legacyToken}'`,
    `${legacyToken}|vault|`,
    `${legacyToken}|encrypted-`,
    `${legacyToken}-vault`,
    `application/vnd.${legacyToken}.vault`,
    legacyVaultExtension,
  ]
  return patterns.some((pattern) => content.toLowerCase().includes(pattern.toLowerCase()))
}

function enforceDependencyDirection(path, content) {
  const normalized = path.replaceAll('\\', '/')
  const importsDataLayer = /from\s+['"][^'"]*\/data(?:\/|['"])/.test(content)
  const importsComposition = /from\s+['"][^'"]*\/composition(?:\/|['"])/.test(content)

  if (normalized.startsWith('src/application/') && (importsDataLayer || importsComposition)) {
    violations.push(`${path}: application layer must depend on ports/domain, never data or composition`)
  }

  if (normalized.startsWith('src/features/trips/') && importsDataLayer) {
    violations.push(`${path}: trips feature must use the application boundary, not data adapters directly`)
  }
}

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

    if (hasPersistentLegacyIdentifier(content)) {
      violations.push(`${path}: persistent predecessor identifier is forbidden`)
    }
    if (content.includes(legacyVaultMagic)) {
      violations.push(`${path}: predecessor Vault magic is forbidden`)
    }
    if (content.includes(legacyDocumentMagic)) {
      violations.push(`${path}: predecessor private-document magic is forbidden`)
    }
    if (content.includes(legacyProductName)) {
      violations.push(`${path}: predecessor product name is forbidden; use DTAgency`)
    }

    enforceDependencyDirection(path, content)
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
