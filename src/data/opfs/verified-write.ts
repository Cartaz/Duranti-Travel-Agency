export async function writeAndVerifyOpfsFile(
  fileHandle: FileSystemFileHandle,
  data: Blob | Uint8Array<ArrayBuffer>,
  expectedBytes: number,
): Promise<void> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) {
    throw new Error('Expected OPFS byte size must be a non-negative safe integer.')
  }

  const writable = await fileHandle.createWritable()
  try {
    await writable.write(data)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort()
    } catch {
      // Preserve the original write failure.
    }
    throw error
  }

  const stored = await fileHandle.getFile()
  if (stored.size !== expectedBytes) {
    throw new Error(`OPFS write verification failed: expected ${expectedBytes} bytes, found ${stored.size}.`)
  }
}
