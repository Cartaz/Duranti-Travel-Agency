import { useEffect, useState } from 'react'
import { formatMinorCurrency } from './currency'
import {
  getTripExpenseSummary,
  type ExpenseCurrencySummary,
  type TripExpenseSummary as TripExpenseSummaryData,
} from './expense-summary-service'
import './expenses.css'

function Breakdown({ title, summary, kind }: {
  title: string
  summary: ExpenseCurrencySummary
  kind: 'categories' | 'payers' | 'days'
}) {
  const items = summary[kind]
  return (
    <div className="expense-summary-breakdown">
      <strong>{title}</strong>
      {items.length === 0 ? (
        <span className="expense-summary-muted">Nessun dato.</span>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.key}>
              <span>{item.label}</span>
              <span>{formatMinorCurrency(item.totalMinor, summary.currency)} · {item.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function TripExpenseSummary({ tripId }: { tripId: string }) {
  const [summary, setSummary] = useState<TripExpenseSummaryData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')

    void getTripExpenseSummary(tripId)
      .then((value) => {
        if (!cancelled) setSummary(value)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile calcolare il riepilogo spese.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tripId])

  return (
    <section className="trip-expense-summary" aria-labelledby="trip-expense-summary-title">
      <div className="expense-summary-heading">
        <div>
          <p className="eyebrow">Conti del capitolo</p>
          <h2 id="trip-expense-summary-title">Riepilogo spese</h2>
          <p>I totali restano separati per valuta e ora includono anche la distribuzione per giorno, senza conversioni o tassi di cambio impliciti.</p>
        </div>
        {summary && <span className="expense-summary-count">{summary.expenseCount} spese</span>}
      </div>

      {loading && <p className="trip-feedback" role="status">Calcolo i totali locali…</p>}
      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}

      {!loading && summary?.expenseCount === 0 && (
        <p className="expense-summary-empty">Nessuna spesa registrata nel viaggio.</p>
      )}

      <div className="expense-currency-list">
        {summary?.currencies.map((currency) => (
          <article className="expense-currency-card" key={currency.currency}>
            <div className="expense-currency-total">
              <span>{currency.currency}</span>
              <strong>{formatMinorCurrency(currency.totalMinor, currency.currency)}</strong>
              <small>{currency.count} {currency.count === 1 ? 'spesa' : 'spese'}</small>
            </div>
            <div className="expense-summary-grid">
              <Breakdown title="Per giorno" summary={currency} kind="days" />
              <Breakdown title="Per categoria" summary={currency} kind="categories" />
              <Breakdown title="Pagato da" summary={currency} kind="payers" />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
