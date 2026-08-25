import { runApplicationContractTests } from './application-contracts'
import { runItineraryQueryContract } from './itinerary-query-contract'
import { runMediaHistoricalPlaceContract } from './media-historical-place-contract'

const results = [
  ...(await runApplicationContractTests()),
  await runItineraryQueryContract(),
  await runMediaHistoricalPlaceContract(),
]
;(window as Window & { __DTAGENCY_APPLICATION_RESULTS__?: unknown }).__DTAGENCY_APPLICATION_RESULTS__ = results

const resultElement = document.querySelector<HTMLPreElement>('#result')
if (resultElement) resultElement.textContent = JSON.stringify(results, null, 2)
