import { runApplicationContractTests } from './application-contracts'

const results = await runApplicationContractTests()
;(window as Window & { __DTAGENCY_APPLICATION_RESULTS__?: unknown }).__DTAGENCY_APPLICATION_RESULTS__ = results

const resultElement = document.querySelector<HTMLPreElement>('#result')
if (resultElement) resultElement.textContent = JSON.stringify(results, null, 2)
