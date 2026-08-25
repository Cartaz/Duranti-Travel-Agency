import { runApplicationContractTests } from './application-contracts'
import { runItineraryQueryContract } from './itinerary-query-contract'

const results = [
  ...(await runApplicationContractTests()),
  await runItineraryQueryContract(),
]
;(window as Window & { __DTAGENCY_APPLICATION_RESULTS__?: unknown }).__DTAGENCY_APPLICATION_RESULTS__ = results

const resultElement = document.querySelector<HTMLPreElement>('#result')
if (resultElement) resultElement.textContent = JSON.stringify(results, null, 2)
