import { expect, test, type Page } from '@playwright/test'

const APP = './'

async function allFromStore<T = Record<string, unknown>>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('duranti')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
    try {
      return await new Promise<T[]>((resolve, reject) => {
        const tx = db.transaction(name, 'readonly')
        const request = tx.objectStore(name).getAll()
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result as T[])
      })
    } finally {
      db.close()
    }
  }, storeName)
}

async function createTrip(page: Page, title = 'Checkpoint Roma'): Promise<void> {
  await page.goto(APP)
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel('Titolo *').fill(title)
  await page.getByLabel('Partenza').fill('2026-09-10')
  await page.getByLabel('Ritorno').fill('2026-09-15')
  await page.getByText('Altri dettagli', { exact: true }).click()
  await page.getByLabel('Sottotitolo').fill('Regression checkpoint')
  await page.getByLabel('Valuta').fill('EUR')
  await page.getByLabel('Budget del viaggio').fill('1500,00')
  await page.getByLabel('Appunti').fill('Viaggio usato dai test automatici.')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function createBlankDay(page: Page, title = 'Centro storico', journal = ''): Promise<void> {
  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await page.getByLabel('Data della giornata *').fill('2026-09-10')
  await page.getByLabel('Titolo della giornata').fill(title)
  await page.getByLabel('Riepilogo').fill('Passeggiata e programma della giornata.')
  if (journal) {
    await page.getByText('Diario della giornata', { exact: true }).click()
    await page.getByLabel('Il racconto').fill(journal)
  }
  await page.getByRole('button', { name: 'Crea giornata' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function openDay(page: Page, title: string): Promise<void> {
  await page.getByRole('link', { name: `Apri ${title}` }).click()
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
}

async function openQuickAdd(page: Page): Promise<void> {
  const quickAdd = page.locator('.planner-quick-add')
  if (!(await quickAdd.getAttribute('open'))) {
    await quickAdd.locator('summary').click()
  }
}

async function openQuickAddMore(page: Page): Promise<void> {
  await openQuickAdd(page)
  const more = page.locator('.planner-quick-add-more')
  if (!(await more.getAttribute('open'))) {
    await more.locator('summary').click()
  }
}

test('viaggio, giornata, diario, vincoli date e conferme interne persistono', async ({ page }) => {
  const nativeDialogs: string[] = []
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message())
    await dialog.dismiss()
  })

  await createTrip(page)

  const [trip] = await allFromStore<any>(page, 'trips')
  expect(trip.title).toBe('Checkpoint Roma')
  expect(trip.currency).toBe('EUR')
  expect(trip.budgetMinor).toBe(150000)

  await createBlankDay(page, 'Centro storico', 'Prima riga\nSeconda riga\nRicordo persistente.')
  await expect(page.getByText('Diario scritto')).toBeVisible()

  const [day] = await allFromStore<any>(page, 'days')
  expect(day.date).toBe('2026-09-10')
  expect(day.journalText).toContain('Seconda riga')

  await page.reload()
  await expect(page.getByText('Diario scritto')).toBeVisible()

  await page.getByRole('link', { name: 'Modifica' }).first().click()
  await page.getByLabel('Partenza').fill('2026-09-11')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByRole('alert')).toBeVisible()

  await page.getByLabel('Partenza').fill('2026-09-10')
  await page.getByRole('button', { name: 'Salva modifiche' }).click()
  await expect(page.getByRole('heading', { name: 'Checkpoint Roma' })).toBeVisible()

  await page.getByRole('button', { name: 'Archivia' }).click()
  const archiveConfirm = page.getByRole('alertdialog', { name: 'Archivia viaggio' })
  await expect(archiveConfirm).toBeVisible()
  await archiveConfirm.getByRole('button', { name: 'Annulla' }).click()
  await expect(archiveConfirm).toBeHidden()
  expect(nativeDialogs).toEqual([])
})

test('viaggiatori, membership, spese e cambio manuale restano coerenti', async ({ page }) => {
  const nativeDialogs: string[] = []
  page.on('dialog', async (dialog) => {
    nativeDialogs.push(dialog.message())
    await dialog.dismiss()
  })

  await page.goto(APP)
  await page.getByRole('link', { name: 'Viaggiatori' }).click()
  await page.getByRole('link', { name: 'Nuovo profilo' }).click()
  await page.getByLabel('Nome *').fill('Mario')
  await page.getByLabel('Cognome *').fill('Rossi')
  await page.getByLabel('Email').fill('mario@example.test')
  await page.getByRole('button', { name: 'Crea profilo' }).click()
  await expect(page.getByText('Mario Rossi').first()).toBeVisible()
  await page.getByRole('link', { name: 'Torna al libro' }).click()

  await createTrip(page, 'Checkpoint Spese')
  await page.getByText('Dettagli e organizzazione', { exact: true }).click()
  const travelersPanel = page.locator('.trip-travelers-panel')
  await travelersPanel.getByLabel('Profilo').selectOption({ label: 'Mario Rossi' })
  await travelersPanel.getByLabel('Ruolo').selectOption('owner')
  await travelersPanel.getByRole('button', { name: 'Associa al viaggio' }).click()
  await expect(travelersPanel.getByText('Mario Rossi').first()).toBeVisible()

  await createBlankDay(page, 'Giornata spese')
  await openDay(page, 'Giornata spese')
  await openQuickAddMore(page)
  await page.locator('.planner-quick-add-secondary').getByRole('button', { name: /^Spesa/ }).click()

  const expense = page.locator('.expense-block').last()
  await expect(expense).toBeVisible()
  await expense.getByLabel('Importo *').fill('19,99')
  await expense.getByLabel('Valuta *').fill('USD')
  await expense.getByLabel('Descrizione').fill('Cena test cambio')
  await expense.getByText('Altri dettagli', { exact: true }).click()
  await expense.getByLabel('Categoria').fill('Cibo')
  await expense.getByLabel('Pagato da').selectOption({ label: 'Mario Rossi' })
  await expense.getByLabel('Ora della spesa').fill('20:30')
  await expense.getByLabel(/1 USD =/).fill('0,9234')
  await expense.getByRole('button', { name: 'Crea spesa' }).click()
  await expect(expense.getByText(/19,99/)).toBeVisible()

  const [savedExpense] = await allFromStore<any>(page, 'expenses')
  expect(savedExpense.amountMinor).toBe(1999)
  expect(savedExpense.currency).toBe('USD')
  expect(savedExpense.occurredAt).toBe('2026-09-10T20:30')
  expect(savedExpense.fx?.targetCurrency).toBe('EUR')
  expect(savedExpense.fx?.convertedAmountMinor).toBe(1846)

  await page.getByRole('link', { name: 'Torna al viaggio' }).click()
  await page.getByText('Dettagli e organizzazione', { exact: true }).click()
  await expect(page.getByText(/Cena test cambio|19,99|18,46/).first()).toBeVisible()

  const row = page.locator('.trip-participant-row').filter({ hasText: 'Mario Rossi' })
  await row.getByRole('button', { name: 'Rimuovi' }).click()
  const confirm = row.getByRole('alertdialog', { name: 'Rimuovere viaggiatore dal viaggio?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Annulla' }).click()
  expect(nativeDialogs).toEqual([])
})

test('prenotazioni, itinerario, allegati, OPFS e galleria media sono separati e persistenti', async ({ page }) => {
  await createTrip(page, 'Checkpoint Media')
  await createBlankDay(page, 'Media e trasporti')
  await openDay(page, 'Media e trasporti')

  await openQuickAdd(page)
  await page.locator('.planner-quick-add-primary').getByRole('button', { name: /^Spostamento/ }).click()
  const transport = page.locator('.reservation-block-transport').last()
  await expect(transport).toBeVisible()
  await transport.getByLabel('Titolo *').fill('Treno Roma → Firenze')
  await transport.getByLabel('Ora partenza').fill('09:00')
  await transport.getByLabel('Data arrivo').fill('2026-09-11')
  await transport.getByLabel('Ora arrivo').fill('11:30')
  await transport.getByLabel('Stato').selectOption('booked')
  await transport.getByRole('button', { name: 'Crea prenotazione' }).click()

  let reservations = await allFromStore<any>(page, 'reservations')
  let itineraries = await allFromStore<any>(page, 'itineraries')
  expect(reservations).toHaveLength(1)
  expect(itineraries).toHaveLength(1)
  expect(reservations[0].startsAt).toBe('2026-09-10T09:00')
  expect(reservations[0].endsAt).toBe('2026-09-11T11:30')

  await transport.getByLabel('Data arrivo').fill('')
  await transport.getByRole('button', { name: 'Salva prenotazione' }).click()
  reservations = await allFromStore<any>(page, 'reservations')
  expect(reservations[0].endsAt).not.toMatch(/^T/)
  expect(reservations[0].endsAt).toBe('2026-09-10T11:30')

  await transport.getByText('Allegato', { exact: true }).click()
  await transport.locator('input[type="file"]').setInputFiles({
    name: 'biglietto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\ncheckpoint\n%%EOF'),
  })
  await expect(transport.getByText('biglietto.pdf')).toBeVisible()

  const gallery = page.locator('.day-media')
  await expect(gallery.getByText('biglietto.pdf')).toHaveCount(0)

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0XkAAAAASUVORK5CYII=', 'base64')
  await gallery.locator('input[type="file"]').setInputFiles([
    { name: 'foto-uno.png', mimeType: 'image/png', buffer: png },
    { name: 'foto-due.png', mimeType: 'image/png', buffer: png },
  ])
  await expect(gallery.locator('.day-media-card')).toHaveCount(2)

  const firstCard = gallery.locator('.day-media-card').filter({ hasText: 'foto-uno.png' })
  await firstCard.getByLabel('Didascalia').fill('Prima foto del checkpoint')
  await firstCard.getByRole('button', { name: 'Salva dettagli' }).click()

  const media = await allFromStore<any>(page, 'media')
  const reservationAttachment = media.find((item) => item.originalName === 'biglietto.pdf')
  const galleryItems = media.filter((item) => !item.blockId && !item.deletedAt)
  expect(reservationAttachment?.blockId).toBeTruthy()
  expect(galleryItems).toHaveLength(2)
  expect(galleryItems.find((item) => item.originalName === 'foto-uno.png')?.caption).toBe('Prima foto del checkpoint')

  await firstCard.getByRole('button', { name: 'Apri' }).click()
  const lightbox = page.getByRole('dialog', { name: 'Ricordo a schermo intero' })
  await expect(lightbox).toBeVisible()
  await expect(lightbox.getByText('1 di 2')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(lightbox.getByText('2 di 2')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lightbox).toBeHidden()

  await firstCard.getByRole('button', { name: 'Sposta ricordo giù' }).click()
  await page.reload()
  await expect(page.getByText('Prima foto del checkpoint')).toBeVisible()
  await expect(page.getByText('foto-due.png')).toBeVisible()
  await expect(page.locator('.day-media').getByText('biglietto.pdf')).toHaveCount(0)

  const tooLarge = Buffer.alloc(25 * 1024 * 1024 + 1)
  await page.locator('.day-media input[type="file"]').setInputFiles({
    name: 'troppo-grande.jpg',
    mimeType: 'image/jpeg',
    buffer: tooLarge,
  })
  await expect(page.locator('.day-media').getByRole('alert')).toContainText('25 MiB')
})

test('template predefiniti e personali sanitizzano dati, rinominano ed eliminano senza rompere le giornate', async ({ page }) => {
  await createTrip(page, 'Checkpoint Template')
  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await page.getByLabel('Titolo della giornata').fill('Sorgente modello')
  await page.getByText('Diario della giornata', { exact: true }).click()
  await page.getByLabel('Il racconto').fill('QUESTO DIARIO NON DEVE ESSERE COPIATO')
  await page.getByRole('button', { name: /Visita città/ }).click()
  await page.getByRole('button', { name: 'Crea e apri giornata' }).click()
  await expect(page.getByRole('heading', { name: 'Sorgente modello' })).toBeVisible()

  const days = await allFromStore<any>(page, 'days')
  expect(days[0].templateId).toBe('builtin-day-city-v1')
  let blocks = await allFromStore<any>(page, 'blocks')
  const activeBlocks = blocks.filter((block) => !block.deletedAt)
  expect(activeBlocks.map((block) => block.type)).toEqual([
    'heading', 'activity', 'place', 'heading', 'restaurant', 'heading', 'activity', 'place', 'heading', 'text',
  ])

  const textBlock = page.locator('.planner-block-text').last()
  await textBlock.locator('textarea').fill('Testo riutilizzabile')
  await textBlock.getByRole('button', { name: 'Salva blocco' }).click()

  await openQuickAddMore(page)
  await page.locator('.planner-quick-add-secondary').getByRole('button', { name: /^Checklist/ }).click()
  const checklist = page.locator('.planner-block-checklist').last()
  await checklist.getByRole('button', { name: '+ Aggiungi voce' }).click()
  await checklist.getByPlaceholder('Voce checklist').fill('Portare acqua')
  await checklist.getByRole('checkbox').check()
  await checklist.getByRole('button', { name: 'Salva blocco' }).click()

  await openQuickAddMore(page)
  await page.locator('.planner-quick-add-secondary').getByRole('button', { name: /^Luogo/ }).click()
  const place = page.locator('.planner-place-block').last()
  await place.getByLabel('Nome *').fill('Colosseo segreto')
  await place.getByLabel('Indirizzo').fill('Via checkpoint 1')
  await place.getByRole('button', { name: 'Crea luogo' }).click()

  await openQuickAddMore(page)
  await page.locator('.planner-quick-add-secondary').getByRole('button', { name: /^Spesa/ }).click()
  const expense = page.locator('.expense-block').last()
  await expense.getByLabel('Importo *').fill('50,00')
  await expense.getByLabel('Valuta *').fill('EUR')
  await expense.getByLabel('Descrizione').fill('SPESA SEGRETA')
  await expense.getByRole('button', { name: 'Crea spesa' }).click()

  await page.getByText('Salva come modello', { exact: true }).click()
  await page.getByLabel('Nome del modello *').fill('Modello checkpoint personale')
  await page.getByLabel('Descrizione').last().fill('Struttura sanitizzata')
  await page.getByRole('button', { name: 'Salva modello' }).click()
  await expect(page.getByRole('status')).toContainText('Modello “Modello checkpoint personale” salvato')

  const templates = await allFromStore<any>(page, 'templates')
  const personal = templates.find((template) => template.name === 'Modello checkpoint personale' && !template.deletedAt)
  expect(personal).toBeTruthy()
  const serialized = JSON.stringify(personal.definition)
  expect(serialized).toContain('Testo riutilizzabile')
  expect(serialized).toContain('Portare acqua')
  expect(serialized).not.toContain('Colosseo segreto')
  expect(serialized).not.toContain('Via checkpoint 1')
  expect(serialized).not.toContain('SPESA SEGRETA')
  expect(serialized).not.toContain('QUESTO DIARIO NON DEVE ESSERE COPIATO')
  const checklistDefinition = personal.definition.blocks.find((block: any) => block.type === 'checklist')
  expect(checklistDefinition.content.items[0].checked).toBe(false)

  await page.getByRole('link', { name: 'Torna al viaggio' }).click()
  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await expect(page.getByRole('button', { name: /Modello checkpoint personale/ })).toBeVisible()

  await page.getByText('Gestisci modelli personali', { exact: true }).click()
  const manager = page.locator('.day-template-manager')
  const item = manager.locator('.day-template-manager-item').filter({ hasText: 'Modello checkpoint personale' })
  await item.getByRole('button', { name: 'Rinomina' }).click()
  await item.getByLabel('Nome del modello').fill('Modello checkpoint rinominato')
  await item.getByRole('button', { name: 'Salva nome' }).click()
  await expect(page.getByRole('button', { name: /Modello checkpoint rinominato/ })).toBeVisible()

  await page.getByRole('button', { name: /Modello checkpoint rinominato/ }).click()
  const renamedItem = manager.locator('.day-template-manager-item').filter({ hasText: 'Modello checkpoint rinominato' })
  await renamedItem.getByRole('button', { name: 'Elimina' }).click()
  const removeConfirm = renamedItem.getByRole('alertdialog', { name: 'Eliminare questo modello personale?' })
  await removeConfirm.getByRole('button', { name: 'Elimina modello' }).click()
  await expect(page.getByRole('button', { name: /Modello checkpoint rinominato/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Pagina vuota/ })).toHaveAttribute('aria-pressed', 'true')

  blocks = await allFromStore<any>(page, 'blocks')
  expect(blocks.filter((block) => block.dayId === days[0].id && !block.deletedAt).length).toBeGreaterThan(0)
  const updatedTemplates = await allFromStore<any>(page, 'templates')
  expect(updatedTemplates.find((template) => template.id === personal.id)?.deletedAt).toBeTruthy()
})

test('build PWA funziona offline e le schermate principali non creano overflow mobile', async ({ page, context }) => {
  await createTrip(page, 'Checkpoint Offline')
  await createBlankDay(page, 'Offline mobile', 'Diario disponibile offline.')
  await openDay(page, 'Offline mobile')

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker non supportato nel browser di test.')
    await navigator.serviceWorker.ready
  })

  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Offline mobile' })).toBeVisible()
  await expect(page.getByText('Diario disponibile offline.')).toBeVisible()
  await context.setOffline(false)

  await page.setViewportSize({ width: 390, height: 844 })
  const noOverflow = async () => {
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1)
  }

  await noOverflow()
  await page.getByRole('link', { name: 'Torna al viaggio' }).click()
  await noOverflow()
  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await noOverflow()
  await expect(page.getByRole('button', { name: /Pagina vuota/ })).toBeVisible()
})
