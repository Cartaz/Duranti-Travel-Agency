# Local security layer

Duranti is a PWA and cannot rely on iOS Keychain or Secure Enclave through standard Web APIs. Sensitive at-rest protection therefore uses a user-supplied local passphrase and Web Crypto.

Current key hierarchy:

1. PBKDF2-HMAC-SHA256 derives a 256-bit AES-KW key-encryption key (KEK) from the passphrase and a random per-installation salt.
2. A random 256-bit AES-GCM data-encryption key (DEK) is generated once.
3. The DEK is wrapped with the KEK; only the wrapped DEK, salt, KDF parameters and format version are persisted in `appMeta`.
4. Unlock derives the KEK again and unwraps the DEK as a non-extractable `CryptoKey` kept only in JavaScript memory.
5. Locking or reloading the app drops the in-memory DEK and requires the passphrase again.

Sensitive JSON fields and private document attachments use the same unlocked DEK but distinct AES-GCM additional-data namespaces. Binary traveler-document attachments are stored separately from ordinary media under `duranti/private/traveler-documents/<documentId>/<attachmentId>.enc`.

Private attachment format v1 is binary: an 8-byte magic/version marker, a random 96-bit AES-GCM IV and authenticated ciphertext including the GCM tag. Filename, MIME type, original byte size and OPFS path are kept inside the document's encrypted JSON payload rather than plaintext database fields.

Rules:

- Never persist the plaintext passphrase, KEK or unwrapped DEK.
- AES-GCM uses a fresh random 96-bit IV for every encryption under a given key.
- Bind encrypted records and files to their purpose and entity ID using AES-GCM additional authenticated data.
- Do not run PBKDF2 or Web Crypto inside a Dexie transaction.
- Do not route traveler documents through generic plaintext repositories.
- Do not route passport/identity scans through the ordinary unencrypted media OPFS path.
- Private attachment v1 is capped at 20 MiB because Web Crypto encrypt/decrypt consumes a complete BufferSource; larger files require a separately reviewed chunked format.
- Replacement writes a new random attachment file before updating encrypted metadata. After the metadata switch, the old file is removed best-effort; an interrupted cleanup can therefore leave a recoverable orphan, never a metadata reference to intentionally deleted bytes.
- Purge deletes the private OPFS directory before deleting the tombstoned IndexedDB record, matching the crash-safe media lifecycle.
- Private-document integrity scanning is read-only by default and requires the local encryption key to be unlocked so encrypted attachment metadata can be compared with OPFS.
- Normal integrity scans inspect directory structure, file size and the `DURDOC01` envelope marker without decrypting complete attachment bodies. AES-GCM authentication is verified when an attachment is actually decrypted/read.
- Orphan/empty-directory cleanup is exposed only through guarded explicit maintenance functions that re-check current IndexedDB references before deletion.
- Encryption at rest does not defend against malicious script executing while the app is unlocked. CSP/XSS hardening remains required.
- Losing the passphrase without a valid encrypted Vault/recovery design can make sensitive data unrecoverable.

`kdf-benchmark.ts` is an explicit diagnostic helper only. It must never run automatically and never uses the user's real passphrase.
