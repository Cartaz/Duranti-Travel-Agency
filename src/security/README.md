# Local security layer

Duranti is a PWA and cannot rely on iOS Keychain or Secure Enclave through standard Web APIs. Sensitive at-rest protection therefore uses a user-supplied local passphrase and Web Crypto.

Current key hierarchy:

1. PBKDF2-HMAC-SHA256 derives a 256-bit AES-KW key-encryption key (KEK) from the passphrase and a random per-installation salt.
2. A random 256-bit AES-GCM data-encryption key (DEK) is generated once.
3. The DEK is wrapped with the KEK; only the wrapped DEK, salt, KDF parameters and format version are persisted in `appMeta`.
4. Unlock derives the KEK again and unwraps the DEK as a non-extractable `CryptoKey` kept only in JavaScript memory.
5. Locking or reloading the app drops the in-memory DEK and requires the passphrase again.

Rules:

- Never persist the plaintext passphrase, KEK or unwrapped DEK.
- AES-GCM uses a fresh random 96-bit IV for every encryption under a given key.
- Bind encrypted records to their purpose and entity ID using AES-GCM additional authenticated data.
- Do not run PBKDF2 or Web Crypto inside a Dexie transaction.
- Do not route traveler documents through generic plaintext repositories.
- Do not route passport/identity scans through the ordinary unencrypted media OPFS path. Encrypted private-file storage is a separate follow-up layer.
- Encryption at rest does not defend against malicious script executing while the app is unlocked. CSP/XSS hardening remains required.
- Losing the passphrase without a valid encrypted Vault/recovery design can make sensitive data unrecoverable.
