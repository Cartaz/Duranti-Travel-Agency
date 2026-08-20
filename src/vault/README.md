# Vault

Portable encrypted backup independent of origin storage.

## Production format v1

Export is implemented as a chunked binary `.duranti` archive. Import now supports strict parse/decrypt/validation plus isolated OPFS staging; the final live commit/rollback step remains separately gated.

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

## Import staging

`stageVaultImport()` never writes to the live Duranti database or managed live OPFS trees.

It performs, in order:

1. exact file magic/header/version/KDF/encryption validation;
2. PBKDF2 key derivation;
3. authenticated AES-GCM manifest decryption;
4. current-schema table-set and primary-key validation;
5. managed-path, file-size and chunk-count validation;
6. strict frame ordering and per-chunk AAD/authentication checks;
7. sequential decryption of file chunks into an isolated staging subtree;
8. final staged byte-size verification, end-frame verification and rejection of trailing bytes.

Staged binary bytes live only under:

```text
duranti/vault-import-staging/<stageId>/files/<fileIndex>.bin
```

Original managed paths are not used as staging filesystem paths. They remain authenticated manifest metadata and are revalidated before any future live commit.

Structured rows remain in the returned in-memory validated manifest during this phase; they are not inserted into IndexedDB. Ordinary media chunks are plaintext in import staging because they are plaintext in their normal live OPFS namespace. Private-document files remain protected by their inner `DURDOC01` encryption even after the outer Vault layer is removed.

Any parsing, password, authentication, ordering, size or staging failure removes the entire import staging directory best-effort and leaves live Duranti state untouched. `discardStagedVaultImport()` explicitly removes a successful staging area when the user cancels.

Production format v1 currently accepts only the exact current database schema version. Cross-schema restore will require an explicit reviewed migration path rather than silently inserting incompatible rows.

## Remaining import commit requirements

Before restore is exposed as complete in the UI, the next gated step must implement:

- re-validation of the staged manifest immediately before mutation;
- a user-visible replace/restore policy for existing live data;
- isolated live OPFS replacement with recoverable rollback material;
- one short Dexie transaction for structured-data replacement;
- cleanup/rollback if either side of the commit fails;
- post-restore media and private-document integrity scans;
- explicit removal of staging data only after successful verification.

Never parse directly into live data. Never log plaintext Vault contents, passwords, keys or sensitive document data.

The Storage Lab Vault remains a diagnostic PoC only and is not compatible with production format v1.
