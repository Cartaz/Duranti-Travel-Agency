import { saveFileToDevice } from '../lib/browser-file'
import { VAULT_FILE_EXTENSION, VAULT_MIME_TYPE } from './format'

export function canShareVaultFile(file: File): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  return navigator.canShare({ files: [file] })
}

export function shareVaultFile(file: File): Promise<void> {
  if (!canShareVaultFile(file)) {
    throw new Error('This browser cannot share the prepared DTAgency Vault as a file.')
  }

  return navigator.share({
    files: [file],
    title: 'DTAgency backup',
  })
}

export function downloadVaultFile(file: File): void {
  saveFileToDevice(file, file.name)
}

export function isDTAgencyVaultFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(VAULT_FILE_EXTENSION) || file.type === VAULT_MIME_TYPE
}
