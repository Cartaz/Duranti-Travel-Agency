export interface Pbkdf2BenchmarkResult {
  iterations: number
  durationMs: number
}

export interface Pbkdf2BenchmarkOptions {
  iterations?: number[]
  runsPerCandidate?: number
}

const DEFAULT_ITERATIONS = [200_000, 300_000, 400_000, 600_000]
const DEFAULT_RUNS = 2
const BENCHMARK_PASSPHRASE = 'dtagency-local-kdf-benchmark-only'

function assertIterations(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('PBKDF2 benchmark iterations must be positive safe integers.')
  }
}

async function benchmarkSingleDerivation(iterations: number): Promise<number> {
  const encoded = new TextEncoder().encode(BENCHMARK_PASSPHRASE)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  try {
    const material = await crypto.subtle.importKey(
      'raw',
      encoded,
      'PBKDF2',
      false,
      ['deriveKey'],
    )

    const startedAt = performance.now()
    await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey'],
    )
    return performance.now() - startedAt
  } finally {
    encoded.fill(0)
    salt.fill(0)
  }
}

export async function benchmarkPbkdf2(
  options: Pbkdf2BenchmarkOptions = {},
): Promise<Pbkdf2BenchmarkResult[]> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  const runsPerCandidate = options.runsPerCandidate ?? DEFAULT_RUNS

  if (!Number.isSafeInteger(runsPerCandidate) || runsPerCandidate <= 0) {
    throw new Error('PBKDF2 benchmark runsPerCandidate must be a positive safe integer.')
  }

  const results: Pbkdf2BenchmarkResult[] = []

  for (const candidate of iterations) {
    assertIterations(candidate)
    let totalDurationMs = 0

    for (let run = 0; run < runsPerCandidate; run += 1) {
      totalDurationMs += await benchmarkSingleDerivation(candidate)
    }

    results.push({
      iterations: candidate,
      durationMs: totalDurationMs / runsPerCandidate,
    })
  }

  return results
}
