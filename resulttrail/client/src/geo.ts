export const STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'Abuja Federal Capital Territory',
  'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara',
  'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
] as const

export type GeoFeature<P extends object = { shapeName: string }> = {
  type: 'Feature'
  properties: P
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
}
export type GeoCollection<P extends object = { shapeName: string }> = { type: 'FeatureCollection'; features: GeoFeature<P>[] }

const project = ([lon, lat]: number[]): [number, number] => [(lon - 2.5) / 12.4 * 620, (14.1 - lat) / 10.1 * 500]
const point = (coordinate: number[]) => project(coordinate).map(value => value.toFixed(1)).join(',')
export const stateSlug = (state: string) => state.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export function geoPath(feature: GeoFeature<object>): string {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : feature.geometry.coordinates as number[][][][]
  return polygons.flatMap(polygon => polygon.map(ring => `M${ring.map(point).join('L')}Z`)).join('')
}
export function geoViewBox(feature: GeoFeature<object>): string {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates as number[][][]]
    : feature.geometry.coordinates as number[][][][]
  const points = polygons.flatMap(polygon => polygon.flatMap(ring => ring.map(project)))
  const xs = points.map(point => point[0]), ys = points.map(point => point[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = Math.max(maxX - minX, maxY - minY) * .08
  return `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + 2 * pad).toFixed(1)} ${(maxY - minY + 2 * pad).toFixed(1)}`
}
