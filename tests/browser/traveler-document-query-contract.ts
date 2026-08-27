import { TravelerDocumentApplication } from '../../src/application/travelers/traveler-document-application'
import type { TravelerDocumentMetadata, TravelerDocumentView } from '../../src/application/travelers/document-ports'

export interface TravelerDocumentQueryContractResult {
  name: string
  ok: boolean
  error?: string
}

export async function runTravelerDocumentQueryContract(): Promise<TravelerDocumentQueryContractResult> {
  const name = 'Traveler document application queries only the requested traveler'
  const requestedTravelerId = 'traveler-a'
  const timestamp = '2026-08-27T08:00:00.000Z'
  const metadata: TravelerDocumentMetadata = {
    id: 'document-a',
    travelerId: requestedTravelerId,
    type: 'passport',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const view: TravelerDocumentView = { ...metadata, secret: { documentNumber: 'A-1' } }
  const metadataQueries: string[] = []
  const unlockedQueries: string[] = []

  const application = new TravelerDocumentApplication({
    documents: {
      create: async () => view,
      get: async () => view,
      listMetadataByTraveler: async (travelerId) => { metadataQueries.push(travelerId); return [metadata] },
      listByTraveler: async (travelerId) => { unlockedQueries.push(travelerId); return [view] },
      updateSecret: async () => undefined,
      attachFile: async () => { throw new Error('not used') },
      getAttachment: async () => undefined,
      removeAttachment: async () => 'no-attachment',
      softDelete: async () => 'tombstoned',
    },
    security: {
      isConfigured: async () => true,
      isUnlocked: () => true,
      configure: async () => undefined,
      unlock: async () => undefined,
      lock: () => undefined,
    },
  })

  try {
    const [listedMetadata, listedViews] = await Promise.all([
      application.listForTraveler(requestedTravelerId),
      application.listUnlockedForTraveler(requestedTravelerId),
    ])
    if (metadataQueries.length !== 1 || metadataQueries[0] !== requestedTravelerId) throw new Error('Metadata query was not traveler-scoped.')
    if (unlockedQueries.length !== 1 || unlockedQueries[0] !== requestedTravelerId) throw new Error('Unlocked query was not traveler-scoped.')
    if (listedMetadata.length !== 1 || listedMetadata[0].travelerId !== requestedTravelerId) throw new Error('Unexpected metadata result.')
    if (listedViews.length !== 1 || listedViews[0].travelerId !== requestedTravelerId) throw new Error('Unexpected unlocked result.')
    return { name, ok: true }
  } catch (error) {
    return { name, ok: false, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }
  }
}
