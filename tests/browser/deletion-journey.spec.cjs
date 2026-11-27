const { test, expect } = require('@playwright/test')

async function createTrip(page, title) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Nuovo viaggio' }).click()
  await page.getByLabel(/Titolo/).fill(title)
  await page.getByLabel('Partenza').fill('2026-11-01')
  await page.getByLabel('Ritorno').fill('2026-11-03')
  await page.getByRole('button', { name: 'Crea viaggio' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

test('days, archived trips and travelers can be deleted after explicit confirmation', async ({ page }) => {
  await createTrip(page, 'Viaggio da eliminare')
  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await page.getByRole('button', { name: /Pagina vuota/ }).click()
  await page.getByLabel('Titolo della giornata').fill('Giornata sbagliata')
  await page.getByRole('button', { name: 'Crea giornata' }).click()
  await expect(page.getByRole('link', { name: /Giornata sbagliata/ }).first()).toBeVisible()

  await page.getByRole('link', { name: 'Modifica Giornata sbagliata' }).click()
  const deleteDay = page.getByRole('region', { name: 'Elimina giornata' })
  await deleteDay.getByRole('button', { name: 'Elimina giornata' }).click()
  await deleteDay.getByRole('button', { name: 'Annulla' }).click()
  await deleteDay.getByRole('button', { name: 'Elimina giornata' }).click()
  await deleteDay.getByRole('button', { name: 'Elimina giornata e contenuti' }).click()
  await expect(page.getByRole('heading', { name: 'Viaggio da eliminare' })).toBeVisible()
  await expect(page.getByText('Giornata sbagliata')).toHaveCount(0)

  await page.getByRole('button', { name: 'Archivia' }).click()
  await page.getByRole('button', { name: 'Archivia viaggio' }).click()
  await expect(page.getByRole('heading', { name: 'Archivio viaggi' })).toBeVisible()
  const card = page.locator('.archive-card').filter({ hasText: 'Viaggio da eliminare' })
  await card.getByRole('button', { name: 'Elimina definitivamente' }).click()
  await card.getByRole('alertdialog').getByRole('button', { name: 'Elimina definitivamente' }).click()
  await expect(page.locator('.archive-card').filter({ hasText: 'Viaggio da eliminare' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Archivio viaggi' })).toBeVisible()
  await expect(page.getByText('Viaggio da eliminare')).toHaveCount(0)

  await page.goto('/#/travelers/new')
  await page.getByLabel('Nome *', { exact: true }).fill('Mario')
  await page.getByLabel('Cognome *').fill('Bianchi')
  await page.getByRole('button', { name: 'Crea profilo' }).click()
  await expect(page.getByText('Mario Bianchi').first()).toBeVisible()
  await page.getByRole('link', { name: 'Modifica' }).first().click()
  const deleteTraveler = page.getByRole('region', { name: 'Elimina viaggiatore' })
  await deleteTraveler.getByRole('button', { name: 'Elimina viaggiatore' }).click()
  await deleteTraveler.getByRole('button', { name: 'Elimina viaggiatore e documenti' }).click()
  await expect(page).toHaveURL(/#\/travelers$/)
  await expect(page.getByText('Mario Bianchi')).toHaveCount(0)
})

test('a deletion that cannot free every file says so and points to storage reclamation', async ({ page }) => {
  await createTrip(page, 'Viaggio con copertina')
  await page.getByRole('link', { name: 'Nuova giornata' }).click()
  await page.getByRole('button', { name: /Pagina vuota/ }).click()
  await page.getByLabel('Titolo della giornata').fill('Giornata con foto')
  await page.getByRole('button', { name: 'Crea giornata' }).click()
  await expect(page.getByRole('link', { name: /Giornata con foto/ }).first()).toBeVisible()

  // A day photo that the trip still uses as its cover cannot be purged with the day.
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('dtagency')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const read = (store) =>
      new Promise((resolve, reject) => {
        const request = database.transaction(store, 'readonly').objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const [trip] = await read('trips')
    const [day] = await read('days')
    const root = await navigator.storage.getDirectory()
    const media = await (
      await root.getDirectoryHandle('dtagency', { create: true })
    ).getDirectoryHandle('media', {
      create: true,
    })
    const writable = await (
      await (
        await media.getDirectoryHandle('cover-photo', { create: true })
      ).getFileHandle('original', { create: true })
    ).createWritable()
    await writable.write(new Blob(['jpeg']))
    await writable.close()
    const now = new Date().toISOString()
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(['media', 'trips'], 'readwrite')
      transaction.objectStore('media').put({
        id: 'cover-photo',
        tripId: trip.id,
        dayId: day.id,
        kind: 'image',
        mimeType: 'image/jpeg',
        sizeBytes: 4,
        opfsPath: 'dtagency/media/cover-photo/original',
        createdAt: now,
        updatedAt: now,
      })
      transaction.objectStore('trips').put({ ...trip, coverMediaId: 'cover-photo' })
      transaction.oncomplete = () => resolve(undefined)
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })

  await page.getByRole('link', { name: 'Modifica Giornata con foto' }).click()
  const deleteDay = page.getByRole('region', { name: 'Elimina giornata' })
  await deleteDay.getByRole('button', { name: 'Elimina giornata' }).click()
  await deleteDay.getByRole('button', { name: 'Elimina giornata e contenuti' }).click()
  const outcome = page.getByRole('status', { name: 'Elimina giornata' })
  await expect(outcome.getByText('1 file non è stato ancora rimosso', { exact: false })).toBeVisible()
  await expect(outcome.getByRole('link', { name: 'Apri Backup' })).toBeVisible()
  await outcome.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Viaggio con copertina' })).toBeVisible()
})
