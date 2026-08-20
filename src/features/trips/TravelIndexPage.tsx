const chapters = [
  {
    key: 'planned',
    eyebrow: 'Capitoli da scrivere',
    title: 'Viaggi pianificati',
    description: 'Idee, date, luoghi e prenotazioni prenderanno forma qui.',
  },
  {
    key: 'ongoing',
    eyebrow: 'Adesso',
    title: 'Viaggi in corso',
    description: 'Il capitolo aperto durante il viaggio, sempre disponibile offline.',
  },
  {
    key: 'completed',
    eyebrow: 'Memorie',
    title: 'Viaggi conclusi',
    description: 'Diari, fotografie e ricordi da rileggere come pagine di un libro.',
  },
] as const

export default function TravelIndexPage() {
  return (
    <section className="travel-index" aria-labelledby="travel-index-title">
      <div className="book-intro">
        <div className="book-intro-copy">
          <p className="eyebrow">DURANTI TRAVEL AGENCY</p>
          <h1 id="travel-index-title">Il nostro libro dei viaggi</h1>
          <p className="book-tagline">viaggia con noi, viaggio, con i topi</p>
          <p className="book-intro-note">
            Un unico libro. Ogni viaggio sarà un capitolo da pianificare, vivere e conservare.
          </p>
        </div>
        <div className="book-emblem" aria-hidden="true">
          <span>DTA</span>
          <small>EST. NOI DUE</small>
        </div>
      </div>

      <div className="chapter-list" aria-label="Indice dei viaggi">
        {chapters.map((chapter, index) => (
          <article className="chapter-card" key={chapter.key}>
            <div className="chapter-number" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </div>
            <div className="chapter-copy">
              <p className="eyebrow">{chapter.eyebrow}</p>
              <h2>{chapter.title}</h2>
              <p>{chapter.description}</p>
            </div>
            <div className="chapter-count" aria-label="0 viaggi">0</div>
          </article>
        ))}
      </div>

      <aside className="foundation-note">
        <span className="foundation-dot" aria-hidden="true" />
        <p>
          La biblioteca è pronta: dati, media, documenti cifrati e Vault restano locali sul dispositivo.
        </p>
      </aside>
    </section>
  )
}
