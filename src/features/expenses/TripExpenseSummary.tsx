import { useEffect, useState } from 'react'
import type {
  ExpenseCurrencySummary,
  TripBudgetSummary,
  TripExpenseSummary as TripExpenseSummaryData,
} from '../../application/expenses/expense-summary'
import { useApplicationServices } from '../../ui/application-context'
import { formatMinorCurrency } from './currency'
import './expenses.css'

function Breakdown({ title, summary, kind }: { title: string; summary: ExpenseCurrencySummary; kind: 'categories' | 'payers' | 'days' }) {
  const items = summary[kind]
  return <div className="expense-summary-breakdown"><strong>{title}</strong>{items.length === 0 ? <span className="expense-summary-muted">Nessun dato.</span> : <ul>{items.map((item) => <li key={item.key}><span>{item.label}</span><span>{formatMinorCurrency(item.totalMinor, summary.currency)} · {item.count}</span></li>)}</ul>}</div>
}

function BudgetCard({ budget }: { budget: TripBudgetSummary }) {
  const exceeded = budget.exceededMinor > 0
  const balanceMinor = exceeded ? budget.exceededMinor : budget.remainingMinor
  return <article className={`expense-budget-card${exceeded ? ' expense-budget-card-over' : ''}`}>
    <div className="expense-budget-main"><span>Budget · {budget.currency}</span><strong>{formatMinorCurrency(budget.budgetMinor, budget.currency)}</strong></div>
    <div className="expense-budget-metrics"><div><span>Speso</span><strong>{formatMinorCurrency(budget.spentMinor, budget.currency)}</strong></div><div><span>{exceeded ? 'Superato di' : 'Residuo'}</span><strong>{formatMinorCurrency(balanceMinor, budget.currency)}</strong></div></div>
    <progress className="expense-budget-progress" max={budget.budgetMinor} value={Math.min(budget.spentMinor, budget.budgetMinor)} aria-label={`Avanzamento budget ${budget.currency}`} />
    <p className="expense-budget-note">Il budget considera {budget.includedExpenseCount} {budget.includedExpenseCount === 1 ? 'spesa' : 'spese'}: {budget.directExpenseCount} già in {budget.currency}{budget.convertedExpenseCount > 0 && ` e ${budget.convertedExpenseCount} ${budget.convertedExpenseCount === 1 ? 'convertita' : 'convertite'} con un tasso inserito manualmente`}.{budget.excludedExpenseCount > 0 && ` ${budget.excludedExpenseCount} ${budget.excludedExpenseCount === 1 ? 'spesa in altra valuta resta esclusa perché non ha una conversione esplicita' : 'spese in altre valute restano escluse perché non hanno una conversione esplicita'}.`}</p>
  </article>
}

export default function TripExpenseSummary({ tripId }: { tripId: string }) {
  const { expenses } = useApplicationServices('expenses')
  const [summary, setSummary] = useState<TripExpenseSummaryData>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    void expenses.getTripExpenseSummary(tripId)
      .then((value) => { if (!cancelled) setSummary(value) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile calcolare il riepilogo spese.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [expenses, tripId])

  return <section className="trip-expense-summary" aria-labelledby="trip-expense-summary-title">
    <div className="expense-summary-heading"><div><p className="eyebrow">Conti del capitolo</p><h2 id="trip-expense-summary-title">Riepilogo spese</h2><p>Le valute restano separate. Una spesa estera entra nel budget solo quando registri esplicitamente un tasso verso la valuta del viaggio.</p></div>{summary && <span className="expense-summary-count">{summary.expenseCount} spese</span>}</div>
    {loading && <p className="trip-feedback" role="status">Calcolo i totali locali…</p>}
    {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}
    {!loading && summary?.budget && <BudgetCard budget={summary.budget} />}
    {!loading && summary?.expenseCount === 0 && <p className="expense-summary-empty">Nessuna spesa registrata nel viaggio.</p>}
    <div className="expense-currency-list">{summary?.currencies.map((currency) => <article className="expense-currency-card" key={currency.currency}><div className="expense-currency-total"><span>{currency.currency}</span><strong>{formatMinorCurrency(currency.totalMinor, currency.currency)}</strong><small>{currency.count} {currency.count === 1 ? 'spesa' : 'spese'}</small></div><div className="expense-summary-grid"><Breakdown title="Per giorno" summary={currency} kind="days" /><Breakdown title="Per categoria" summary={currency} kind="categories" /><Breakdown title="Pagato da" summary={currency} kind="payers" /></div></article>)}</div>
  </section>
}
