import { useEffect, useState, type FormEvent } from 'react'
import type { Place } from '../../domain/entities'
import type { PlaceDraft } from '../../application/places/place-application'
import type { PlaceImportCandidate } from '../../application/places/place-import'
import { useApplicationServices } from '../../ui/application-context'
import { googleMapsUrlForPlace } from './maps-url'
import './place-catalog.css'

interface EditableImport {
  name: string
  formattedAddress: string
  phone: string
  openingHours: string
  candidate: PlaceImportCandidate
}

function editableImport(candidate: PlaceImportCandidate): EditableImport {
  return { name: candidate.name, formattedAddress: candidate.formattedAddress ?? '', phone: candidate.phone ?? '', openingHours: candidate.openingHours ?? '', candidate }
}
function draftFromEditable(value: EditableImport): PlaceDraft {
  return { ...value.candidate, name: value.name, formattedAddress: value.formattedAddress, phone: value.phone, openingHours: value.openingHours }
}
function detail(value: string | undefined, fallback = 'Non disponibile'): string { return value?.trim() || fallback }

export default function PlaceCatalogPage() {
  const { places, placeImport } = useApplicationServices('places', 'placeImport')
  const [catalog, setCatalog] = useState<Place[]>([])
  const [sourceUrl, setSourceUrl] = useState('')
  const [candidates, setCandidates] = useState<PlaceImportCandidate[]>([])
  const [selected, setSelected] = useState<EditableImport>()
  const [editingPlaceId, setEditingPlaceId] = useState<string>()
  const [editingDraft, setEditingDraft] = useState<PlaceDraft>()
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingSaving, setEditingSaving] = useState(false)
  const [deletingPlaceId, setDeletingPlaceId] = useState<string>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadCatalog = async (): Promise<void> => { setCatalog(await places.listCatalogPlaces()) }
  useEffect(() => {
    let cancelled = false
    void places.listCatalogPlaces().then((items) => { if (!cancelled) setCatalog(items) }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Impossibile leggere i luoghi salvati.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [places])

  const preview = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); if (searching) return
    setSearching(true); setError(''); setNotice(''); setCandidates([]); setSelected(undefined)
    try { const results = await placeImport.previewGoogleMapsImport({ sourceUrl }); setCandidates(results); if (results.length === 1) setSelected(editableImport(results[0])) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossibile importare il luogo.') }
    finally { setSearching(false) }
  }
  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); if (!selected || saving) return
    setSaving(true); setError(''); setNotice('')
    try { const saved = await places.saveCatalogPlace(draftFromEditable(selected)); await loadCatalog(); setNotice(`“${saved.name}” è stato salvato nel database dei luoghi DTAgency.`); setCandidates([]); setSelected(undefined); setSourceUrl('') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossibile salvare il luogo.') }
    finally { setSaving(false) }
  }
  const beginEdit = (place: Place): void => { setError(''); setNotice(''); setEditingPlaceId(place.id); setEditingDraft(places.placeToDraft(place)) }
  const cancelEdit = (): void => { if (editingSaving) return; setEditingPlaceId(undefined); setEditingDraft(undefined) }
  const saveEdit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault(); if (!editingPlaceId || !editingDraft || editingSaving) return
    setEditingSaving(true); setError(''); setNotice('')
    try { const updated = await places.updateCatalogPlace(editingPlaceId, editingDraft); await loadCatalog(); setEditingPlaceId(undefined); setEditingDraft(undefined); setNotice(`“${updated.name}” è stato aggiornato. Le prenotazioni collegate useranno i nuovi dati.`) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossibile aggiornare il luogo.') }
    finally { setEditingSaving(false) }
  }
  const deletePlace = async (place: Place): Promise<void> => {
    if (deletingPlaceId || !window.confirm(`Eliminare “${place.name}” dal catalogo? L’operazione verrà bloccata se il luogo è ancora usato nel viaggio.`)) return
    setDeletingPlaceId(place.id); setError(''); setNotice('')
    try { await places.deleteCatalogPlace(place.id); await loadCatalog(); setNotice(`“${place.name}” è stato eliminato dal catalogo.`) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossibile eliminare il luogo.') }
    finally { setDeletingPlaceId(undefined) }
  }

  return (
    <section className="place-catalog-page" aria-labelledby="place-catalog-title">
      <header className="place-catalog-heading"><div><p className="eyebrow">Database locale</p><h1 id="place-catalog-title">Ristoranti e luoghi</h1><p>Importa un luogo partendo da Google Maps e salvalo nel Vault DTAgency come dato locale.</p></div></header>
      <section className="place-import-panel" aria-labelledby="place-import-title">
        <div><p className="eyebrow">Importazione</p><h2 id="place-import-title">Importa da Google Maps</h2><p>Incolla il link completo della scheda. DTAgency usa il nome contenuto nel link per cercare una corrispondenza su OpenStreetMap; non usa API Google a pagamento.</p></div>
        <form className="place-import-form" onSubmit={(event) => void preview(event)}><label><span>Link Google Maps</span><input type="url" required inputMode="url" placeholder="https://www.google.com/maps/place/..." value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label><button type="submit" disabled={searching}>{searching ? 'Cerco…' : 'Cerca dati gratuiti'}</button></form>
        <small className="place-import-help">I link abbreviati <code>maps.app.goo.gl</code> non sono ancora supportati: aprili nel browser e copia il link completo dalla barra degli indirizzi.</small>
        <small className="place-osm-attribution">Ricerca dati: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>.</small>
      </section>
      {error && <p className="trip-feedback trip-feedback-error" role="alert">{error}</p>}{notice && <p className="trip-feedback" role="status">{notice}</p>}
      {candidates.length > 0 && <section className="place-candidates" aria-labelledby="place-candidates-title"><div><p className="eyebrow">Corrispondenze</p><h2 id="place-candidates-title">Scegli il luogo corretto</h2></div><div className="place-candidate-list">{candidates.map((candidate) => <button type="button" className={selected?.candidate.providerPlaceId === candidate.providerPlaceId ? 'place-candidate selected' : 'place-candidate'} key={candidate.providerPlaceId} onClick={() => setSelected(editableImport(candidate))}><strong>{candidate.name}</strong><span>{detail(candidate.formattedAddress)}</span><small>{candidate.phone ? `Tel. ${candidate.phone}` : 'Telefono non disponibile'} · {candidate.openingHours ? 'Orari disponibili' : 'Orari non disponibili'}</small></button>)}</div></section>}
      {selected && <form className="place-import-review" onSubmit={(event) => void save(event)}><div><p className="eyebrow">Verifica prima di salvare</p><h2>Dati del luogo</h2></div><label><span>Nome *</span><input required maxLength={200} value={selected.name} onChange={(event) => setSelected({ ...selected, name: event.target.value })} /></label><label><span>Indirizzo</span><input maxLength={500} value={selected.formattedAddress} onChange={(event) => setSelected({ ...selected, formattedAddress: event.target.value })} /></label><label><span>Telefono</span><input type="tel" maxLength={80} value={selected.phone} onChange={(event) => setSelected({ ...selected, phone: event.target.value })} /></label><label><span>Orari</span><textarea rows={3} maxLength={1000} value={selected.openingHours} onChange={(event) => setSelected({ ...selected, openingHours: event.target.value })} /></label><small>I dati possono essere incompleti o non aggiornati. Correggili qui prima di salvarli; la copia salvata diventa un dato locale DTAgency.</small><button type="submit" disabled={saving}>{saving ? 'Salvo…' : 'Salva in DTAgency'}</button></form>}
      <section className="place-catalog-list" aria-labelledby="place-saved-title"><div><p className="eyebrow">Salvati</p><h2 id="place-saved-title">I tuoi luoghi</h2></div>
        {loading ? <p role="status">Carico i luoghi…</p> : catalog.length === 0 ? <p className="place-catalog-empty">Non hai ancora salvato luoghi.</p> : <div className="place-card-grid">{catalog.map((place) => editingPlaceId === place.id && editingDraft ? <form className="place-card place-card-edit" key={place.id} onSubmit={(event) => void saveEdit(event)}><div className="place-card-edit-heading"><div><strong>Modifica {place.name}</strong><small>Aggiorni il dato canonico usato anche dalle prenotazioni collegate.</small></div></div><label><span>Nome *</span><input required maxLength={200} value={editingDraft.name} onChange={(event) => setEditingDraft({ ...editingDraft, name: event.target.value })} /></label><label><span>Indirizzo</span><input maxLength={500} value={editingDraft.formattedAddress ?? ''} onChange={(event) => setEditingDraft({ ...editingDraft, formattedAddress: event.target.value })} /></label><label><span>Telefono</span><input type="tel" maxLength={80} value={editingDraft.phone ?? ''} onChange={(event) => setEditingDraft({ ...editingDraft, phone: event.target.value })} /></label><label><span>Orari</span><textarea rows={3} maxLength={1000} value={editingDraft.openingHours ?? ''} onChange={(event) => setEditingDraft({ ...editingDraft, openingHours: event.target.value })} /></label><div className="place-card-edit-actions"><button type="button" disabled={editingSaving} onClick={cancelEdit}>Annulla</button><button type="submit" disabled={editingSaving}>{editingSaving ? 'Salvo…' : 'Salva modifiche'}</button></div></form> : <article className="place-card" key={place.id}><div><strong>{place.name}</strong><span>{detail(place.formattedAddress)}</span></div><dl><div><dt>Telefono</dt><dd>{detail(place.phone)}</dd></div><div><dt>Orari</dt><dd>{detail(place.openingHours)}</dd></div></dl><div className="place-card-actions"><a href={googleMapsUrlForPlace(place)} target="_blank" rel="noreferrer">Apri in Google Maps ↗</a><button type="button" disabled={Boolean(editingPlaceId) || Boolean(deletingPlaceId)} onClick={() => beginEdit(place)}>Modifica</button><button type="button" disabled={Boolean(editingPlaceId) || Boolean(deletingPlaceId)} onClick={() => void deletePlace(place)}>{deletingPlaceId === place.id ? 'Elimino…' : 'Elimina'}</button>{place.provider === 'openstreetmap' && <small>Fonte iniziale: OpenStreetMap</small>}</div></article>)}</div>}
      </section>
    </section>
  )
}
