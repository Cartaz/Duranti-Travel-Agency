import type { DayItineraryItem } from './itinerary-service'
import './itinerary.css'

const typeLabels: Record<NonNullable<DayItineraryItem['itinerary']['type']>, string> = {
  transport: 'Trasporto',
  activity: 'Attività',
  meal: 'Pasto',
  reservation: 'Prenotazione',
  'free-time': 'Tempo libero',
  custom: 'Altro',
}

const statusLabels: Record<NonNullable<DayItineraryItem['itinerary']['status']>, string> = {
  idea: 'Idea',
  planned: 'Pianificato',
  booked: 'Prenotato',
  done: 'Fatto',
  cancelled: 'Annullato',
}

function timeLabel(value: string | undefined): string {
  if (!value) return 'Senza orario'
  const time = value.slice(11, 16)
  return /^\d{2}:\d{2}$/.test(time) ? time : value
}

export default function DayItinerarySummary({ items }: { items: DayItineraryItem[] }) {
  if (items.length === 0) return null

  return (
    <section className="day-itinerary" aria-labelledby="day-itinerary-title">
      <div className="day-itinerary-heading">
        <div>
          <p className="eyebrow">Sequenza della giornata</p>
          <h2 id="day-itinerary-title">Itinerario</h2>
        </div>
        <span>{items.length} {items.length === 1 ? 'tappa' : 'tappe'}</span>
      </div>

      <ol className="day-itinerary-list">
        {items.map(({ itinerary, place }) => (
          <li key={itinerary.id} className={itinerary.status === 'cancelled' ? 'day-itinerary-cancelled' : undefined}>
            <time dateTime={itinerary.startsAt}>{timeLabel(itinerary.startsAt)}</time>
            <div className="day-itinerary-marker" aria-hidden="true" />
            <div className="day-itinerary-content">
              <div className="day-itinerary-title-row">
                <strong>{itinerary.title}</strong>
                <span>{typeLabels[itinerary.type ?? 'custom']}</span>
              </div>
              <div className="day-itinerary-meta">
                {place && <span>{place.name}</span>}
                {itinerary.status && <span>{statusLabels[itinerary.status]}</span>}
                {itinerary.bookingReference && <span>Codice {itinerary.bookingReference}</span>}
                {itinerary.endsAt && <span>fino alle {timeLabel(itinerary.endsAt)}</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
