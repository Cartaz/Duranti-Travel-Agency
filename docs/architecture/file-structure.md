# File structure

> Historical proposal from the project bootstrap. The implemented layout differs: see the layer descriptions in [`README.md`](./README.md) and the boundaries enforced by `scripts/architecture-policy.mjs` (`src/domain`, `src/application`, `src/composition`, `src/data`, `src/vault`, `src/security`, `src/ui`, `src/features`, `src/lib`). Keep this file only as decision context.

```text
src/
├── app/
│   ├── App.tsx
│   ├── routes.tsx
│   └── bootstrap.ts
├── domain/
│   ├── trip.ts
│   ├── traveler.ts
│   ├── day.ts
│   ├── block.ts
│   ├── place.ts
│   ├── activity.ts
│   ├── media.ts
│   ├── link.ts
│   ├── document.ts
│   ├── template.ts
│   └── errors.ts
├── data/
│   ├── db/
│   │   ├── database.ts
│   │   ├── schema.ts
│   │   └── migrations/
│   ├── repositories/
│   ├── opfs/
│   ├── storage/
│   └── import-export/
├── features/
│   ├── trips/
│   ├── planner/
│   ├── days/
│   ├── places/
│   ├── media/
│   ├── travelers/
│   ├── templates/
│   ├── vault/
│   └── book/
├── ui/
│   ├── book/
│   ├── layout/
│   ├── editor/
│   ├── media/
│   ├── map/
│   ├── feedback/
│   └── primitives/
├── workers/
│   ├── service-worker/
│   ├── media/
│   └── crypto/
├── vault/
├── lib/
└── styles/

public/
├── icons/
└── assets/

docs/
├── architecture/
├── decisions/
├── testing/
└── security/

storage-lab/       # isolated PoC/regression lab; not production domain code
tests/
├── unit/
├── integration/
├── storage/
└── e2e/
```

The current repository may still contain the Storage Lab at the root/source level. It should be moved into its own isolated test area only after the production storage adapters are introduced, so we preserve the working PoC as a regression harness.
