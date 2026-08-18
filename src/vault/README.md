# Vault

Portable encrypted backup independent of origin storage.

## Requirements

- Versioned envelope format.
- Password-derived key; password is never persisted.
- AES-256-GCM authenticated encryption.
- Integrity/authentication failure must fail closed.
- Export must include structured data and referenced binary assets.
- Import must validate the complete archive before mutating application state.
- Import should be atomic from the user's perspective: either the whole backup is restored or the operation reports failure and rolls back staged data.
- Never log plaintext vault contents, passwords, keys or sensitive document data.

The current Storage Lab implementation is a PoC and is not yet the production vault format.
