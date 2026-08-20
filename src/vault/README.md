# Vault

Portable encrypted backup independent of origin storage.

## Production format v1

Production Vault v1 now implements the complete storage pipeline: chunked encrypted export, strict parse/decrypt/validation, isolated import staging, explicit live replacement, crash recovery/rollback and post-restore verification.

The export contains:

- a canonical snapshot of every Duranti Dexie table, including `appMeta` and the wrapped local document-encryption key envelope;
- every file under `duranti/media/`;
- every file under `duranti/private/traveler-documents/`.

Managed OPFS trees are exported completely, including recoverable orphan files. Reconciliation decides what is stale after restore; export must not silently discard user bytes.

## Envelope

The plaintext header contains only format/KDF/algorithm metadata plus a random archive ID and creation timestamp. The database snapshot, managed file paths and file metadata live inside the encrypted manifest.

Encryption rules:

- PBKDF2-HMAC-SHA256 derives an AES-256-GCM Vault key from the export passphrase and a fresh random salt;
- every encrypted frame uses a fresh random 96-bit AES-GCM IV;
- AES-GCM AAD binds frames to archive ID, record type, file index/path, chunk index and plaintext chunk length;
- ordinary media and already-encrypted private-document files are encrypted again by the portable Vault key.

Large files are processed in 4 MiB chunks and the archive is written incrementally to `duranti/vault-staging/` rather than accumulated in JavaScript memory.

## Consistent export snapshot

Export takes Dexie snapshot A, immutable `File` snapshots of the managed OPFS trees, then Dexie snapshot B. A and B must serialize identically or export fails. OPFS work is never awaited inside the Dexie transaction.

## iPhone save/share flow

The intended UI is two-stage because preparing a backup may outlive transient user activation:

1. **Prepare backup** — create the encrypted staged `.duranti` file.
2. **Save/Share backup** — a fresh user tap invokes Web Share; download fallback remains available.

The passphrase is never persisted.

## Import staging

`stageVaultImport()` never writes to live IndexedDB or live managed OPFS trees. It validates magic/header/version/KDF/encryption, derives the password key, authenticates and decrypts the manifest, validates current-schema tables/keys and managed paths, authenticates every file chunk, and writes only to:

```text
duranti/vault-import-staging/<stageId>/files/<fileIndex>.bin
```

Original managed paths remain authenticated metadata and are revalidated before live mutation. Production v1 accepts only the exact current database schema version.

## Live restore protocol

`commitStagedVaultImport()` requires explicit `{ mode: 'replace' }`. UI must obtain user confirmation before invoking it because current live Duranti data is replaced.

```text
revalidate staged manifest + staged File snapshots
        ↓
snapshot current managed OPFS
        ↓
copy current files to rollback backup
        ↓
persist journal: files-mutating
        ↓
replace live managed OPFS from staging
        ↓
verify exact target file inventory
        ↓
persist journal: files-promoted
        ↓
single Dexie rw transaction:
  clear every table
  bulkPut every restored table
        ↓
lock the in-memory sensitive-data DEK
        ↓
persist journal: committed
        ↓
post-restore verification
        ↓
cleanup staging + backup + journal
```

The Dexie replacement is one transaction across all tables. No OPFS or Web Crypto operation is awaited inside that transaction.

## Crash recovery

IndexedDB and OPFS cannot participate in one browser transaction, so restore uses a temporary rollback copy of the previous managed OPFS files plus a small OPFS journal.

Rollback files:

```text
duranti/vault-restore-backup/<restoreId>/
```

Journal:

```text
duranti/vault-restore-state/current.json
```

The journal contains restore identifiers, phase metadata and the SHA-256 fingerprint of the target database snapshot. It does not persist a plaintext duplicate of the previous IndexedDB database.

Recovery runs during application bootstrap before `ensureInstallationMetadata()` can update `appMeta`:

- `files-mutating` -> restore the previous OPFS backup;
- `files-promoted` -> fingerprint the current DB; matching target means the Dexie commit won, otherwise restore the previous OPFS backup;
- `committed` -> imported state is authoritative; finish cleanup only.

This also handles a crash after Dexie commits but before the journal update: the target fingerprint disambiguates the result.

## Post-restore verification

After a successful Dexie commit Duranti verifies the canonical database SHA-256 fingerprint, exact managed OPFS path/byte inventory and ordinary-media integrity with `scanMediaIntegrity()`.

The local sensitive-document DEK is intentionally locked after database replacement because restored `appMeta` may contain a different wrapped key envelope. Full relational private-document integrity scanning therefore runs after the user unlocks the restored sensitive store. The Vault layer has already authenticated every restored private-file byte and restore verifies its path and size.

Verification warnings after the atomic database commit are returned to the caller and do not silently roll back a committed restore.

## Failure and cleanup rules

Before Dexie commits, any failure attempts immediate OPFS rollback. If rollback or cleanup cannot finish, the journal and backup remain so bootstrap recovery can retry before the app renders.

After Dexie commits, imported structured data is authoritative. Staging and rollback artifacts are removed best-effort; a `committed` journal remains until cleanup succeeds.

Never parse directly into live data. Never log plaintext Vault contents, passwords, keys or sensitive document data.

The Storage Lab Vault remains a diagnostic PoC only and is not compatible with production format v1.
