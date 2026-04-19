import { type SimVehicle3D } from '../components/DrivingScene3D'

const API_BASE = 'http://127.0.0.1:8011'

export type TrafficBackendResponse = {
  vehicles: Array<{
    id: string
    lane: 'left' | 'right'
    t: number
    dir: 1 | -1
    speed: number
    position: number
  }>
  traffic: {
    density: string
    alerts: any[]
  }
}

export async function fetchLocalTraffic(egoPositionMeters: number, routeLengthMeters: number, reset: boolean = false): Promise<TrafficBackendResponse> {
  const url = new URL(`${API_BASE}/api/traffic`)
  url.searchParams.set('ego_position', egoPositionMeters.toString())
  url.searchParams.set('route_length', routeLengthMeters.toString())
  if (reset) {
    url.searchParams.set('reset', 'true')
  }

  const response = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch traffic: ${response.status}`)
  }

  return response.json()
}
