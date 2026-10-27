import { useEffect, useMemo, useState } from 'react'
import { geoPath, geoViewBox, stateSlug, type GeoCollection, type GeoFeature } from '../geo'
import type { ReviewItem } from '../types'

type Props = { items: ReviewItem[]; selectedState: string | null; onSelect: (state: string | null) => void; onOpen: (id: string) => void }
type Lga = { name: string; id: string }
type Ward = { name: string; lga: string }
type Count = { total: number; flagged: number }
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
const reports = (count: number) => `${count} ${count === 1 ? 'report' : 'reports'}`
const checks = (count: number) => `${count} ${count === 1 ? 'check' : 'checks'}`

function tally(items: ReviewItem[], name: (item: ReviewItem) => string | undefined): Map<string, Count> {
  const result = new Map<string, Count>()
  for (const item of items) {
    const value = name(item)
    if (!value) continue
    const key = normalize(value), current = result.get(key) ?? { total: 0, flagged: 0 }
    current.total++
    if (item.flags.length) current.flagged++
    result.set(key, current)
  }
  return result
}
function shade(value: Count | undefined, layer: 'reports' | 'flags', maximum: number): string {
  if (!value) return '#e9efe9'
  const count = layer === 'reports' ? value.total : value.flagged
  if (!count) return '#dbe8de'
  const opacity = .28 + .7 * count / maximum
  return layer === 'reports' ? `rgba(0, 112, 72, ${opacity})` : `rgba(190, 108, 30, ${opacity})`
}
function keyboardActivate(event: React.KeyboardEvent<SVGPathElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action() }
}

export function GeoExplorer({ items, selectedState, onSelect, onOpen }: Props) {
  const [states, setStates] = useState<GeoCollection | null>(null)
  const [lgaData, setLgaData] = useState<{ state: string; data: GeoCollection<Lga> } | null>(null)
  const [wardData, setWardData] = useState<{ state: string; data: GeoCollection<Ward> } | null>(null)
  const [selectedLga, setSelectedLga] = useState<string | null>(null)
  const [selectedWard, setSelectedWard] = useState<string | null>(null)
  const [errorData, setErrorData] = useState<{ key: string; message: string } | null>(null)
  const [layer, setLayer] = useState<'reports' | 'flags'>('reports')

  useEffect(() => {
    let active = true
    fetch('/nigeria-adm1.geojson').then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<GeoCollection> })
      .then(value => { if (active) setStates(value) }).catch(() => { if (active) setErrorData({ key: 'national', message: 'State boundaries could not load. The report queue still works.' }) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!selectedState) return
    let active = true
    fetch(`/geo/lgas/${stateSlug(selectedState)}.json`).then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<GeoCollection<Lga>> })
      .then(value => { if (active) setLgaData({ state: selectedState, data: value }) }).catch(() => { if (active) setErrorData({ key: selectedState, message: 'LGA boundaries could not load for this state.' }) })
    return () => { active = false }
  }, [selectedState])
  useEffect(() => {
    if (!selectedState || !selectedLga) return
    let active = true
    fetch(`/geo/wards/${stateSlug(selectedState)}.json`).then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<GeoCollection<Ward>> })
      .then(value => { if (active) setWardData({ state: selectedState, data: value }) }).catch(() => { if (active) setErrorData({ key: `${selectedState}/${selectedLga}`, message: 'Ward boundaries could not load for this area.' }) })
    return () => { active = false }
  }, [selectedState, selectedLga])

  const stateItems = selectedState ? items.filter(item => normalize(item.payload.data.state ?? '') === normalize(selectedState)) : []
  const lgas = lgaData?.state === selectedState ? lgaData.data : null
  const wards = wardData?.state === selectedState ? wardData.data : null
  const errorKey = selectedLga ? `${selectedState}/${selectedLga}` : selectedState ?? 'national'
  const error = errorData?.key === errorKey ? errorData.message : ''
  const lgaItems = selectedLga ? stateItems.filter(item => normalize(item.payload.data.lga ?? '') === normalize(selectedLga)) : stateItems
  const filtered = selectedWard ? lgaItems.filter(item => normalize(item.payload.data.ward ?? '') === normalize(selectedWard)) : lgaItems
  const stateCounts = useMemo(() => tally(items, item => item.payload.data.state), [items])
  const lgaCounts = tally(stateItems, item => item.payload.data.lga)
  const wardCounts = tally(lgaItems, item => item.payload.data.ward)
  const counts = selectedLga ? wardCounts : selectedState ? lgaCounts : stateCounts
  const maximum = Math.max(1, ...Array.from(counts.values(), value => layer === 'reports' ? value.total : value.flagged))
  const stateFeature = states?.features.find(feature => feature.properties.shapeName === selectedState)
  const lgaFeature = lgas?.features.find(feature => feature.properties.name === selectedLga)
  const features: GeoFeature<{ shapeName: string } | Lga | Ward>[] | null = selectedLga
    ? wards?.features.filter(feature => feature.properties.lga === selectedLga) ?? null
    : selectedState ? lgas?.features ?? null : states?.features ?? null
  const outline = selectedLga ? lgaFeature : selectedState ? stateFeature : null
  const viewBox = outline ? geoViewBox(outline) : '0 0 620 500'
  const level = selectedLga ? 'ward' : selectedState ? 'LGA' : 'state'
  const locationTitle = selectedWard ?? selectedLga ?? selectedState ?? 'Nigeria'

  function selectState(state: string | null) { setSelectedWard(null); setSelectedLga(null); onSelect(state) }
  function selectLga(lga: string | null) { setSelectedWard(null); setSelectedLga(lga) }
  function activate(name: string) {
    if (!selectedState) selectState(name)
    else if (!selectedLga) selectLga(name)
    else setSelectedWard(selectedWard === name ? null : name)
  }
  function featureName(feature: GeoFeature<{ shapeName: string } | Lga | Ward>) { return 'shapeName' in feature.properties ? feature.properties.shapeName : feature.properties.name }
  const regionalItems = selectedLga ? lgaItems : stateItems
  const regionalChecks = regionalItems.filter(item => item.flags.length).length
  const listedFeatures = selectedLga ? features : selectedState ? lgas?.features : null

  return <div className="geo-layout">
    <section className="surface geo-main">
      <div className="surface-heading"><div><span className="eyebrow">Geographic explorer</span><h2>{selectedLga ? `${selectedLga} wards` : selectedState ? `${selectedState} LGAs` : 'Where reports have arrived'}</h2><p>{selectedState ? 'Choose a boundary to narrow the report list. The outlines are geographic context, not election results.' : 'Latest received reports by state. Areas without a report stay neutral.'}</p></div>
        <div className="segmented" aria-label="Map layer"><button className={layer === 'reports' ? 'selected' : ''} onClick={() => setLayer('reports')}>Reports</button><button className={layer === 'flags' ? 'selected' : ''} onClick={() => setLayer('flags')}>Checks</button></div>
      </div>
      <nav className="geo-breadcrumb" aria-label="Map location"><button onClick={() => selectState(null)} aria-current={!selectedState ? 'location' : undefined}>Nigeria</button>{selectedState && <><span>›</span><button onClick={() => selectLga(null)} aria-current={!selectedLga ? 'location' : undefined}>{selectedState}</button></>}{selectedLga && <><span>›</span><strong>{selectedLga}</strong></>}</nav>
      {features ? <svg key={`${selectedState ?? 'national'}-${selectedLga ?? 'all'}`} className="nigeria-map map-drill" viewBox={viewBox} role="img" aria-label={`${locationTitle}: interactive ${level} boundaries`}>
        {outline && <path className="map-outline" d={geoPath(outline)} />}
        {features.map((feature, index) => { const name = featureName(feature), count = counts.get(normalize(name)), active = selectedWard === name; return <path key={`${name}-${index}`} d={geoPath(feature)} fill={shade(count, layer, maximum)} className={active ? 'selected' : ''} tabIndex={0} role="button" aria-label={`${name}: ${reports(count?.total ?? 0)}, ${checks(count?.flagged ?? 0)} from arithmetic`} onClick={() => activate(name)} onKeyDown={event => keyboardActivate(event, () => activate(name))}><title>{name} · {reports(count?.total ?? 0)} · {checks(count?.flagged ?? 0)} from arithmetic</title></path> })}
      </svg> : <div className="map-loading">{error || `Loading ${level} boundaries…`}</div>}
      <div className="map-foot"><span>Shading shows {layer === 'reports' ? 'received report volume' : 'reports with arithmetic checks'}, not election outcomes.</span><a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">State/LGA: geoBoundaries · CC BY 4.0</a>{selectedLga && <a href="https://data.grid3.org/" target="_blank" rel="noreferrer">Wards: GRID3 · CC BY-SA 4.0</a>}</div>
      {selectedLga && <p className="map-caution">Ward outlines are operational and may not match official electoral wards exactly.</p>}
    </section>
    <aside className="surface geo-side"><div className="surface-heading"><div><span className="eyebrow">Regional detail</span><h2>{locationTitle}</h2></div>{selectedState && <button className="text-button" onClick={() => selectedLga ? selectLga(null) : selectState(null)}>Back</button>}</div>
      {selectedState ? <><div className="geo-summary"><strong>{regionalItems.length}</strong><span>received reports</span><strong>{regionalChecks}</strong><span>with arithmetic checks</span><strong>{regionalItems.length ? Math.round(regionalChecks / regionalItems.length * 100) : 0}%</strong><span>of received reports with checks</span></div>
        {listedFeatures && <div className="geo-boundary-list"><h3>{selectedLga ? `Wards · ${listedFeatures.length}` : `LGAs · ${listedFeatures.length}`}</h3><ul className="region-list">{listedFeatures.map((feature, index) => { const name = featureName(feature), localCount = counts.get(normalize(name)); return <li key={`${name}-${index}`}><button onClick={() => activate(name)} className={selectedWard === name ? 'active' : ''}><span>{name}</span><strong>{localCount?.total ?? 0}</strong><small>{(localCount?.total ?? 0) === 1 ? 'report' : 'reports'}</small></button></li> })}</ul></div>}
        {filtered.length ? <><h3>Received reports {selectedWard && `· ${selectedWard}`}</h3><ul className="geo-report-list">{filtered.map(item => <li key={item.report_id}><button onClick={() => onOpen(item.report_id)}><strong>{item.payload.data.unit_id} · {item.report_id.slice(0, 8)}</strong><span>{item.flags.length ? checks(item.flags.length) : 'No arithmetic checks'} · {item.review?.decision.replace('_', ' ') ?? 'Awaiting review'}</span></button></li>)}</ul></> : <p className="empty-inline">No received reports for this selection.</p>}</>
        : stateCounts.size ? <><p className="help">Choose a state on the map or from this list.</p><ul className="region-list">{Array.from(stateCounts.entries()).sort((a, b) => b[1].total - a[1].total).map(([key, value]) => { const name = states?.features.find(feature => normalize(feature.properties.shapeName) === key)?.properties.shapeName ?? key; return <li key={key}><button onClick={() => selectState(name)}><span>{name}</span><strong>{value.total}</strong><small>{value.flagged} checks</small></button></li> })}</ul></>
          : <p className="empty-inline">No reports have a state label yet. New submissions can include one.</p>}
      <p className="map-caution">A higher count of checks may reflect more reporting, not more irregularities. Compare it with the number of reports received.</p>
    </aside>
  </div>
}
