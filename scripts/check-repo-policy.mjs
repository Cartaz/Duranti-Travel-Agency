import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx', '.txt', '.yml', '.yaml'])

const legacyToken = 'dura' + 'nti'
const legacyProductName = 'Dura' + 'nti Travel Agency'
const legacyVaultExtension = '.' + legacyToken
const legacyVaultMagic = 'DUR' + 'VLT'
const legacyDocumentMagic = 'DUR' + 'DOC'
const maximumSchemaVersionBeforeVaultMigration = 1
const forbiddenBridgeFiles = new Set([
  'src/features/trips/trip-service.ts',
  'src/features/days/day-service.ts',
  'src/features/planner/block-service.ts',
  'src/features/reservations/reservation-service.ts',
  'src/features/media/day-media-service.ts',
  'src/features/templates/day-template-service.ts',
  'src/features/templates/personal-day-template-service.ts',
])
const forbiddenBridgeImportTokens = [
  '/trips/trip-service', '/days/day-service', '/planner/block-service', '/reservations/reservation-service', '/media/day-media-service', '/templates/day-template-service', '/templates/personal-day-template-service',
  '../trips/trip-service', '../days/day-service', '../planner/block-service', '../reservations/reservation-service', '../media/day-media-service', '../templates/day-template-service', '../templates/personal-day-template-service',
  './block-service', './reservation-service', './day-media-service', './day-template-service', './personal-day-template-service',
]
const applicationBackedFeatureRoots = [
  'src/features/trips/', 'src/features/days/', 'src/features/planner/', 'src/features/reservations/', 'src/features/media/', 'src/features/templates/',
]
const plannerPagePaths = new Set(['src/features/planner/DayPlannerPage.tsx', 'src/features/planner/GuidedDayPlannerPage.tsx'])

const violations = []

function hasPersistentLegacyIdentifier(content) {
  const patterns = [
    `DB_NAME = '${legacyToken}'`, `ROOT_DIRECTORY = '${legacyToken}'`, `${legacyToken}|vault|`,
    `${legacyToken}|encrypted-`, `${legacyToken}-vault`, `application/vnd.${legacyToken}.vault`, legacyVaultExtension,
  ]
  return patterns.some((pattern) => content.toLowerCase().includes(pattern.toLowerCase()))
}

function enforceNoBridgeImports(path, content) {
  if (!path.startsWith('src/')) return
  for (const token of forbiddenBridgeImportTokens) {
    if (content.includes(token)) violations.push(`${path}: removed feature-service bridge import is forbidden (${token})`)
  }
}

function enforceDependencyDirection(path, content) {
  const normalized = path.replaceAll('\\', '/')
  const importsDataLayer = /from\s+['"][^'"]*\/data(?:\/|['"])/.test(content)
  const importsComposition = /from\s+['"][^'"]*\/composition(?:\/|['"])/.test(content)
  const importsFeatures = /from\s+['"][^'"]*\/features(?:\/|['"])/.test(content)

  if (normalized.startsWith('src/application/') && (importsDataLayer || importsComposition || importsFeatures)) {
    violations.push(`${path}: application layer must depend on ports/domain, never data, composition, or features`)
  }

  if (applicationBackedFeatureRoots.some((prefix) => normalized.startsWith(prefix))) {
    if (importsDataLayer) violations.push(`${path}: application-backed feature must never import data adapters directly`)
    if (importsComposition) violations.push(`${path}: application-backed feature must depend on application/UI boundaries, never composition directly`)
  }

  if (plannerPagePaths.has(normalized) && !content.includes('useApplicationServices')) {
    violations.push(`${path}: planner pages must resolve application capabilities through useApplicationServices`)
  }

  enforceNoBridgeImports(normalized, content)
}

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) { await scan(absolute); continue }
    if (!entry.isFile() || !textExtensions.has(extname(entry.name))) continue

    const content = await readFile(absolute, 'utf8')
    const path = relative(root, absolute).replaceAll('\\', '/')
    if (forbiddenBridgeFiles.has(path)) violations.push(`${path}: removed feature-service bridge must not be recreated`)
    if (hasPersistentLegacyIdentifier(content)) violations.push(`${path}: persistent predecessor identifier is forbidden`)
    if (content.includes(legacyVaultMagic)) violations.push(`${path}: predecessor Vault magic is forbidden`)
    if (content.includes(legacyDocumentMagic)) violations.push(`${path}: predecessor private-document magic is forbidden`)
    if (content.includes(legacyProductName)) violations.push(`${path}: predecessor product name is forbidden; use DTAgency`)
    enforceDependencyDirection(path, content)
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

await scan(root)
await enforceDatabaseVersionGate()

if (violations.length > 0) {
  console.error('DTAgency repository policy violations:')
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log('DTAgency repository policy check passed.')
}
