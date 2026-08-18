# Workers

Heavy or lifecycle-sensitive work belongs outside the React main thread where practical.

- `service-worker/` — app-shell caching and offline network handling.
- `media/` — future image/video processing.
- `crypto/` — future large Vault encryption/decryption jobs if benchmarks justify it.

Do not move work to a worker merely for abstraction. Measure first on iPhone 16.
