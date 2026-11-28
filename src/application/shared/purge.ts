export interface DeletionOutcome {
  /** Files whose bytes could not be removed now; storage maintenance can reclaim them later. */
  pendingFileCleanup: number
}

/**
 * Purges the bytes of rows a deletion just tombstoned. The deletion itself has
 * already committed, so a failure here never undoes it: it is counted and
 * reported instead of being swallowed.
 */
export async function purgeDeletedFiles(
  ids: string[],
  purge: (id: string) => Promise<unknown>,
  purgeMany?: (ids: string[]) => Promise<Map<string, unknown>>,
): Promise<DeletionOutcome> {
  if (purgeMany && ids.length > 1) {
    const uniqueIds = [...new Set(ids)]
    try {
      const outcomes = await purgeMany(uniqueIds)
      let pendingFileCleanup = 0
      for (const id of uniqueIds) {
        const result = outcomes.get(id)
        if (result === 'referenced' || result === 'error') pendingFileCleanup += 1
      }
      return { pendingFileCleanup }
    } catch {
      return { pendingFileCleanup: uniqueIds.length }
    }
  }

  let pendingFileCleanup = 0
  for (const id of ids) {
    try {
      const result = await purge(id)
      if (result === 'referenced' || result === 'error') pendingFileCleanup += 1
    } catch {
      pendingFileCleanup += 1
    }
  }
  return { pendingFileCleanup }
}
