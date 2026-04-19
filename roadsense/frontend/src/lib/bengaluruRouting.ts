/** Bengaluru bounding box for Photon: west,south,east,north */
const BLR_BBOX = '77.40,12.79,77.78,13.14'

export type LngLatTuple = readonly [number, number]

export type BengaluruPlace = {
  coords: LngLatTuple
  label: string
}

export type RouteStep = {
  instruction: string
  distanceMeters: number
}

export type DrivingRoute = {
  coordinates: LngLatTuple[]
  distanceMeters: number
  durationSec: number
  steps: RouteStep[]
}

function compactPlaceLabel(parts: Array<string | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index)
    .slice(0, 3)
    .join(', ')
}

function formatOsrmInstruction(step: {
  name?: string
  maneuver?: { type?: string; modifier?: string }
}) {
  const type = step.maneuver?.type ?? 'continue'
  const modifier = step.maneuver?.modifier
  const roadName = step.name?.trim()

  if (type === 'depart') return roadName ? `Start on ${roadName}` : 'Start'
  if (type === 'arrive') return 'Arrive at destination'
  if (type === 'roundabout') return 'Enter the roundabout'
  if (type === 'end of road') return modifier ? `At the end, turn ${modifier}` : 'At the end of the road'
  if (type === 'fork') return modifier ? `Keep ${modifier}` : 'Keep ahead'
  if (type === 'merge') return modifier ? `Merge ${modifier}` : 'Merge ahead'
  if (type === 'turn') return roadName ? `Turn ${modifier ?? 'ahead'} onto ${roadName}` : `Turn ${modifier ?? 'ahead'}`
  if (type === 'new name') return roadName ? `Continue onto ${roadName}` : 'Continue'
  if (type === 'continue')
    return roadName ? `Continue ${modifier ?? 'ahead'} on ${roadName}` : `Continue ${modifier ?? 'ahead'}`

  return roadName ? `Proceed on ${roadName}` : 'Proceed'
}

export async function geocodeBengaluru(query: string): Promise<BengaluruPlace | null> {
  const q = query.trim()
  if (!q) return null

  // Fast-path: Check if user passed explicit "Lat, Lng" string from the useCurrentLocation integration
  if (q.includes(',')) {
    const parts = q.split(',')
    const lat = parseFloat(parts[0])
    const lng = parseFloat(parts[1])
    if (!isNaN(lat) && !isNaN(lng)) {
      return { coords: [lng, lat] as const, label: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})` }
    }
  }

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(`${q} Bengaluru Karnataka`)}&bbox=${BLR_BBOX}&limit=1&lang=en`
  const r = await fetch(url)
  if (!r.ok) return null
  const j = (await r.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] }
      properties?: {
        name?: string
        street?: string
        suburb?: string
        district?: string
        city?: string
      }
    }>
  }
  const feature = j.features?.[0]
  const c = feature?.geometry?.coordinates
  if (!c || c.length < 2) return null
  const label =
    compactPlaceLabel([
      feature?.properties?.name,
      feature?.properties?.street,
      feature?.properties?.suburb,
      feature?.properties?.district,
      feature?.properties?.city,
    ]) || q
  return { coords: [c[0], c[1]] as const, label }
}

export async function fetchDrivingRouteOsrm(from: LngLatTuple, to: LngLatTuple): Promise<DrivingRoute> {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&steps=true`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Routing service error (${r.status})`)
  const j = (await r.json()) as {
    routes?: Array<{
      distance?: number
      duration?: number
      geometry?: { coordinates?: [number, number][] }
      legs?: Array<{
        steps?: Array<{
          distance?: number
          name?: string
          maneuver?: { type?: string; modifier?: string }
        }>
      }>
    }>
    code?: string
  }
  if (j.code === 'NoRoute') throw new Error('No driving route found between these places.')
  const route = j.routes?.[0]
  const coords = route?.geometry?.coordinates
  if (!coords || coords.length < 2) throw new Error('No route geometry returned.')
  const steps =
    route?.legs?.flatMap((leg) =>
      (leg.steps ?? []).map((step) => ({
        instruction: formatOsrmInstruction(step),
        distanceMeters: step.distance ?? 0,
      })),
    ) ?? []

  return {
    coordinates: coords.map(([lng, lat]) => [lng, lat] as const),
    distanceMeters: route?.distance ?? 0,
    durationSec: route?.duration ?? 0,
    steps,
  }
}

/** Fallback path in central Bengaluru when offline / first paint */
export const DEFAULT_BENGALURU_ROUTE: LngLatTuple[] = [
  [77.5946, 12.9716],
  [77.5982, 12.9698],
  [77.6045, 12.9675],
  [77.6108, 12.9652],
  [77.6185, 12.9615],
  [77.6265, 12.9575],
  [77.635, 12.9355],
  [77.641, 12.925],
]
