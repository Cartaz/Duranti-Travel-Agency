import type { Block } from './entities'

type BlockWithContent = Pick<Block, 'content'>
type BlockReferenceKey = 'reservationId' | 'placeId'

function referenceId(
  block: BlockWithContent | undefined,
  key: BlockReferenceKey,
  label: string,
): string | undefined {
  if (!block) return undefined
  const value = block.content[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} non è valido.`)
  return value
}

export function reservationIdForBlock(block: BlockWithContent | undefined): string | undefined {
  return referenceId(block, 'reservationId', 'Il riferimento alla prenotazione del blocco')
}

export function placeIdForBlock(block: BlockWithContent | undefined): string | undefined {
  return referenceId(block, 'placeId', 'Il riferimento al luogo del blocco')
}

export function withReservationId(content: Block['content'], reservationId: string): Block['content'] {
  return { ...content, reservationId }
}

export function withPlaceId(content: Block['content'], placeId: string): Block['content'] {
  return { ...content, placeId }
}
