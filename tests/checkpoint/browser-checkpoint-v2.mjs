import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const ROOT_URL = 'http://127.0.0.1:4173/Duranti-Travel-Agency/'
const CDP_PORT = 9223
const PASS = []

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function pass(name) {
  PASS.push(name)
  console.log(`PASS ${name}`)
}

async function withTimeout(promise, ms, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error?.message ?? String(error)
    }
    await sleep(250)
  }
  throw new Error(`Nessuna risposta da ${url}: ${last ?? 'timeout'}`)
}

function findCommand(names) {
  for (const name of names) {
    const result = spawnSync('which', [name], { encoding: 'utf8' })
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim()
  }
  return undefined
}

function start(command, args, label) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: process.platform !== 'win32',
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`))
  return child
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch {
    try { child.kill('SIGTERM') } catch { /* already gone */ }
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(2000),
  ])
  if (child.exitCode === null) {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch { /* already gone */ }
  }
}

class Cdp {
  constructor(url) {
    this.url = url
    this.id = 1
    this.pending = new Map()
  }

  async connect() {
    this.ws = new WebSocket(this.url)
    await withTimeout(new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    }), 10_000, 'connessione CDP')

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`))
      else pending.resolve(message.result)
    })
    this.ws.addEventListener('close', () => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Connessione CDP chiusa'))
      }
      this.pending.clear()
    })
  }

  send(method, params = {}, timeoutMs = 20_000) {
    const id = this.id++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout CDP: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression, timeoutMs = 30_000) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }, timeoutMs)
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Errore pagina')
    }
    return response.result?.value
  }

  async navigate(url) {
    await this.send('Page.navigate', { url })
    await waitForCondition(this, 'document.readyState === "complete"', 20_000)
  }

  close() { this.ws?.close() }
}

async function waitForCondition(cdp, expression, timeoutMs = 15_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      if (await cdp.evaluate(expression, 5000)) return
    } catch { /* navigation can replace context */ }
    await sleep(150)
  }
  throw new Error(`Condizione non raggiunta: ${expression}`)
}

const SCENARIO = String.raw`(async () => {
  const ok = (condition, message) => { if (!condition) throw new Error(message) }
  const fails = async (fn, text) => {
    try { await fn() }
    catch (error) {
      const message = String(error?.message ?? error)
      if (text && !message.includes(text)) throw new Error('Errore inatteso: ' + message + ' | atteso: ' + text)
      return
    }
    throw new Error('Operazione doveva fallire: ' + text)
  }
  const passed = []
  const root = '/Duranti-Travel-Agency/src/features/'
  const [trips, days, travelers, planner, places, expenses, reservations, itinerary, media, templates, personal] = await Promise.all([
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
    title: 'Checkpoint automatico', status: 'planned', startDate: '2026-09-10', endDate: '2026-09-15',
    currency: 'EUR', budgetMinor: 150000, summary: 'Dati del checkpoint automatico.',
  })
  ok(trip.budgetMinor === 150000, 'Budget non salvato')
  await fails(() => trips.createTrip({ title: 'Date errate', status: 'planned', startDate: '2026-09-12', endDate: '2026-09-11' }), 'precede la partenza')
  passed.push('trip:create/date-validation')

  const day = await days.createTripDay(trip.id, {
    date: '2026-09-10', title: 'Giornata checkpoint', summary: 'Riepilogo persistente',
    journalText: 'Prima riga\nSeconda riga\nDiario persistente',
  })
  await fails(() => days.createTripDay(trip.id, { date: '2026-09-09', title: 'Fuori viaggio' }), 'non può precedere la partenza')
  await fails(() => trips.updateTrip(trip.id, { title: trip.title, status: 'planned', startDate: '2026-09-11', endDate: '2026-09-15', currency: 'EUR', budgetMinor: 150000 }), 'resterebbe fuori')
  ok((await days.getTripDay(trip.id, day.id))?.journalText.includes('Seconda riga'), 'Diario non persistito')
  passed.push('day:range/journal')

  const traveler = await travelers.createTraveler({ firstName: 'Mario', lastName: 'Rossi', displayName: '', email: 'mario@example.test' })
  await travelers.attachTravelerToTrip(trip.id, traveler.id, 'companion')
  await travelers.attachTravelerToTrip(trip.id, traveler.id, 'owner')
  const participants = await travelers.listTripParticipants(trip.id)
  ok(participants.length === 1 && participants[0].membership.role === 'owner', 'Membership duplicata o ruolo errato')
  passed.push('travelers:membership')

  const placeBlock = await planner.createPlannerBlock(trip.id, day.id, 'place')
  await fails(() => places.savePlannerPlace(trip.id, day.id, placeBlock.id, { name: 'Parziale', latitude: 41.9 }), 'manca la longitudine')
  const place = await places.savePlannerPlace(trip.id, day.id, placeBlock.id, {
    name: 'Colosseo checkpoint', formattedAddress: 'Piazza del Colosseo, Roma', city: 'Roma', countryCode: 'IT',
    category: 'Monumento', latitude: 41.8902, longitude: 12.4922,
  })
  ok(place.mapsUrl.includes('google.com/maps'), 'Link Google Maps non generato')
  passed.push('places:coordinates/maps')

  const expenseBlock = await planner.createPlannerBlock(trip.id, day.id, 'expense')
  await fails(() => expenses.savePlannerExpense(trip.id, day.id, expenseBlock.id, { amount: '10,00', currency: 'EUR', paidByTravelerId: crypto.randomUUID() }), 'attualmente associato')
  const expense = await expenses.savePlannerExpense(trip.id, day.id, expenseBlock.id, {
    amount: '19,99', currency: 'USD', category: 'Cibo', description: 'Cena checkpoint',
    occurredAt: '2026-09-10T20:30', paidByTravelerId: traveler.id, fxRate: '0,9234',
  })
  ok(expense.amountMinor === 1999, 'Minor units errate')
  ok(expense.fx?.targetCurrency === 'EUR', 'Target FX errato')
  ok(expense.fx?.convertedAmountMinor === 1846, 'Conversione FX errata: ' + expense.fx?.convertedAmountMinor)
  await fails(() => expenses.savePlannerExpense(trip.id, day.id, expenseBlock.id, { ...expenses.expenseToDraft(expense), occurredAt: '2026-09-11T20:30' }), 'appartiene alla giornata')
  passed.push('expenses:payer/day/fx')

  const transportBlock = await planner.createPlannerBlock(trip.id, day.id, 'transport')
  let reservation = await reservations.savePlannerReservation(trip.id, day.id, transportBlock.id, {
    title: 'Treno Roma → Firenze', provider: 'Checkpoint Rail', confirmationCode: 'CHK123',
    startsAt: '2026-09-10T09:00', endsAt: '2026-09-11T11:30', timezone: 'Europe/Rome',
    placeId: place.id, url: 'https://example.com/booking', status: 'booked',
  })
  let items = await itinerary.listDayItineraryItems(trip.id, day.id)
  const synced = items.find((item) => item.itinerary.reservationId === reservation.id)
  ok(Boolean(synced), 'Prenotazione non sincronizzata in itinerario')
  ok(synced.itinerary.startsAt === reservation.startsAt, 'Orario tappa non sincronizzato')
  await fails(() => reservations.savePlannerReservation(trip.id, day.id, transportBlock.id, { ...reservations.reservationToDraft(reservation), endsAt: '2026-09-10T08:00' }), 'precede partenza')
  reservation = await reservations.savePlannerReservation(trip.id, day.id, transportBlock.id, { ...reservations.reservationToDraft(reservation), endsAt: '2026-09-10T11:30' })
  ok(!reservation.endsAt.startsWith('T'), 'endsAt malformato')
  passed.push('reservations:timing/itinerary')

  const attachmentResult = await reservations.attachPlannerReservationFile(
    trip.id, day.id, transportBlock.id,
    new File(['%PDF-1.4\ncheckpoint\n%%EOF'], 'biglietto.pdf', { type: 'application/pdf' }),
  )
  const attachmentRead = await reservations.readPlannerReservationAttachment(attachmentResult.media)
  ok((await attachmentRead.text()).includes('checkpoint'), 'Allegato OPFS non rileggibile')
  passed.push('attachments:opfs')

  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0XkAAAAASUVORK5CYII='), (c) => c.charCodeAt(0))
  const photo1 = await media.importDayMedia(trip.id, day.id, new File([png], 'foto-uno.png', { type: 'image/png' }))
  const photo2 = await media.importDayMedia(trip.id, day.id, new File([png], 'foto-mobile.jpg', { type: 'application/octet-stream' }))
  let gallery = await media.listDayMedia(trip.id, day.id)
  ok(gallery.length === 2, 'Conteggio galleria errato')
  ok(!gallery.some((item) => item.id === attachmentResult.media.id), 'Allegato prenotazione mischiato nella galleria')
  const context = await media.listDayMediaContext(trip.id, day.id)
  const reservationKey = 'reservation:' + reservation.id
  ok(context.places.some((item) => item.id === place.id), 'Luogo assente dal contesto media')
  ok(context.itineraries.some((item) => item.key === reservationKey), 'Tappa assente dal contesto media')
  const detailed = await media.updateDayMediaDetails(trip.id, day.id, photo1.id, { caption: 'Prima foto checkpoint', placeId: place.id, itineraryKey: reservationKey })
  ok(detailed.reservationId === reservation.id, 'Associazione media→tappa non salvata')
  ok((await media.readDayMedia(detailed, trip.id, day.id)).size === png.byteLength, 'Foto OPFS non rileggibile')
  await media.moveDayMedia(trip.id, day.id, photo1.id, 'down')
  gallery = await media.listDayMedia(trip.id, day.id)
  ok(gallery[1].id === photo1.id, 'Riordino media non persistito')
  await fails(() => media.updateDayMediaCaption(trip.id, day.id, photo1.id, 'x'.repeat(501)), '500 caratteri')
  await fails(() => media.importDayMedia(trip.id, day.id, new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'grande.jpg', { type: 'image/jpeg' })), '25 MiB')
  await media.removeDayMedia(trip.id, day.id, photo2.id)
  gallery = await media.listDayMedia(trip.id, day.id)
  ok(gallery.length === 1 && gallery[0].id === photo1.id, 'Rimozione media errata')
  passed.push('media:opfs/mime/context/order/remove')

  const textBlock = await planner.createPlannerBlock(trip.id, day.id, 'text')
  await planner.updatePlannerBlock(trip.id, day.id, textBlock.id, { type: 'text', text: 'Testo riutilizzabile' })
  const checklistBlock = await planner.createPlannerBlock(trip.id, day.id, 'checklist')
  await planner.updatePlannerBlock(trip.id, day.id, checklistBlock.id, { type: 'checklist', items: [{ id: crypto.randomUUID(), text: 'Portare acqua', checked: true }] })
  const template = await templates.createPersonalDayTemplate(trip.id, day.id, { name: 'Modello checkpoint sicuro', description: 'Sanitizzazione automatica' })
  const serialized = JSON.stringify(template.definition)
  ok(serialized.includes('Testo riutilizzabile') && serialized.includes('Portare acqua'), 'Contenuto riutilizzabile perso')
  ok(!serialized.includes('Colosseo checkpoint'), 'Luogo specifico copiato nel template')
  ok(!serialized.includes('Cena checkpoint'), 'Spesa specifica copiata nel template')
  ok(!serialized.includes('Treno Roma'), 'Prenotazione specifica copiata nel template')
  const templateChecklist = template.definition.blocks.find((block) => block.type === 'checklist')
  ok(templateChecklist.content.items[0].checked === false, 'Checklist template non azzerata')

  const instance = await templates.createTripDayFromTemplate(trip.id, { date: '2026-09-12', title: 'Da modello personale', journalText: 'Diario indipendente' }, template.id)
  const instanceBlocks = await planner.listDayPlannerBlocks(trip.id, instance.id)
  const instanceChecklist = instanceBlocks.find((block) => block.type === 'checklist')
  ok(instanceChecklist.content.items[0].checked === false, 'Checklist istanza già spuntata')
  ok(!String(instanceChecklist.content.items[0].id).startsWith('template-item-'), 'ID checklist non rigenerato')
  const renamed = await personal.renamePersonalDayTemplate(template.id, 'Modello checkpoint rinominato')
  ok(renamed.name === 'Modello checkpoint rinominato', 'Rinomina template fallita')
  const builtin = (await templates.listDayTemplates()).find((item) => templates.isBuiltInDayTemplate(item))
  await fails(() => personal.renamePersonalDayTemplate(builtin.id, 'Non consentito'), 'predefinito')
  await personal.deletePersonalDayTemplate(template.id)
  ok(!(await templates.listDayTemplates()).some((item) => item.id === template.id), 'Template eliminato ancora attivo')
  ok((await days.getTripDay(trip.id, instance.id)).templateId === template.id, 'Giornata esistente alterata dopo eliminazione template')
  ok((await planner.listDayPlannerBlocks(trip.id, instance.id)).length > 0, 'Blocchi esistenti alterati dopo eliminazione template')
  passed.push('templates:sanitize/instantiate/manage')

  await trips.archiveTrip(trip.id)
  await fails(() => planner.createPlannerBlock(trip.id, day.id, 'text'), 'Ripristina il viaggio')
  await fails(() => media.importDayMedia(trip.id, day.id, new File([png], 'archived.png', { type: 'image/png' })), 'Ripristina il viaggio')
  await trips.restoreArchivedTrip(trip.id)
  passed.push('archive:read-only/restore')

  return { passed, ids: { tripId: trip.id, dayId: day.id } }
})()`

let dev
let preview
let chrome
let cdp
try {
  dev = start('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4173'], 'dev')
  await waitForHttp(ROOT_URL)

  const chromePath = process.env.CHROME_BIN || findCommand(['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'])
  if (!chromePath) throw new Error('Chrome/Chromium non trovato nel runner GitHub.')
  console.log(`Browser checkpoint: ${chromePath}`)

  chrome = start(chromePath, [
    '--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=/tmp/duranti-checkpoint-${process.pid}`, 'about:blank',
  ], 'chrome')
  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`)
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json()
  const target = targets.find((item) => item.type === 'page')
  if (!target?.webSocketDebuggerUrl) throw new Error('Target CDP pagina non trovato.')

  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.navigate(ROOT_URL)
  await waitForCondition(cdp, 'document.querySelector("#root") && document.body.textContent.includes("Il nostro libro dei viaggi")')

  const scenario = await cdp.evaluate(SCENARIO, 120_000)
  for (const name of scenario.passed) pass(name)

  await cdp.send('Page.reload', { ignoreCache: false })
  await waitForCondition(cdp, 'document.readyState === "complete"')
  const persistence = await cdp.evaluate(`(async () => {
    const trips = await import('/Duranti-Travel-Agency/src/features/trips/trip-service.ts')
    const days = await import('/Duranti-Travel-Agency/src/features/days/day-service.ts')
    const media = await import('/Duranti-Travel-Agency/src/features/media/day-media-service.ts')
    return {
      trip: (await trips.getTrip('${scenario.ids.tripId}'))?.title,
      journal: (await days.getTripDay('${scenario.ids.tripId}', '${scenario.ids.dayId}'))?.journalText,
      mediaCount: (await media.listDayMedia('${scenario.ids.tripId}', '${scenario.ids.dayId}')).length,
    }
  })()`)
  if (persistence.trip !== 'Checkpoint automatico' || !persistence.journal?.includes('Diario persistente') || persistence.mediaCount !== 1) {
    throw new Error('Persistenza dopo reload incoerente: ' + JSON.stringify(persistence))
  }
  pass('persistence:indexeddb/opfs/reload')

  await cdp.evaluate(`location.hash = '#/trips/${scenario.ids.tripId}/days/${scenario.ids.dayId}'`)
  await waitForCondition(cdp, 'document.body.textContent.includes("Giornata checkpoint") && document.body.textContent.includes("Diario persistente")')
  if (!(await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))) throw new Error('Overflow desktop nel planner')
  pass('ui:planner-render')

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await sleep(300)
  if (!(await cdp.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'))) throw new Error('Overflow orizzontale a 390px')
  pass('responsive:390px')
  await cdp.send('Emulation.clearDeviceMetricsOverride')

  await stop(dev); dev = undefined
  preview = start('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], 'preview')
  await waitForHttp(ROOT_URL)
  await cdp.navigate(ROOT_URL)
  await waitForCondition(cdp, 'document.body.textContent.includes("Il nostro libro dei viaggi")')
  await cdp.evaluate(`(async () => { if (!('serviceWorker' in navigator)) throw new Error('Service Worker assente'); await navigator.serviceWorker.ready; return true })()`)
  await cdp.send('Page.reload', { ignoreCache: false })
  await waitForCondition(cdp, 'navigator.serviceWorker.controller !== null && document.body.textContent.includes("Il nostro libro dei viaggi")', 20_000)
  await stop(preview); preview = undefined
  await cdp.send('Page.reload', { ignoreCache: false })
  await waitForCondition(cdp, 'document.body.textContent.includes("Il nostro libro dei viaggi")', 20_000)
  pass('pwa:service-worker/offline-reload')

  console.log(`\nBrowser checkpoint PASS: ${PASS.length} gruppi`)
} catch (error) {
  console.error('\nBrowser checkpoint FAIL')
  console.error(error?.stack ?? error)
  process.exitCode = 1
} finally {
  cdp?.close()
  await stop(preview)
  await stop(dev)
  await stop(chrome)
}
