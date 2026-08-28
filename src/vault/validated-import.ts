import {
  discardStagedVaultImport as discardRawStagedVaultImport,
  stageVaultImport as stageRawVaultImport,
  type StageVaultImportOptions,
  type StagedVaultImport,
  type VaultImportProgress,
} from './import'
import { validateActiveMediaFiles, validateDatabaseV1Semantics } from './database-v1-validator'

export type { StageVaultImportOptions, StagedVaultImport, VaultImportProgress }

export async function stageVaultImport(
  file: File,
  passphrase: string,
  options: StageVaultImportOptions = {},
): Promise<StagedVaultImport> {
  const staged = await stageRawVaultImport(file, passphrase, options)
  try {
    validateDatabaseV1Semantics(staged.manifest.database.tables)
    validateActiveMediaFiles(staged.manifest.database.tables, staged.manifest.files)
    return staged
  } catch (error) {
    try {
      await discardRawStagedVaultImport(staged)
    } catch {
      // Semantic validation error is the cause the user needs to see.
    }
    throw error
  }
}

export function discardStagedVaultImport(staged: StagedVaultImport): Promise<void> {
  return discardRawStagedVaultImport(staged)
}
