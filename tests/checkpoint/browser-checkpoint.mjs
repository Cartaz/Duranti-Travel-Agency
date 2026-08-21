import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const ROOT_URL = 'http://127.0.0.1:4173/Duranti-Travel-Agency/'
const CDP_PORT = 9222
const output = []

function log(message) {
  output.push(message)
  console.log(message)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const started = Date.now()
  let lastError
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Timeout aspettando ${url}: ${lastError ?? 'nessuna risposta'}`)
}

function commandPath(commands) {
  for (const command of commands) {
    const result = spawnSync('which', [command], { encoding: 'utf8' })
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim()
  }
  return undefined
}

function spawnLogged(command, args, label) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`))
  return child
}

async function stop(child) {
  if (!child || child.killed) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(3000),
  ])
  if (!child.killed) child.kill('SIGKILL')
}

class CdpClient {
  constructor(url) {
    this.url = url
    this.nextId = 1
    this.pending = new Map()
    this.handlers = new Map()
  }

  async connect() {
    this.ws = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`))
        else pending.resolve(message.result)
        return
      }
      if (message.method) {
        for (const handler of this.handlers.get(message.method) ?? []) handler(message.params)
      }
    })
  }

  on(method, handler) {
    const list = this.handlers.get(method) ?? []
    list.push(handler)
    this.handlers.set(method, list)
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })
    if (response.exceptionDetails) {
      const details = response.exceptionDetails.exception?.description
        ?? response.exceptionDetails.text
        ?? 'Errore JavaScript nella pagina'
      throw new Error(details)
    }
    return response.result?.value
  }

  async navigate(url) {
    await this.send('Page.navigate', { url })
    const started = Date.now()
    while (Date.now() - started < 20_000) {
      try {
        if (await this.evaluate('document.readyState === "complete"')) return
      } catch {
        // Execution context can disappear while navigating.
      }
      await sleep(100)
    }
    throw new Error(`Navigazione non completata: ${url}`)
  }

  close() {
    this.ws?.close()
  }
}

async function waitForEval(cdp, expression, timeoutMs = 15_000) {
  const started = Date.now()
  let lastValue
  while (Date.now() - started < timeoutMs) {
    try {
      lastValue = await cdp.evaluate(expression)
      if (lastValue) return lastValue
    } catch {
      // Context may be replacing during navigation/reload.
    }
    await sleep(150)
  }
  throw new Error(`Condizione browser non raggiunta: ${expression}; ultimo valore=${String(lastValue)}`)
}

const serviceScenario = String.raw`(async () => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
  }
  const expectError = async (operation, expectedText) => {
    try {
      await operation()
    } catch (error) {
      if (expectedText && !String(error?.message ?? error).includes(expectedText)) {
        throw new Error('Errore inatteso: ' + String(error?.message ?? error))
      }
      return
    }
    throw new Error('Era atteso un errore: ' + expectedText)
  }
  const pass = []
  const root = '/Duranti-Travel-Agency/src/features/'
  const [trips, days, travelers, planner, places, expenses, reservations, itinerary, media, templates, personalTemplates] = await Promise.all([
    import(root + 'trips/trip-service.ts'),
    import(root + 'days/day-service.ts'),
    import(root + 'travelers/traveler-service.ts'),
    import(root + 'planner/block-service.ts'),
    import(root + 'places/place-service.ts'),
    import(root + 'expenses/expense-service.ts'),
    import(root + 'reservations/reservation-service.ts'),
    import(root + 'itinerary/itinerary-service.ts'),
    import(root + 'media/day-media-service.ts'),
    import(root + 'templates/day-template-service.ts'),
    import(root + 'templates/personal-day-template-service.ts'),
  ])

  const trip = await trips.createTrip({
    title: 'Checkpoint automatico',
    subtitle: 'Browser service regression',
    status: 'planned',
    startDate: '2026-09-10',
    endDate: '2026-09-15',
    currency: 'EUR',
    budgetMinor: 150000,
    summary: 'Dati automatici del checkpoint.',
  })
  assert(trip.budgetMinor === 150000, 'Budget viaggio non persistito correttamente.')
  await expectError(() => trips.createTrip({ title: 'Date errate', status: 'planned', startDate: '2026-09-12', endDate: '2026-09-11' }), 'precede la partenza')
  pass.push('trip:create/validation')

  const day = await days.createTripDay(trip.id, {
    date: '2026-09-10',
    title: 'Giornata checkpoint',
    summary: 'Riepilogo persistente',
    journalText: 'Prima riga\nSeconda riga\nDiario persistente',
  })
  await expectError(() => days.createTripDay(trip.id, { date: '2026-09-09', title: 'Fuori viaggio' }), 'fuori')
  await expectError(() => trips.updateTrip(trip.id, { ...trip, status: 'planned', startDate: '2026-09-11', endDate: '2026-09-15' }), 'resterebbe fuori')
  pass.push('day:range/journal')

  const traveler = await travelers.createTraveler({
    firstName: 'Mario',
    lastName: 'Rossi',
    displayName: '',
    email: 'mario@example.test',
  })
  await travelers.attachTravelerToTrip(trip.id, traveler.id, 'companion')
  await travelers.attachTravelerToTrip(trip.id, traveler.id, 'owner')
  const participants = await travelers.listTripParticipants(trip.id)
  assert(participants.length === 1, 'Membership duplicata invece di essere aggiornata.')
  assert(participants[0].membership.role === 'owner', 'Ruolo viaggiatore non aggiornato.')
  pass.push('travelers:membership')

  const placeBlock = await planner.createPlannerBlock(trip.id, day.id, 'place')
  await expectError(
    () => places.savePlannerPlace(trip.id, day.id, placeBlock.id, { name: 'Coordinate parziali', latitude: 41.9 }),
    'manca la longitudine',
  )
  const savedPlace = await places.savePlannerPlace(trip.id, day.id, placeBlock.id, {
    name: 'Colosseo checkpoint',
    formattedAddress: 'Piazza del Colosseo, Roma',
    city: 'Roma',
    countryCode: 'IT',
    category: 'Monumento',
    latitude: 41.8902,
    longitude: 12.4922,
  })
  assert(savedPlace.mapsUrl?.includes('google'), 'URL Google Maps non generato.')
  pass.push('places:validation/maps')

  const expenseBlock = await planner.createPlannerBlock(trip.id, day.id, 'expense')
  await expectError(
    () => expenses.savePlannerExpense(trip.id, day.id, expenseBlock.id, {
      amount: '10,00', currency: 'EUR', paidByTravelerId: crypto.randomUUID(),
    }),
    'attualmente associato',
  )
  const expense = await expenses.savePlannerExpense(trip.id, day.id, expenseBlock.id, {
    amount: '19,99',
    currency: 'USD',
    category: 'Cibo',
    description: 'Cena checkpoint',
    occurredAt: '2026-09-10T20:30',
    paidByTravelerId: traveler.id,
    fxRate: '0,9234',
  })
  assert(expense.amountMinor === 1999, 'Importo minor-unit errato.')
  assert(expense.fx?.targetCurrency === 'EUR', 'Valuta target FX errata.')
  assert(expense.fx?.convertedAmountMinor === 1846, 'Conversione FX esatta inattesa: ' + expense.fx?.convertedAmountMinor)
  await expectError(
    () => expenses.savePlannerExpense(trip.id, day.id, expenseBlock.id, { ...expenses.expenseToDraft(expense), occurredAt: '2026-09-11T20:30' }),
    'appartiene alla giornata',
  )
  pass.push('expenses:payer/date/fx')

  const transportBlock = await planner.createPlannerBlock(trip.id, day.id, 'transport')
  let reservation = await reservations.savePlannerReservation(trip.id, day.id, transportBlock.id, {
    title: 'Treno Roma → Firenze',
    provider: 'Checkpoint Rail',
    confirmationCode: 'CHK123',
    startsAt: '2026-09-10T09:00',
    endsAt: '2026-09-11T11:30',
    timezone: 'Europe/Rome',
    placeId: savedPlace.id,
    url: 'https://example.com/booking',
    status: 'booked',
  })
  let itineraryItems = await itinerary.listDayItineraryItems(trip.id, day.id)
  const synced = itineraryItems.find((item) => item.itinerary.reservationId === reservation.id)
  assert(Boolean(synced), 'Prenotazione non sincronizzata nell’itinerario.')
  assert(synced.itinerary.startsAt === reservation.startsAt, 'Orario itinerario non sincronizzato.')
  await expectError(
    () => reservations.savePlannerReservation(trip.id, day.id, transportBlock.id, { ...reservations.reservationToDraft(reservation), endsAt: '2026-09-10T08:00' }),
    'precede partenza',
  )
  reservation = await reservations.savePlannerReservation(trip.id, day.id, transportBlock.id, {
    ...reservations.reservationToDraft(reservation),
    endsAt: '2026-09-10T11:30',
  })
  assert(!reservation.endsAt.startsWith('T'), 'Regression endsAt malformato.')
  pass.push('reservations:timing/itinerary')

  const attachmentFile = new File(['%PDF-1.4\ncheckpoint\n%%EOF'], 'biglietto.pdf', { type: 'application/pdf' })
  const attachment = await reservations.attachPlannerReservationFile(trip.id, day.id, transportBlock.id, attachmentFile)
  const attachmentRead = await reservations.readPlannerReservationAttachment(attachment.media)
  assert((await attachmentRead.text()).includes('checkpoint'), 'Allegato OPFS non rileggibile.')
  pass.push('reservation-attachment:opfs')

  const pngBytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0XkAAAAASUVORK5CYII='), c => c.charCodeAt(0))
  const mediaOne = await media.importDayMedia(trip.id, day.id, new File([pngBytes], 'foto-uno.png', { type: 'image/png' }))
  const mediaTwo = await media.importDayMedia(trip.id, day.id, new File([pngBytes], 'foto-mobile.jpg', { type: 'application/octet-stream' }))
  let gallery = await media.listDayMedia(trip.id, day.id)
  assert(gallery.length === 2, 'Allegato prenotazione mischiato nella galleria o media mancanti.')
  assert(!gallery.some((item) => item.id === attachment.media.id), 'Allegato prenotazione presente nella galleria.')
  const context = await media.listDayMediaContext(trip.id, day.id)
  const reservationKey = 'reservation:' + reservation.id
  assert(context.places.some((item) => item.id === savedPlace.id), 'Luogo della giornata non disponibile nel contesto media.')
  assert(context.itineraries.some((item) => item.key === reservationKey), 'Tappa prenotazione non disponibile nel contesto media.')
  const detailed = await media.updateDayMediaDetails(trip.id, day.id, mediaOne.id, {
    caption: 'Prima foto checkpoint',
    placeId: savedPlace.id,
    itineraryKey: reservationKey,
  })
  assert(detailed.reservationId === reservation.id, 'Associazione media→prenotazione non persistita.')
  const readPhoto = await media.readDayMedia(detailed, trip.id, day.id)
  assert(readPhoto.size === pngBytes.byteLength, 'File galleria OPFS non rileggibile.')
  await media.moveDayMedia(trip.id, day.id, mediaOne.id, 'down')
  gallery = await media.listDayMedia(trip.id, day.id)
  assert(gallery[1].id === mediaOne.id, 'Riordino media non persistito.')
  await expectError(
    () => media.updateDayMediaCaption(trip.id, day.id, mediaOne.id, 'x'.repeat(501)),
    '500 caratteri',
  )
  await expectError(
    () => media.importDayMedia(trip.id, day.id, new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' })),
    '25 MiB',
  )
  await media.removeDayMedia(trip.id, day.id, mediaTwo.id)
  gallery = await media.listDayMedia(trip.id, day.id)
  assert(gallery.length === 1 && gallery[0].id === mediaOne.id, 'Rimozione media non coerente.')
  pass.push('media:opfs/mime/context/reorder/remove')

  const textBlock = await planner.createPlannerBlock(trip.id, day.id, 'text')
  await planner.updatePlannerBlock(trip.id, day.id, textBlock.id, { type: 'text', text: 'Testo riutilizzabile' })
  const checklistBlock = await planner.createPlannerBlock(trip.id, day.id, 'checklist')
  await planner.updatePlannerBlock(trip.id, day.id, checklistBlock.id, {
    type: 'checklist',
    items: [{ id: crypto.randomUUID(), text: 'Portare acqua', checked: true }],
  })
  const personal = await templates.createPersonalDayTemplate(trip.id, day.id, {
    name: 'Modello checkpoint sicuro',
    description: 'Sanitizzazione automatica',
  })
  const serialized = JSON.stringify(personal.definition)
  assert(serialized.includes('Testo riutilizzabile'), 'Testo riutilizzabile perso dal template.')
  assert(serialized.includes('Portare acqua'), 'Checklist persa dal template.')
  assert(!serialized.includes('Colosseo checkpoint'), 'Luogo specifico copiato nel template.')
  assert(!serialized.includes('Cena checkpoint'), 'Spesa specifica copiata nel template.')
  assert(!serialized.includes('Treno Roma'), 'Prenotazione specifica copiata nel template.')
  const templateChecklist = personal.definition.blocks.find((block) => block.type === 'checklist')
  assert(templateChecklist.content.items[0].checked === false, 'Checklist template non azzerata.')

  const fromTemplate = await templates.createTripDayFromTemplate(trip.id, {
    date: '2026-09-12',
    title: 'Da modello personale',
    journalText: 'Diario nuovo, indipendente',
  }, personal.id)
  const templateBlocks = await planner.listDayPlannerBlocks(trip.id, fromTemplate.id)
  const instanceChecklist = templateBlocks.find((block) => block.type === 'checklist')
  assert(instanceChecklist.content.items[0].checked === false, 'Checklist istanziata già spuntata.')
  assert(!String(instanceChecklist.content.items[0].id).startsWith('template-item-'), 'ID checklist non rigenerato.')
  const renamed = await personalTemplates.renamePersonalDayTemplate(personal.id, 'Modello checkpoint rinominato')
  assert(renamed.name === 'Modello checkpoint rinominato', 'Rinomina template fallita.')
  const builtin = (await templates.listDayTemplates()).find((item) => templates.isBuiltInDayTemplate(item))
  await expectError(() => personalTemplates.renamePersonalDayTemplate(builtin.id, 'Non consentito'), 'predefinito')
  await personalTemplates.deletePersonalDayTemplate(personal.id)
  assert(!(await templates.listDayTemplates()).some((item) => item.id === personal.id), 'Template eliminato ancora attivo.')
  assert((await days.getTripDay(trip.id, fromTemplate.id)).templateId === personal.id, 'Eliminazione template ha alterato giornata esistente.')
  assert((await planner.listDayPlannerBlocks(trip.id, fromTemplate.id)).length > 0, 'Eliminazione template ha alterato blocchi esistenti.')
  pass.push('templates:builtin/personal/sanitize/manage')

  await trips.archiveTrip(trip.id)
  await expectError(() => planner.createPlannerBlock(trip.id, day.id, 'text'), 'Ripristina il viaggio')
  await expectError(() => media.importDayMedia(trip.id, day.id, new File([pngBytes], 'archived.png', { type: 'image/png' })), 'Ripristina il viaggio')
  await trips.restoreArchivedTrip(trip.id)
  pass.push('archive:read-only/restore')

  return {
    pass,
    ids: { tripId: trip.id, dayId: day.id, mediaId: mediaOne.id, reservationId: reservation.id },
  }
})()`

let dev
let preview
let chrome
let cdp
try {
  log('Checkpoint browser: avvio Vite dev server')
  dev = spawnLogged('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173'], 'vite-dev')
  await waitForHttp(ROOT_URL)

  const chromePath = process.env.CHROME_BIN || commandPath(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'])
  if (!chromePath) throw new Error('Chrome/Chromium non trovato nel runner.')
  log(`Checkpoint browser: uso ${chromePath}`)
  chrome = spawnLogged(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=/tmp/duranti-checkpoint-chrome',
    'about:blank',
  ], 'chrome')

  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
  const pageTarget = targets.find((target) => target.type === 'page')
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error('Target pagina Chrome non disponibile.')

  cdp = new CdpClient(pageTarget.webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.navigate(ROOT_URL)
  await waitForEval(cdp, 'document.querySelector("#root") && document.body.textContent.includes("Il nostro libro dei viaggi")')

  log('Checkpoint browser: eseguo servizi reali su IndexedDB + OPFS')
  const scenario = await cdp.evaluate(serviceScenario)
  for (const item of scenario.pass) log(`PASS ${item}`)

  log('Checkpoint browser: verifico persistenza dopo reload e rendering UI')
  await cdp.send('Page.reload', { ignoreCache: false })
  await waitForEval(cdp, 'document.readyState === "complete"')
  const persisted = await cdp.evaluate(`(async () => {
    const trips = await import('/Duranti-Travel-Agency/src/features/trips/trip-service.ts')
    const days = await import('/Duranti-Travel-Agency/src/features/days/day-service.ts')
    const media = await import('/Duranti-Travel-Agency/src/features/media/day-media-service.ts')
    const trip = await trips.getTrip('${scenario.ids.tripId}')
    const day = await days.getTripDay('${scenario.ids.tripId}', '${scenario.ids.dayId}')
    const gallery = await media.listDayMedia('${scenario.ids.tripId}', '${scenario.ids.dayId}')
    return { trip: trip?.title, journal: day?.journalText, mediaCount: gallery.length }
  })()`)
  if (persisted.trip !== 'Checkpoint automatico' || !persisted.journal?.includes('Diario persistente') || persisted.mediaCount !== 1) {
    throw new Error('Persistenza IndexedDB/OPFS non coerente dopo reload: ' + JSON.stringify(persisted))
  }
  log('PASS persistence:reload/indexeddb/opfs')

  await cdp.evaluate(`location.hash = '#/trips/${scenario.ids.tripId}/days/${scenario.ids.dayId}'`)
  await waitForEval(cdp, 'document.body.textContent.includes("Giornata checkpoint") && document.body.textContent.includes("Diario persistente")')
  const desktopOverflow = await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
  if (!desktopOverflow) throw new Error('Overflow orizzontale rilevato nel planner desktop.')
  log('PASS ui:planner-render')

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await sleep(300)
  const mobileOverflow = await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')
  if (!mobileOverflow) throw new Error('Overflow orizzontale rilevato a 390px.')
  log('PASS responsive:390px')
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  log('Checkpoint browser: verifico PWA e reload offline sul build di produzione')
  await stop(dev)
  dev = undefined
  preview = spawnLogged('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], 'vite-preview')
  await waitForHttp(ROOT_URL)
  await cdp.navigate(ROOT_URL)
  await waitForEval(cdp, 'document.body.textContent.includes("Il nostro libro dei viaggi")')
  await cdp.evaluate(`(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker non supportato')
    await navigator.serviceWorker.ready
    return true
  })()`)
  await cdp.send('Page.reload', { ignoreCache: false })
  await waitForEval(cdp, 'navigator.serviceWorker.controller !== null && document.body.textContent.includes("Il nostro libro dei viaggi")')
  await stop(preview)
  preview = undefined
  await cdp.send('Page.reload', { ignoreCache: false })
  await waitForEval(cdp, 'document.body.textContent.includes("Il nostro libro dei viaggi")', 15_000)
  log('PASS pwa:service-worker/offline-reload')

  log(`Checkpoint browser: PASS (${output.filter((line) => line.startsWith('PASS ')).length} gruppi)`)
} catch (error) {
  console.error('\nCheckpoint browser: FAIL')
  console.error(error?.stack ?? error)
  process.exitCode = 1
} finally {
  cdp?.close()
  await stop(preview)
  await stop(dev)
  await stop(chrome)
}
