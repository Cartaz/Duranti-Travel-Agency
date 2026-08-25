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
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function isDTAgencyVaultFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(VAULT_FILE_EXTENSION) || file.type === VAULT_MIME_TYPE
}
