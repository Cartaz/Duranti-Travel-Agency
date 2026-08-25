import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) return walk(full)
    return [full]
  })
}

function assert(condition, message) {
  if (!condition) failures.push(message)
}

const everydayRoots = [path.join(root, 'src/features'), path.join(root, 'src/ui')]
const sourceFiles = everydayRoots
  .flatMap(walk)
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => !file.includes(`${path.sep}storage-lab${path.sep}`))

for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8')
  for (const forbidden of ['window.confirm(', 'window.alert(', 'window.prompt(']) {
    if (source.includes(forbidden)) {
      failures.push(`${path.relative(root, file)} contiene ancora ${forbidden}`)
    }
  }
}

const dbSource = read('src/data/db/duranti-db.ts')
assert(/DB_NAME\s*=\s*['"]duranti['"]/.test(dbSource), 'Il database deve continuare a usare il nome duranti.')
assert(/DB_VERSION\s*=\s*3\b/.test(dbSource), 'La versione IndexedDB attesa al checkpoint è 3.')
assert(dbSource.includes("media: 'id, tripId, dayId, blockId, kind, sha256, updatedAt'"), 'L’indice media non deve inglobare i metadata opzionali della galleria.')

const viteSource = read('vite.config.ts')
assert(viteSource.includes("base: '/Duranti-Travel-Agency/'"), 'Il base path GitHub Pages non è quello atteso.')
assert(viteSource.includes("navigateFallback: '/Duranti-Travel-Agency/index.html'"), 'Il fallback PWA non è configurato sul base path Pages.')

const mediaService = read('src/features/media/day-media-service.ts')
assert(mediaService.includes('25 * 1024 * 1024'), 'Limite foto 25 MiB non trovato.')
assert(mediaService.includes('250 * 1024 * 1024'), 'Limite video 250 MiB non trovato.')
assert(mediaService.includes('MAX_DAY_MEDIA_CAPTION_LENGTH = 500'), 'Limite didascalia 500 caratteri non trovato.')

const templateService = read('src/features/templates/day-template-service.ts')
for (const blockType of ['place', 'transport', 'accommodation', 'restaurant', 'activity', 'expense']) {
  assert(templateService.includes(`case '${blockType}'`), `Sanitizzazione template mancante per ${blockType}.`)
}
assert(templateService.includes('checked: false'), 'Le checklist dei template devono azzerare lo stato checked.')
assert(templateService.includes('crypto.randomUUID()'), 'Le nuove istanze devono rigenerare identificatori.')

if (failures.length > 0) {
  console.error('\nCheckpoint statico: FAIL')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`Checkpoint statico: PASS (${sourceFiles.length} file verificati)`)
