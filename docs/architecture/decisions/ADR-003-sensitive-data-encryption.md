# ADR-003 — Local encryption for sensitive traveler data

Status: accepted

## Context

Duranti stores traveler identity data and scans of passports and identity documents. The product is an iPhone Home Screen PWA with no cloud backend and no native Apple Developer integration. Standard web APIs do not expose an iOS Keychain/Secure Enclave equivalent that Duranti can use as its sole application key store.

Sensitive records therefore need application-level encryption at rest while remaining fully local/offline.

## Decision

Use a two-level symmetric key hierarchy implemented with Web Crypto:

- user passphrase -> PBKDF2-HMAC-SHA256 -> AES-256-KW key-encryption key (KEK);
- cryptographically random AES-256-GCM data-encryption key (DEK);
- persist only a versioned envelope containing the PBKDF2 salt/work factor and the AES-KW-wrapped DEK;
- keep the unwrapped DEK only in memory and non-extractable;
- encrypt each sensitive JSON payload using AES-256-GCM with a new 96-bit random IV;
- authenticate `purpose + entityId + formatVersion` as AES-GCM additional data to prevent ciphertext substitution between records;
- store passport/identity binary attachments only in the encrypted private OPFS namespace, never in the ordinary media namespace.

PBKDF2-HMAC-SHA256 starts at 600,000 iterations. The iteration count is persisted in the key envelope so it can evolve after performance measurements on the target iPhone.

Traveler document records keep only relationship/query metadata (`id`, `travelerId`, document `type`, timestamps and tombstone) in plaintext. Document number, issuing country, issue/expiry dates, holder name, notes and private attachment metadata are stored inside the encrypted payload.

Binary attachment format v1 uses the same unlocked DEK with a distinct additional-data namespace. Each file contains only a fixed format marker, a fresh 96-bit IV and AES-GCM authenticated ciphertext. The OPFS location is `duranti/private/traveler-documents/<documentId>/<attachmentId>.enc`.

Because Web Crypto `encrypt()` and `decrypt()` accept a complete BufferSource rather than a streaming source, private attachment format v1 is limited to 20 MiB. Supporting larger binaries requires a separately reviewed chunked authenticated-encryption format; this ADR does not define one.

## Why a wrapped DEK instead of password-encrypting every record directly

A stable random DEK separates data encryption from the user's passphrase. A later passphrase change only needs to derive a new KEK and re-wrap the DEK; it does not require re-encrypting every document or binary attachment.

## Why not make passkeys/WebAuthn the required key store

WebAuthn can improve future unlock UX, but credentials may be synchronized by the platform and the web platform does not give this PWA a universal Keychain/Secure Enclave contract. Duranti's core encrypted storage must remain usable offline and independent of a cloud-synchronized credential provider. WebAuthn may later be an optional convenience layer, not the only recovery path.

## Migration rule

Dexie v3 removes the plaintext `expiryDate` index but does not delete or rewrite legacy document fields. Encrypting those values requires the user's unlocked key, which is unavailable during a database-version transaction. The secure repository must detect legacy plaintext rows and block normal use until an explicit user-mediated secure migration is implemented.

## Attachment lifecycle

A replacement attachment is written to a new random OPFS file first. Only after the new ciphertext exists is the encrypted JSON metadata switched to reference it; the previous ciphertext is then removed best-effort. A crash can therefore leave an orphan file but must not deliberately leave a live metadata reference to bytes that were already removed.

Removing an attachment unlinks it from the encrypted JSON payload before deleting the ciphertext. Purging a tombstoned traveler document removes its private OPFS directory before deleting the IndexedDB record, so an interrupted purge remains discoverable and retryable.

## Integrity and reconciliation

Private-document integrity scanning is read-only by default. A full relational scan requires the local encryption key to be unlocked because attachment IDs, OPFS paths and plaintext sizes live inside the encrypted JSON payload.

The normal scan enumerates the private OPFS tree and compares it with IndexedDB metadata. It detects missing attachments, orphan directories/files, stale empty directories, path mismatches, encrypted-size mismatches, invalid `DURDOC01` envelopes, unexpected OPFS entries, unreadable metadata and legacy plaintext records.

The scanner intentionally does not decrypt every attachment body. It reads file size and the small format header only; full AES-GCM authentication remains part of normal attachment decryption. This avoids repeatedly allocating up to the v1 20 MiB plaintext/ciphertext buffers during routine diagnostics on iPhone.

Cleanup is never automatic. Guarded maintenance functions re-check current IndexedDB references before removing an orphan attachment, orphan directory or stale empty document directory.

## Consequences and limitations

- The passphrase is never persisted.
- A page reload/app restart locks sensitive data.
- Weak passphrases remain susceptible to offline guessing; UI must encourage a strong passphrase.
- PBKDF2 cost must be benchmarked on iPhone 16 before the security UI is frozen.
- Encryption at rest cannot protect plaintext already displayed in an unlocked compromised page; XSS/CSP hardening remains mandatory.
- Integrity reconciliation can detect structural corruption and stale/orphan storage without bulk-decrypting attachment bodies.
- Vault export must eventually include encrypted private OPFS files as well as structured records.
