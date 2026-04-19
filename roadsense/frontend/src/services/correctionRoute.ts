import type { LngLatTuple } from '../lib/bengaluruRouting'
import type { CorrectionRoutePayload } from '../types/safety'

/**
 * Merge backend correction plan with local route context (distance along polyline).
 */
export function enrichCorrectionWithRoute(
  backend: CorrectionRoutePayload | null,
  remainingMeters: number,
  etaRemainingSec: number,
): CorrectionRoutePayload | null {
  if (!backend) return null
  return {
    ...backend,
    rejoin_eta_sec: backend.rejoin_eta_sec ?? etaRemainingSec,
    steps: backend.steps.map((s, i) =>
      i === 0 && s.distance_m == null
        ? { ...s, distance_m: Math.min(50, Math.max(20, remainingMeters * 0.08)) }
        : s,
    ),
  }
}

/** Bearing from first segment of polyline for "expected" flow display */
export function bearingFromPolyline(points: LngLatTuple[]): number | null {
  if (points.length < 2) return null
  const [a, b] = [points[0], points[1]]
  const toRad = (x: number) => (x * Math.PI) / 180
  const toDeg = (x: number) => (x * 180) / Math.PI
  const [lon1, lat1] = a.map(toRad) as [number, number]
  const [lon2, lat2] = b.map(toRad) as [number, number]
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}
