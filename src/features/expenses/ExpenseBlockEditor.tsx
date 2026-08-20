import { FormEvent, useEffect, useState } from 'react'
import type { Block, Expense } from '../../domain/entities'
import { movePlannerBlock } from '../planner/block-service'
import {
  deletePlannerExpenseBlock,
  emptyExpenseDraft,
  expenseToDraft,
  getPlannerExpense,
  savePlannerExpense,
  type ExpenseDraft,
} from './expense-service'
import { formatMinorCurrency } from './currency'
import './expenses.css'

type MoveDirection = 'up' | 'down'

export default function ExpenseBlockEditor({
  block,
  tripId,
  dayId,
  dayDate,
  tripCurrency,
  readOnly,
  canMoveUp,
  canMoveDown,
  onChanged,
}: {
  block: Block
  tripId: string
  dayId: string
  dayDate: string
  tripCurrency?: string
  readOnly: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onChanged: () => Promise<void>
}) {
  const fallbackCurrency = tripCurrency ?? 'EUR'
  const [expense, setExpense] = useState<Expense>()
  const [draft, setDraft] = useState<ExpenseDraft>(() => emptyExpenseDraft(fallbackCurrency))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getPlannerExpense(tripId, dayId, block.id)
      .then((loadedExpense) => {
        if (cancelled) return
        setExpense(loadedExpense)
        setDraft(loadedExpense ? expenseToDraft(loadedExpense) : emptyExpenseDraft(fallbackCurrency))
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere la spesa.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [block.id, block.updatedAt, dayId, fallbackCurrency, tripId])

  const patch = (changes: Partial<ExpenseDraft>): void => setDraft((current) => ({ ...current, ...changes }))

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (readOnly || saving) return
    setSaving(true)
    setError('')
    try {
      const saved = await savePlannerExpense(tripId, dayId, block.id, draft)
      setExpense(saved)
      setDraft(expenseToDraft(saved))
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile salvare la spesa.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (readOnly || saving || !window.confirm('Eliminare questo blocco e la relativa spesa?')) return
    setSaving(true)
    setError('')
    try {
      await deletePlannerExpenseBlock(tripId, dayId, block.id)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile eliminare la spesa.')
      setSaving(false)
    }
  }

  const move = async (direction: MoveDirection): Promise<void> => {
    if (readOnly || saving) return
    setSaving(true)
    setError('')
    try {
      await movePlannerBlock(tripId, dayId, block.id, direction)
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossibile spostare la spesa.')
    } finally {
      setSaving(false)
    }
  }

  const dayMin = `${dayDate}T00:00`
  const dayMax = `${dayDate}T23:59`

  return (
    <form className="planner-block expense-block" onSubmit={(event) => void save(event)}>
      <div className="planner-block-topline">
        <span>Spesa</span>
        {!readOnly && (
          <div className="planner-block-tools">
            <button type="button" disabled={saving || !canMoveUp} aria-label="Sposta blocco su" title="Sposta su" onClick={() => void move('up')}>↑</button>
            <button type="button" disabled={saving || !canMoveDown} aria-label="Sposta blocco giù" title="Sposta giù" onClick={() => void move('down')}>↓</button>
            <button className="planner-delete" type="button" disabled={saving} onClick={() => void remove()}>Elimina</button>
          </div>
        )}
      </div>

      {loading ? (
        <span className="expense-loading" role="status">Carico la spesa…</span>
      ) : (
        <>
          {expense && (
            <strong className="expense-total">
              {formatMinorCurrency(expense.amountMinor, expense.currency)}
            </strong>
          )}

          <div className="expense-grid">
            <label>
              <span>Importo *</span>
              <input
                type="text"
                inputMode="decimal"
                required
                readOnly={readOnly}
                placeholder="12,50"
                value={draft.amount}
                onChange={(event) => patch({ amount: event.target.value })}
              />
            </label>
            <label>
              <span>Valuta *</span>
              <input
                type="text"
                maxLength={3}
                required
                autoCapitalize="characters"
                readOnly={readOnly}
                placeholder="EUR"
                value={draft.currency}
                onChange={(event) => patch({ currency: event.target.value.toUpperCase() })}
              />
            </label>
            <label>
              <span>Categoria</span>
              <input type="text" maxLength={80} readOnly={readOnly} placeholder="Cibo, museo, trasporto…" value={draft.category ?? ''} onChange={(event) => patch({ category: event.target.value })} />
            </label>
            <label>
              <span>Quando</span>
              <input type="datetime-local" min={dayMin} max={dayMax} readOnly={readOnly} value={draft.occurredAt ?? ''} onChange={(event) => patch({ occurredAt: event.target.value })} />
            </label>
            <label className="expense-wide">
              <span>Descrizione</span>
              <input type="text" maxLength={500} readOnly={readOnly} placeholder="Cena, biglietti museo, taxi…" value={draft.description ?? ''} onChange={(event) => patch({ description: event.target.value })} />
            </label>
            <label className="expense-wide">
              <span>Note</span>
              <textarea rows={3} maxLength={2000} readOnly={readOnly} placeholder="Dettagli utili sulla spesa…" value={draft.notes ?? ''} onChange={(event) => patch({ notes: event.target.value })} />
            </label>
          </div>

          <small className="expense-hint">“Pagato da” verrà collegato ai profili viaggiatori nel relativo modulo.</small>
          {error && <small className="planner-block-error">{error}</small>}

          {!readOnly && (
            <div className="expense-actions">
              <button type="submit" disabled={saving}>{saving ? 'Salvataggio…' : expense ? 'Salva spesa' : 'Crea spesa'}</button>
            </div>
          )}
        </>
      )}
    </form>
  )
}
