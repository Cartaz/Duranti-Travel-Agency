# Vault

Portable encrypted backup independent of origin storage.

## Production format v1

Export is implemented as a chunked binary `.duranti` archive. Import remains a separate gated step because restore must stage and validate the entire archive before mutating live IndexedDB/OPFS state.

The export contains:

- a canonical snapshot of every Duranti Dexie table, including `appMeta` and the wrapped local document-encryption key envelope;
- every file under the managed ordinary-media OPFS namespace `duranti/media/`;
- every file under the encrypted private-document namespace `duranti/private/traveler-documents/`.

Managed OPFS trees are exported completely, including recoverable orphan files. This is intentional for disaster recovery: reconciliation can decide what is stale after restore, while export must not silently discard user bytes.

## Envelope

The plaintext header contains only format/KDF/algorithm metadata plus a random archive ID and creation timestamp. The database snapshot, managed file paths and file metadata live inside the encrypted manifest.

Encryption:

- PBKDF2-HMAC-SHA256 derives an AES-256-GCM Vault key from the export passphrase and a fresh random salt;
- every encrypted frame uses a fresh random 96-bit AES-GCM IV;
- AES-GCM additional authenticated data binds frames to the archive ID, record type, file index/path, chunk index and plaintext chunk length;
- ordinary media and already-encrypted private-document files are both encrypted again by the portable Vault key.

Large files are processed in 4 MiB plaintext chunks. The completed encrypted archive is written incrementally to `duranti/vault-staging/` in OPFS instead of accumulating the whole backup in JavaScript memory.

## Consistent snapshot rule

Export takes:

1. Dexie snapshot A in one read-only transaction across all tables;
2. immutable `File` snapshots of the managed OPFS trees;
3. Dexie snapshot B in a second read-only transaction.

A and B must serialize identically or export fails and must be retried. OPFS work is never awaited inside the Dexie transaction. Combined with the crash-safe media/document write protocols, this prevents a successful Vault from knowingly pairing changed database references with the wrong binary snapshot.

## iPhone save/share flow

Preparing a Vault may take too long to retain the browser's transient user activation. The intended UI is therefore two-stage:

1. **Prepare backup** — creates the encrypted staged `.duranti` file.
2. **Save/Share backup** — a fresh user tap invokes Web Share with the already prepared `File`; a download-link fallback is available when file sharing is unsupported.

The passphrase is never persisted. A prepared staging file is already encrypted, but the UI should offer explicit cleanup after a successful share/download or cancellation.

## Import requirements

Production import must still implement all of the following before it is enabled in UI:

- strict header/frame/version validation;
- password derivation and authenticated manifest decryption;
- chunk-order/AAD/authentication validation;
- complete archive validation before live mutation;
- staging of structured data and OPFS files;
- compatibility checks for schema/Vault versions;
- atomic user-visible commit or rollback;
- post-restore integrity scan.

Never import directly into live data while parsing. Never log plaintext Vault contents, passwords, keys or sensitive document data.

The Storage Lab Vault remains a diagnostic PoC only and is not compatible with production format v1.
