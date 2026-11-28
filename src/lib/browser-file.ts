// Object URLs handed to the browser must outlive the navigation they start:
// Safari reads large blobs asynchronously after the click, so revoke late.
const OBJECT_URL_LIFETIME_MS = 60_000

function clickTemporaryAnchor(file: Blob, configure: (anchor: HTMLAnchorElement) => void): void {
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.style.display = 'none'
  configure(anchor)
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS)
}

/** Saves a local file through the browser download flow. */
export function saveFileToDevice(file: Blob, fileName: string): void {
  clickTemporaryAnchor(file, (anchor) => {
    anchor.download = fileName
    anchor.rel = 'noopener'
  })
}

/** Opens a local file in a new browsing context without granting it an opener. */
export function openFileInNewTab(file: Blob): void {
  clickTemporaryAnchor(file, (anchor) => {
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
  })
}
