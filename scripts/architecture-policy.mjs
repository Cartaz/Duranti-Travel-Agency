import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])
const forbiddenBridgeFiles = new Set([
  'src/features/trips/trip-service.ts',
  'src/features/days/day-service.ts',
  'src/features/planner/block-service.ts',
  'src/features/reservations/reservation-service.ts',
  'src/features/media/day-media-service.ts',
  'src/features/templates/day-template-service.ts',
  'src/features/templates/personal-day-template-service.ts',
  'src/features/expenses/expense-service.ts',
  'src/features/expenses/expense-summary-service.ts',
  'src/features/travelers/traveler-service.ts',
  'src/features/places/place-service.ts',
  'src/features/itinerary/itinerary-service.ts',
  'src/features/itinerary/itinerary-order-service.ts',
  'src/features/itinerary/itinerary-orphan-service.ts',
  'src/features/itinerary/trip-itinerary-service.ts',
])
const forbiddenBridgeImportTokens = [
  '/trips/trip-service', '/days/day-service', '/planner/block-service', '/reservations/reservation-service', '/media/day-media-service', '/templates/day-template-service', '/templates/personal-day-template-service', '/expenses/expense-service', '/expenses/expense-summary-service', '/travelers/traveler-service', '/places/place-service', '/itinerary/itinerary-service', '/itinerary/itinerary-order-service', '/itinerary/itinerary-orphan-service', '/itinerary/trip-itinerary-service',
  '../trips/trip-service', '../days/day-service', '../planner/block-service', '../reservations/reservation-service', '../media/day-media-service', '../templates/day-template-service', '../templates/personal-day-template-service', '../expenses/expense-service', '../expenses/expense-summary-service', '../travelers/traveler-service', '../places/place-service', '../itinerary/itinerary-service', '../itinerary/itinerary-order-service', '../itinerary/itinerary-orphan-service', '../itinerary/trip-itinerary-service',
  './block-service', './reservation-service', './day-media-service', './day-template-service', './personal-day-template-service', './expense-service', './expense-summary-service', './traveler-service', './place-service', './itinerary-service', './itinerary-order-service', './itinerary-orphan-service', './trip-itinerary-service',
]
const applicationBackedFeatureRoots = [
  'src/features/trips/', 'src/features/days/', 'src/features/planner/', 'src/features/reservations/', 'src/features/media/', 'src/features/templates/', 'src/features/expenses/', 'src/features/travelers/', 'src/features/places/', 'src/features/itinerary/',
]
const plannerPagePaths = new Set(['src/features/planner/DayPlannerPage.tsx', 'src/features/planner/GuidedDayPlannerPage.tsx'])
const presentationCompositionFeature = 'planner'

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const child = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectFiles(child))
    else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(child)
  }
  return files
}

function importsLayer(content, layer) {
  return new RegExp(`from\\s+['\"][^'\"]*\\/${layer}(?:\\/|['\"])`).test(content)
}

function importedSpecifiers(content) {
  const values = []
  const pattern = /(?:from\s+|import\s*)['"]([^'"]+)['"]/g
  for (const match of content.matchAll(pattern)) values.push(match[1])
  return values
}

function featureName(path) {
  return path.match(/^src\/features\/([^/]+)(?:\/|$)/)?.[1]
}

function importedFeature(root, path, specifier) {
  if (!specifier.startsWith('.')) return undefined
  const target = relative(root, resolve(root, dirname(path), specifier)).replaceAll('\\', '/')
  return featureName(target)
}

function enforcePresentationDependencies(root, path, content, violations) {
  const owner = featureName(path)
  if (!owner) return

  for (const specifier of importedSpecifiers(content)) {
    const target = importedFeature(root, path, specifier)
    if (!target || target === owner) continue
    if (owner !== presentationCompositionFeature) {
      violations.push(`${path}: feature ${owner} must not import presentation from feature ${target}; only ${presentationCompositionFeature} is the presentation composition root`)
    }
  }
}

function enforceDependencyDirection(root, path, content, violations) {
  const has = (layer) => importsLayer(content, layer)

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

  if (applicationBackedFeatureRoots.some((prefix) => path.startsWith(prefix))) {
    if (has('data')) violations.push(`${path}: application-backed feature must never import data adapters directly`)
    if (has('composition')) violations.push(`${path}: application-backed feature must depend on application/UI boundaries, never composition directly`)
  }

  if (plannerPagePaths.has(path) && !content.includes('useApplicationServices')) {
    violations.push(`${path}: planner pages must resolve application capabilities through useApplicationServices`)
  }

  if (forbiddenBridgeFiles.has(path)) {
    violations.push(`${path}: removed feature-service bridge must not be recreated`)
  }
  for (const token of forbiddenBridgeImportTokens) {
    if (content.includes(token)) violations.push(`${path}: removed feature-service bridge import is forbidden (${token})`)
  }

  enforcePresentationDependencies(root, path, content, violations)
}

export async function collectArchitectureViolations(root = process.cwd()) {
  const sourceRoot = join(root, 'src')
  const violations = []
  for (const absolute of await collectFiles(sourceRoot)) {
    const path = relative(root, absolute).replaceAll('\\', '/')
    const content = await readFile(absolute, 'utf8')
    enforceDependencyDirection(root, path, content, violations)
  }
  return violations
}
