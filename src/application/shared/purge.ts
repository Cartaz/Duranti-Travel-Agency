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
): Promise<DeletionOutcome> {
  let pendingFileCleanup = 0
  for (const id of ids) {
    try {
      const result = await purge(id)
      if (result === 'referenced') pendingFileCleanup += 1
    } catch {
      pendingFileCleanup += 1
    }
  }
  return { pendingFileCleanup }
}
