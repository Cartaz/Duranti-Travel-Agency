import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { TravelBook } from '../../application/travel-book/travel-book-application'
import { useApplicationServices } from '../../ui/application-context'
import TravelBookMediaGallery from './TravelBookMediaGallery'
import './travel-book.css'

function formatDate(value: string | undefined): string {
  if (!value) return 'Data da definire'
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}

export default function TravelBookPage() {
  const { travelBook: travelBookApplication } = useApplicationServices()
  const { tripId } = useParams<{ tripId: string }>()
  const [book, setBook] = useState<TravelBook>()
  const [chapterIndex, setChapterIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tripId) { setError('Identificatore del viaggio mancante.'); setLoading(false); return }
    let cancelled = false
    void travelBookApplication.loadTravelBook(tripId)
      .then((value) => { if (!cancelled) { setBook(value); setChapterIndex(0) } })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile aprire il libro di viaggio.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [travelBookApplication, tripId])

  useEffect(() => {
    if (!book || book.chapters.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, button, a, video')) return
      if (event.key === 'ArrowLeft') setChapterIndex((value) => Math.max(0, value - 1))
      if (event.key === 'ArrowRight') setChapterIndex((value) => Math.min(book.chapters.length - 1, value + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [book])

  if (loading) return <p className="travel-book-feedback" role="status">Apro il libro…</p>
  if (!book) return <section className="travel-book-shell"><p className="travel-book-feedback travel-book-error" role="alert">{error || 'Libro di viaggio non disponibile.'}</p><Link className="travel-book-back" to="/">Torna ai viaggi</Link></section>

  const chapter = book.chapters[chapterIndex]
  const progress = book.chapters.length ? ((chapterIndex + 1) / book.chapters.length) * 100 : 0

  return (
    <article className="travel-book-shell" aria-labelledby="travel-book-title">
      <header className="travel-book-cover">
        <div className="travel-book-cover-inner">
          <p className="eyebrow">Libro di viaggio</p>
          <h1 id="travel-book-title">{book.title}</h1>
          {book.subtitle && <p className="travel-book-subtitle">{book.subtitle}</p>}
          <p className="travel-book-range">{formatDate(book.startDate)} — {formatDate(book.endDate)}</p>
          {book.chapters.length > 0 && <p className="travel-book-cover-count">{book.chapters.length} {book.chapters.length === 1 ? 'capitolo' : 'capitoli'}</p>}
        </div>
      </header>

      {book.chapters.length === 0 ? (
        <section className="travel-book-empty"><h2>Il libro è pronto per il primo capitolo</h2><p>Aggiungi una giornata al viaggio: diventerà automaticamente un capitolo del libro.</p><Link className="travel-book-primary" to={`/trips/${book.tripId}/days/new`}>Aggiungi giornata</Link></section>
      ) : chapter ? (
        <>
          <nav className="travel-book-chapter-nav" aria-label="Navigazione capitoli">
            <button type="button" disabled={chapterIndex === 0} onClick={() => setChapterIndex((value) => value - 1)} aria-label="Capitolo precedente">← <span>Precedente</span></button>
            <div className="travel-book-progress-wrap">
              <span>Capitolo {chapterIndex + 1} di {book.chapters.length}</span>
              <div className="travel-book-progress" role="progressbar" aria-valuemin={1} aria-valuemax={book.chapters.length} aria-valuenow={chapterIndex + 1} aria-label="Avanzamento nel libro"><i style={{ width: `${progress}%` }} /></div>
            </div>
            <button type="button" disabled={chapterIndex === book.chapters.length - 1} onClick={() => setChapterIndex((value) => value + 1)} aria-label="Capitolo successivo"><span>Successivo</span> →</button>
          </nav>
          <section className="travel-book-spread" aria-live="polite">
            <div className="travel-book-page travel-book-page-copy" aria-labelledby="travel-book-chapter-title">
              <p className="travel-book-date">{formatDate(chapter.date)}</p>
              <p className="travel-book-chapter-number">{String(chapterIndex + 1).padStart(2, '0')}</p>
              <h2 id="travel-book-chapter-title">{chapter.title ?? `Giorno ${chapter.sequence}`}</h2>
              {chapter.summary && <p className="travel-book-summary">{chapter.summary}</p>}
              {chapter.journalText ? <div className="travel-book-journal">{chapter.journalText}</div> : <p className="travel-book-placeholder">Il diario di questa giornata non è ancora stato scritto.</p>}
              <Link className="travel-book-edit-link" to={`/trips/${book.tripId}/days/${chapter.dayId}`}>Apri la giornata</Link>
            </div>
            <div className="travel-book-page travel-book-page-media">
              <TravelBookMediaGallery tripId={book.tripId} dayId={chapter.dayId} media={chapter.media} />
              {chapter.media.length === 0 && <div className="travel-book-memory-placeholder" aria-hidden="true"><span>✦</span><p>Uno spazio per i ricordi di questa giornata</p></div>}
            </div>
          </section>
          <nav className="travel-book-chapter-strip" aria-label="Indice dei capitoli">
            {book.chapters.map((item, index) => <button type="button" key={item.dayId} className={index === chapterIndex ? 'is-active' : ''} aria-current={index === chapterIndex ? 'page' : undefined} onClick={() => setChapterIndex(index)}><span>{index + 1}</span>{item.title ?? `Giorno ${item.sequence}`}</button>)}
          </nav>
        </>
      ) : null}

      <Link className="travel-book-back" to={`/trips/${book.tripId}`}>← Torna al viaggio</Link>
    </article>
  )
}
