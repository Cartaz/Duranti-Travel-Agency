# Duranti Architecture

## Decisions

- **Offline-first:** local data is the source of truth. Network access is optional and only used for explicitly online features.
- **IndexedDB:** structured domain data, indexes, metadata, settings, references and transactional state.
- **OPFS:** large binary assets such as photos, videos, document scans and generated exports.
- **Cache Storage / Service Worker:** application shell and network resources; never the canonical copy of user data.
- **Vault:** encrypted, portable backup independent of the origin storage. AES-256-GCM with a password-derived key; vault format is versioned.
- **Storage persistence:** request `navigator.storage.persist()` where available and expose storage diagnostics, but never treat quota estimates as exact capacity.
- **No cloud LLM:** AI features must remain local-first. Any future model integration must be an explicit local capability and must never upload private trip data.
- **Single origin:** the production PWA must keep one stable origin because browser storage and service-worker registrations are origin-scoped.

## Data ownership rules

1. IndexedDB is the source of truth for structured entities.
2. OPFS is the source of truth for large binary blobs.
3. Database records reference media by stable IDs, never by volatile blob URLs.
4. Deleting an entity and its assets must be an explicit, transactional workflow with orphan cleanup.
5. Every schema change is versioned and has a migration.
6. UI state must never be the source of truth.
7. Network responses are treated as external input and validated before persistence.

## Domain boundaries

- `domain`: pure business types, invariants and use-case contracts.
- `data`: IndexedDB/OPFS implementations and persistence adapters.
- `features`: user-facing travel workflows.
- `ui`: reusable visual components and book interaction.
- `workers`: service worker and heavy background processing.
- `vault`: export/import and cryptographic envelope handling.

## Storage model

```text
                    Duranti PWA
                         |
              +----------+----------+
              |                     |
        Structured data        Binary data
              |                     |
          IndexedDB                 OPFS
              |                     |
              +----------+----------+
                         |
                    Domain layer
                         |
              +----------+----------+
              |                     |
          UI / features       Vault exporter
                                    |
                              encrypted file
                                    |
                                  Files
```

## Offline policy

- App shell: precached.
- Static assets: cache-first / revisioned.
- User data: IndexedDB/OPFS only.
- External links: open online; never make the core workflow depend on them.
- Google Maps data: store the user's selected place metadata locally; map links are references, not dependencies.
- Failed writes must surface an actionable error and never silently disappear.

## Security

Sensitive documents are local-only by default. The application must avoid logging document contents, media contents, passwords or encryption keys. Vault encryption keys exist only in memory and are derived when needed.

## Sources

- WebKit Storage Policy: https://webkit.org/blog/14403/updates-to-storage-policy/
- web.dev Storage for the web: https://web.dev/articles/storage-for-the-web
- web.dev Offline data: https://web.dev/learn/pwa/offline-data
- MDN PWA caching: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching
- MDN IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
