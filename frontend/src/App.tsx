import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, {
  type LngLatLike,
  type Map as MapLibreMap,
  type StyleSpecification,
} from 'maplibre-gl'
import { DashboardLayout } from './components/dashboard/DashboardLayout'
import * as offlineMode from './services/offlineMode'
import { enrichCorrectionWithRoute } from './services/correctionRoute'
import { useSafetyStore } from './store/safetyStore'
import type { SafetyFrontendSimResponse, WsSafetyUpdate } from './types/safety'
import { type TrafficCarSnapshot } from './lib/traffic/Car'
import { type LaneKey } from './lib/traffic/config'
import { fetchLocalTraffic } from './services/api'
import {
  DEFAULT_BENGALURU_ROUTE,
  fetchDrivingRouteOsrm,
  geocodeBengaluru,
  type RouteStep,
} from './lib/bengaluruRouting'

type LngLat = readonly [number, number]
type RouteSummary = {
  fromLabel: string
  toLabel: string
  totalDistanceMeters: number
  totalDurationSec: number
  steps: RouteStep[]
}

type DetectorScenario = {
  id: number
  name: string
  description: string
}

type DetectorVehicle = {
  vehicle_id: string
  lat: number
  lon: number
  speed_kmh: number
  bearing: number
  alert_active: boolean
  suspicion_active: boolean
  confidence: number
  heading_deviation: number
  attack_class: string
  label?: string
}

type AtRiskVehicle = {
  vehicle_id: string
  lat: number
  lon: number
  closing_speed_kmh: number
  estimated_ttc_sec: number
  risk_score: number
}

type DetectorAlert = {
  alert_id: string
  vehicle_id: string
  lat: number
  lon: number
  heading_deviation: number
  confidence: number
  attack_class: string
  timestamp: number
  alert_type: string
  vehicles_at_risk: AtRiskVehicle[]
}

type DetectorStatus = {
  sim_running: boolean
  current_scenario: number
  consensus_enabled: boolean
  vehicle_count: number
  alert_count: number
  frontend_vehicle_count: number
  frontend_nearby_count: number
  frontend_same_direction_nearby: number
  frontend_opposite_direction_nearby: number
  closest_vehicle_id: string | null
  closest_distance_m: number | null
}

type SimVehicle = TrafficCarSnapshot

const LANE_STATUS_WINDOW_T = 0.18
const DETECTION_API_BASE = 'http://127.0.0.1:8011'
const DETECTION_WS_URL = 'ws://127.0.0.1:8011/ws'
const SAFETY_POLL_INTERVAL_MS = 600

function tDistance(a: number, b: number) {
  const d = Math.abs(a - b)
  return Math.min(d, 1 - d)
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function haversineMeters(a: LngLat, b: LngLat) {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function bearingDeg(a: LngLat, b: LngLat) {
  if (!a || !b || !Array.isArray(a) || !Array.isArray(b)) return 0
  const toRad = (x: number) => (x * Math.PI) / 180
  const toDeg = (x: number) => (x * 180) / Math.PI
  const [lon1, lat1] = a.map(toRad) as unknown as [number, number]
  const [lon2, lat2] = b.map(toRad) as unknown as [number, number]
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360
  return brng
}

function buildRouteLUT(points: LngLat[]) {
  const segLens: number[] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const d = haversineMeters(points[i], points[i + 1])
    segLens.push(d)
    total += d
  }
  const cum: number[] = [0]
  for (const d of segLens) cum.push(cum[cum.length - 1] + d)
  return { segLens, cum, total }
}

function sampleRoute(points: LngLat[], t: number) {
  if (!points || points.length === 0) {
    return { lngLat: [0, 0] as const, bearing: 0 }
  }
  const { cum, total } = buildRouteLUT(points)
  const dist = clamp(t, 0, 1) * total
  let seg = 0
  while (seg < cum.length - 1 && cum[seg + 1] < dist) seg++
  const a = points[seg] || points[0]
  const b = points[Math.min(seg + 1, points.length - 1)] || points[0]
  const segStart = cum[seg]
  const segEnd = cum[seg + 1] ?? total
  const segT = segEnd === segStart ? 0 : (dist - segStart) / (segEnd - segStart)
  const lng = (a[0] ?? 0) + ((b[0] ?? 0) - (a[0] ?? 0)) * segT
  const lat = (a[1] ?? 0) + ((b[1] ?? 0) - (a[1] ?? 0)) * segT
  return {
    lngLat: [lng, lat] as const,
    bearing: bearingDeg(a, b),
  }
}

function kmhToMps(kmh: number) {
  return kmh / 3.6
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`
  return `${Math.round(distanceMeters)} m`
}

function formatDuration(durationSec: number) {
  const totalMinutes = Math.max(1, Math.round(durationSec / 60))
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  return `${totalMinutes} min`
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${DETECTION_API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Request failed: ${response.status}`)
  }
  return (await response.json()) as T
}

function osmRasterStyle(): StyleSpecification {
  const style = {
    version: 8 as const,
    sources: {
      osm: {
        type: 'raster' as const,
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster' as const,
        source: 'osm',
      },
    ],
  } satisfies StyleSpecification

  return style
}

export function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const routePointsRef = useRef<LngLat[]>([...DEFAULT_BENGALURU_ROUTE])
  const lastMapSyncRef = useRef(0)
  const carTRef = useRef(0.06)
  const carDistanceMetersRef = useRef(buildRouteLUT([...DEFAULT_BENGALURU_ROUTE]).total * 0.06)

  const [trafficDensity, setTrafficDensity] = useState('low')

  const [isAutoDrive, setIsAutoDrive] = useState(false)
  const isAutoDriveRef = useRef(false)
  const collisionStateRef = useRef(false)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)
  const vehiclesRef = useRef<SimVehicle[]>([])

  const frontendSimRef = useRef<{
    timestamp: number
    ego: {
      vehicle_id: string
      lat: number
      lon: number
      speed_kmh: number
      bearing: number
    }
    vehicles: Array<{
      vehicle_id: string
      lat: number
      lon: number
      speed_kmh: number
      bearing: number
      lane: LaneKey
      dir: 1 | -1
    }>
  } | null>(null)

  const [drivingEnabled, setDrivingEnabled] = useState(true)
  const [speedKmh, setSpeedKmh] = useState(52)
  const speedRef = useRef(52)
  const [laneOffset, setLaneOffset] = useState(2.0)

  // Keyboard state for smooth control
  const keysControl = useRef({ up: false, down: false })
  const targetLaneRef = useRef(2.0) // Standard right lane (2.0)

  const [routePoints, setRoutePoints] = useState<LngLat[]>(() => [...DEFAULT_BENGALURU_ROUTE])
  routePointsRef.current = routePoints

  const [fromQuery, setFromQuery] = useState('Cubbon Park')
  const [toQuery, setToQuery] = useState('Koramangala 5th Block')
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeErr, setRouteErr] = useState<string | null>(null)
  const [activeRouteLabel, setActiveRouteLabel] = useState<string>('Bengaluru | sample corridor')
  const [routeSummary, setRouteSummary] = useState<RouteSummary>({
    fromLabel: 'Cubbon Park',
    toLabel: 'Koramangala 5th Block',
    totalDistanceMeters: buildRouteLUT([...DEFAULT_BENGALURU_ROUTE]).total,
    totalDurationSec: 18 * 60,
    steps: [{ instruction: 'Head south-east through Bengaluru', distanceMeters: 500 }],
  })

  const [carT, setCarT] = useState(0.06)
  carTRef.current = carT
  const car = useMemo(() => sampleRoute(routePoints, carT), [routePoints, carT])
  const egoLane: LaneKey = laneOffset < -0.33 ? 'left' : laneOffset < 0.33 ? 'middle' : 'right'

  const routeMeters = useMemo(() => buildRouteLUT(routePoints).total, [routePoints])
  const remainingMeters = useMemo(() => (1 - carT) * routeMeters, [carT, routeMeters])
  const remainingKm = remainingMeters / 1000
  const estimatedRemainingSec = useMemo(
    () => routeSummary.totalDurationSec * (routeMeters > 0 ? remainingMeters / routeMeters : 0),
    [routeSummary.totalDurationSec, routeMeters, remainingMeters],
  )

  const routeCurvature = useMemo(() => {
    if (routePoints.length < 2) return 0
    const t0 = clamp(carT, 0, 1)
    const t1 = clamp(carT + 0.02, 0, 1)
    const b0 = sampleRoute(routePoints, t0).bearing
    const b1 = sampleRoute(routePoints, t1).bearing
    let d = b1 - b0
    while (d > 180) d -= 360
    while (d < -180) d += 360
    return clamp(d / 40, -1, 1)
  }, [routePoints, carT])

  const turnHint = useMemo(() => {
    if (routeCurvature < -0.18) return 'Curve left ahead'
    if (routeCurvature > 0.18) return 'Curve right ahead'
    return 'Straight'
  }, [routeCurvature])

  const nextRouteStep = useMemo(() => {
    const stepProgress = clamp(carT, 0, 0.999)
    const stepIndex = Math.min(
      routeSummary.steps.length - 1,
      Math.floor(stepProgress * Math.max(routeSummary.steps.length, 1)),
    )
    return routeSummary.steps[stepIndex] ?? null
  }, [carT, routeSummary.steps])

  const [vehicles, _setVehicles] = useState<SimVehicle[]>([])
  const setVehicles = useCallback((val: SimVehicle[] | ((prev: SimVehicle[]) => SimVehicle[])) => {
    if (typeof val === 'function') {
      _setVehicles((prev) => {
        const next = val(prev)
        vehiclesRef.current = next
        return next
      })
    } else {
      vehiclesRef.current = val
      _setVehicles(val)
    }
  }, [])
  const [detectorScenarios, setDetectorScenarios] = useState<DetectorScenario[]>([])
  const [detectorStatus, setDetectorStatus] = useState<DetectorStatus>({
    sim_running: false,
    current_scenario: 1,
    consensus_enabled: true,
    vehicle_count: 0,
    alert_count: 0,
    frontend_vehicle_count: 0,
    frontend_nearby_count: 0,
    frontend_same_direction_nearby: 0,
    frontend_opposite_direction_nearby: 0,
    closest_vehicle_id: null,
    closest_distance_m: null,
  })
  const [detectorVehicles, setDetectorVehicles] = useState<DetectorVehicle[]>([])
  const [activeAlerts, setActiveAlerts] = useState<DetectorAlert[]>([])
  const [recentAlerts, setRecentAlerts] = useState<DetectorAlert[]>([])
  const [detectorHealth, setDetectorHealth] = useState<'checking' | 'online' | 'offline'>('checking')
  const [detectorError, setDetectorError] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [simTimeSec, setSimTimeSec] = useState(0)
  const [simTick, setSimTick] = useState(0)
  const [detectorBusy, setDetectorBusy] = useState(false)
  const [intruderInjectTick, setIntruderInjectTick] = useState(0)

  const wrongWayApi = useSafetyStore((s) => s.wrongWay) ?? {
    active: false, confidence: 0, current_heading: 0, expected_heading: 0,
    heading_delta: 0, nearby_count: 0, majority_support: 0, reason: 'idle',
  }
  const collisionBundle = useSafetyStore((s) => s.collisionBundle) ?? null
  const roadIntelligence = useSafetyStore((s) => s.roadIntelligence) ?? null
  const roadWarning = useSafetyStore((s) => s.roadWarning) ?? { active: false, reason: 'ok' }
  const correctionRouteStore = useSafetyStore((s) => s.correctionRoute) ?? null
  const osmCheck = useSafetyStore((s) => s.osmCheck)
  const roadWorks = useSafetyStore((s) => s.roadWorks)
  const falsePositiveAnalysis = useSafetyStore((s) => s.falsePositiveAnalysis)
  const setSafetyFromSim = useSafetyStore((s) => s.setSafetyFromSim)
  const setSafetyAnalysisStale = useSafetyStore((s) => s.setSafetyAnalysisStale)
  const soundEnabled = useSafetyStore((s) => s.soundEnabled) ?? true
  const setSoundEnabledStore = useSafetyStore((s) => s.setSoundEnabled)
  const theme = useSafetyStore((s) => s.theme) ?? 'dark'
  const setTheme = useSafetyStore((s) => s.setTheme)

  const [online, setOnline] = useState(() => navigator.onLine)
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null)
  const [safetyTimeSlot, setSafetyTimeSlot] = useState(0)

  const injectIntruder = useCallback(() => {
    setIntruderInjectTick((t) => t + 1)
    setSafetyFromSim({
      wrongWay: {
        active: true,
        confidence: 95,
        current_heading: 180,
        expected_heading: 0,
        heading_delta: 180,
        nearby_count: 1,
        majority_support: 1,
        reason: 'INTRUDER_DETECTED',
      },
    })
  }, [setSafetyFromSim])

  const onIntruderNear = useCallback(() => {
    setSafetyFromSim({
      wrongWay: {
        active: true,
        confidence: 95,
        current_heading: 180,
        expected_heading: 0,
        heading_delta: 180,
        nearby_count: 1,
        majority_support: 1,
        reason: 'INTRUDER_DETECTED',
      },
    })
  }, [setSafetyFromSim])

  useEffect(() => {
    void offlineMode.getLastSyncTime().then(setLastSyncTime)
    return offlineMode.subscribeOnline(setOnline)
  }, [])

  const laneTraffic = useMemo(() => {
    let sameDirection = 0
    let oppositeDirection = 0

    for (const vehicle of vehicles) {
      if (vehicle.lane !== egoLane) continue
      if (tDistance(vehicle.t, carT) > LANE_STATUS_WINDOW_T) continue
      if (vehicle.dir === 1) sameDirection++
      else oppositeDirection++
    }

    return { sameDirection, oppositeDirection }
  }, [vehicles, egoLane, carT])

  const isWrongLane = laneTraffic.oppositeDirection > laneTraffic.sameDirection

  // Debounce: only raise the warning after staying in wrong lane for > 1 s
  const wrongLaneTimerRef = useRef<number>(0)
  const [isWrongLaneDebounced, setIsWrongLaneDebounced] = useState(false)
  useEffect(() => {
    if (isWrongLane) {
      if (wrongLaneTimerRef.current === 0) {
        wrongLaneTimerRef.current = window.setTimeout(() => {
          wrongLaneTimerRef.current = 0
          setIsWrongLaneDebounced(true)
        }, 1000)
      }
    } else {
      window.clearTimeout(wrongLaneTimerRef.current)
      wrongLaneTimerRef.current = 0
      setIsWrongLaneDebounced(false)
    }
  }, [isWrongLane])

  const dangerZoneGeoJson = useMemo(() => {
    const show = wrongWayApi.active || isWrongLane
    if (!show) {
      return { type: 'FeatureCollection' as const, features: [] as object[] }
    }
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'Point' as const,
            coordinates: [car.lngLat[0], car.lngLat[1]] as [number, number],
          },
        },
      ],
    }
  }, [wrongWayApi.active, isWrongLane, car.lngLat])

  const correctionPlan = useMemo(
    () =>
      enrichCorrectionWithRoute(correctionRouteStore, remainingMeters, estimatedRemainingSec),
    [correctionRouteStore, remainingMeters, estimatedRemainingSec],
  )

  const routeGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routePoints.map(([lng, lat]) => [lng, lat]),
          },
        },
      ],
    }),
    [routePoints],
  )

  const carGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Point',
            coordinates: car.lngLat,
          },
        },
      ],
    }),
    [car.lngLat],
  )

  const routeAheadGeoJson = useMemo(() => {
    const points: LngLat[] = []
    const samples = 24
    for (let i = 0; i <= samples; i++) {
      const t = clamp(carT + (i / samples) * 0.12, 0, 1)
      points.push(sampleRoute(routePoints, t).lngLat)
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: points.map(([lng, lat]) => [lng, lat]),
          },
        },
      ],
    }
  }, [carT, routePoints])

  const detectorVehiclesGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: detectorVehicles.map((vehicle) => ({
        type: 'Feature',
        properties: {
          vehicleId: vehicle.vehicle_id,
          speed: Math.round(vehicle.speed_kmh),
          label: vehicle.label ?? 'normal',
          severity: vehicle.alert_active ? 'alert' : vehicle.suspicion_active ? 'suspicion' : 'normal',
        },
        geometry: {
          type: 'Point',
          coordinates: [vehicle.lon, vehicle.lat],
        },
      })),
    }),
    [detectorVehicles],
  )

  const detectorAlertsGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: activeAlerts.map((alert) => ({
        type: 'Feature',
        properties: {
          alertId: alert.alert_id,
          vehicleId: alert.vehicle_id,
          confidence: alert.confidence,
          attackClass: alert.attack_class,
          alertType: alert.alert_type,
        },
        geometry: {
          type: 'Point',
          coordinates: [alert.lon, alert.lat],
        },
      })),
    }),
    [activeAlerts],
  )

  useEffect(() => {
    const egoDistance = routeMeters * carTRef.current
    carDistanceMetersRef.current = egoDistance

    // Initial fetch/reset
    fetchLocalTraffic(egoDistance, routeMeters, true)
      .then(res => {
        setVehicles(res.vehicles.map(v => ({
          ...v,
          speed: v.speed / 3.6, // convert km/h to m/s for extrapolation
          maxSpeed: v.speed / 3.6,
          acceleration: 0,
          meshRef: null,
        })))
        setTrafficDensity(res.traffic.density)
      })
      .catch(console.error)

    // Polling interval
    const interval = setInterval(() => {
      if (!drivingEnabled) return
      fetchLocalTraffic(carDistanceMetersRef.current, routeMeters, false)
        .then(res => {
          setVehicles(res.vehicles.map(v => ({
            ...v,
            speed: v.speed / 3.6,
            maxSpeed: v.speed / 3.6,
            acceleration: 0,
            meshRef: null,
          })))
          setTrafficDensity(res.traffic.density)
        })
        .catch(err => {
          console.error('Traffic API Error:', err)
          setTrafficDensity('OFFLINE')
          setVehicles([]) // Flush vehicles to stop ghost dead-reckoning
        })
    }, SAFETY_POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [routeMeters, drivingEnabled])

  useEffect(() => {
    frontendSimRef.current = {
      timestamp: Date.now() / 1000,
      ego: {
        vehicle_id: 'ego',
        lat: car.lngLat[1],
        lon: car.lngLat[0],
        speed_kmh: Math.round(speedKmh * 10) / 10,
        bearing: car.bearing,
      },
      vehicles: vehicles.map((vehicle) => {
        const sampled = sampleRoute(routePoints, vehicle.t)
        return {
          vehicle_id: vehicle.id,
          lat: sampled.lngLat[1],
          lon: sampled.lngLat[0],
          speed_kmh: Math.round(vehicle.speed * 3.6 * 10) / 10,
          bearing: sampled.bearing,
          lane: vehicle.lane,
          dir: vehicle.dir,
        }
      }),
    }
  }, [car.bearing, car.lngLat, routePoints, speedKmh, vehicles])

  // init map
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: osmRasterStyle(),
      center: car.lngLat as LngLatLike,
      zoom: 15,
      bearing: 0,
      pitch: 0,
      attributionControl: false,
      interactive: true,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      map.addSource('route', { type: 'geojson', data: routeGeoJson as any })
      map.addSource('route-ahead', { type: 'geojson', data: routeAheadGeoJson as any })
      map.addSource('detector-vehicles', { type: 'geojson', data: detectorVehiclesGeoJson as any })
      map.addSource('detector-alerts', { type: 'geojson', data: detectorAlertsGeoJson as any })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#93c5fd',
          'line-width': 10,
          'line-opacity': 0.42,
        },
      })
      map.addLayer({
        id: 'route-ahead-glow',
        type: 'line',
        source: 'route-ahead',
        paint: {
          'line-color': '#2563eb',
          'line-width': 16,
          'line-opacity': 0.35,
          'line-blur': 8,
        },
      })
      map.addLayer({
        id: 'route-line-core',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#3b82f6',
          'line-width': 6,
          'line-opacity': 1,
        },
      })
      map.addLayer({
        id: 'route-ahead-core',
        type: 'line',
        source: 'route-ahead',
        paint: {
          'line-color': '#1d4ed8',
          'line-width': 8,
          'line-opacity': 1,
        },
      })
      map.addLayer(
        {
          id: 'route-line-glow',
          type: 'line',
          source: 'route',
          paint: {
            'line-color': '#60a5fa',
            'line-width': 14,
            'line-opacity': 0.2,
            'line-blur': 6,
          },
        },
        'route-line',
      )

      map.addSource('car', { type: 'geojson', data: carGeoJson as any })
      map.addSource('danger-zone', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as any })
      map.addLayer({
        id: 'car-point',
        type: 'circle',
        source: 'car',
        paint: {
          'circle-color': '#2563eb',
          'circle-radius': 9,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      })
      map.addLayer({
        id: 'danger-pulse',
        type: 'circle',
        source: 'danger-zone',
        paint: {
          'circle-radius': 38,
          'circle-color': '#ef4444',
          'circle-opacity': 0.22,
          'circle-blur': 0.5,
        },
      })
      map.addLayer({
        id: 'danger-core',
        type: 'circle',
        source: 'danger-zone',
        paint: {
          'circle-radius': 12,
          'circle-color': '#ef4444',
          'circle-opacity': 0.9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fecaca',
        },
      })
      map.addLayer({
        id: 'detector-alert-halo',
        type: 'circle',
        source: 'detector-alerts',
        paint: {
          'circle-color': '#ef4444',
          'circle-radius': 18,
          'circle-opacity': 0.18,
          'circle-blur': 0.4,
        },
      })
      map.addLayer({
        id: 'detector-alert-core',
        type: 'circle',
        source: 'detector-alerts',
        paint: {
          'circle-color': [
            'match',
            ['get', 'alertType'],
            'suspicion',
            '#f59e0b',
            '#ef4444',
          ],
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff7ed',
        },
      })
      map.addLayer({
        id: 'detector-vehicles-layer',
        type: 'circle',
        source: 'detector-vehicles',
        paint: {
          'circle-color': [
            'match',
            ['get', 'severity'],
            'alert',
            '#ef4444',
            'suspicion',
            '#f59e0b',
            '#38bdf8',
          ],
          'circle-radius': [
            'match',
            ['get', 'severity'],
            'alert',
            6,
            'suspicion',
            5,
            4,
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      })
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // update map marker source + follow camera while driving
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const now = performance.now()
    if (now - lastMapSyncRef.current < 350) return
    lastMapSyncRef.current = now

    const src = map.getSource('car') as any
    if (src?.setData) src.setData(carGeoJson as any)
    const aheadSrc = map.getSource('route-ahead') as any
    if (aheadSrc?.setData) aheadSrc.setData(routeAheadGeoJson as any)
  }, [car.bearing, car.lngLat, carGeoJson, drivingEnabled, routeAheadGeoJson])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const vehiclesSrc = map.getSource('detector-vehicles') as maplibregl.GeoJSONSource | undefined
    if (vehiclesSrc && typeof vehiclesSrc.setData === 'function') {
      vehiclesSrc.setData(detectorVehiclesGeoJson as any)
    }

    const alertsSrc = map.getSource('detector-alerts') as maplibregl.GeoJSONSource | undefined
    if (alertsSrc && typeof alertsSrc.setData === 'function') {
      alertsSrc.setData(detectorAlertsGeoJson as any)
    }
  }, [detectorVehiclesGeoJson, detectorAlertsGeoJson])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const src = map.getSource('danger-zone') as maplibregl.GeoJSONSource | undefined
    if (src && typeof src.setData === 'function') {
      src.setData(dangerZoneGeoJson as never)
    }
  }, [dangerZoneGeoJson])

  // Keep map route polyline + bounds in sync when OSRM path changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const apply = () => {
      const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined
      if (src && typeof src.setData === 'function') {
        src.setData(routeGeoJson as any)
      }
      if (routePoints.length >= 2) {
        const lngs = routePoints.map((p) => p[0])
        const lats = routePoints.map((p) => p[1])
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 52, duration: 0, maxZoom: 15.5 },
        )
      }
    }

    if (map.loaded()) apply()
    else map.once('load', apply)
  }, [routePoints, routeGeoJson])

  // simulation loop
  useEffect(() => {
    if (!drivingEnabled) return

    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.08, (now - last) / 1000)
      last = now

      const lut = buildRouteLUT(routePointsRef.current)
      if (lut.total < 1) {
        raf = requestAnimationFrame(tick)
        return
      }

      let currentSpeed = speedRef.current

      if (collisionStateRef.current) {
        currentSpeed = 0
      } else if (isAutoDriveRef.current) {
        const myLane = targetLaneRef.current < 0 ? 'left' : 'right'
        let minDist = Infinity
        let targetSpeedMatch = Infinity

        vehiclesRef.current.forEach(v => {
          if (v.lane === myLane && v.dir === 1) {
            let gap = (v.t * lut.total) - carDistanceMetersRef.current
            if (gap < 0) gap += lut.total
            if (gap > 0 && gap < 70 && gap < minDist) {
              minDist = gap
              targetSpeedMatch = v.speed * 3.6 // convert back to km/h
            }
          }
        })

        const speedLimit = 85
        let desired = speedLimit

        if (minDist < 40) {
          desired = targetSpeedMatch * 0.9
        }

        currentSpeed += (desired - currentSpeed) * 0.05
        currentSpeed = clamp(currentSpeed, 0, 160)
      } else if (drivingEnabled) {
        // Smooth manual keyboard steering & acceleration
        let desired = currentSpeed
        if (keysControl.current.up) desired = 160
        else if (keysControl.current.down) desired = 0
        else desired = currentSpeed * 0.98 // slight decay

        currentSpeed += (desired - currentSpeed) * 0.05
        currentSpeed = clamp(currentSpeed, 0, 160)
      }

      if (currentSpeed !== speedRef.current) {
        speedRef.current = currentSpeed
        setSpeedKmh(currentSpeed)
      }

      const selfSpeedMps = kmhToMps(currentSpeed)
      const nextDistance = (carDistanceMetersRef.current + selfSpeedMps * dt) % lut.total
      carDistanceMetersRef.current = nextDistance
      setCarT(nextDistance / lut.total)

      // Dead reckoning for vehicles
      setVehicles(prev => prev.map(v => {
        const newPos = (v.t * lut.total) + (collisionStateRef.current ? 0 : (v.dir * v.speed * dt))
        const wrappedPos = newPos % lut.total
        return {
          ...v,
          t: (wrappedPos < 0 ? wrappedPos + lut.total : wrappedPos) / lut.total
        }
      }))

      // Collision detection handed off to DrivingScene3D native bounds

      setLaneOffset((o) => {
        // Use proper interpolation (lerp) for smooth lane switching,
        // rather than discrete snapping or drifty continuous input
        const target = targetLaneRef.current
        return o + (target - o) * Math.min(dt * 4.0, 1.0)
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [drivingEnabled]) // removed speedKmh from deps so the effect doesn't reboot on acceleration

  // keyboard controls (smooth polling and lane targeting)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      if (e.key === 'ArrowUp') keysControl.current.up = isDown
      if (e.key === 'ArrowDown') keysControl.current.down = isDown
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        setDrivingEnabled((v) => !v)
      }
      if (e.key.toLowerCase() === 'r') targetLaneRef.current = 2.0

      // Target specific lanes instantly via keypress (lerped in loop)
      if (e.key === 'ArrowLeft') targetLaneRef.current = -2.0
      if (e.key === 'ArrowRight') targetLaneRef.current = 2.0

      handleKey(e, true)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      handleKey(e, false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const carScreen = useMemo(() => {
    return { lane: egoLane }
  }, [egoLane])

  useEffect(() => {
    let cancelled = false

    const loadDetectorBootstrap = async () => {
      try {
        const [health, scenarioData, status] = await Promise.all([
          fetchJson<{ status: string; graph_loaded: boolean }>('/health'),
          fetchJson<{ scenarios: DetectorScenario[] }>('/scenarios'),
          fetchJson<DetectorStatus>('/status'),
        ])
        if (cancelled) return
        setDetectorScenarios(scenarioData.scenarios)
        setDetectorStatus(status)
        setDetectorHealth(health.graph_loaded ? 'online' : 'checking')
        setDetectorError(null)
      } catch (error) {
        if (cancelled) return
        setDetectorHealth('offline')
        setDetectorError(
          error instanceof Error ? error.message : 'Detector backend is not reachable yet.',
        )
      }
    }

    void loadDetectorBootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (detectorHealth === 'offline') return

    let stopped = false
    const syncFrontendSimulation = async () => {
      const snapshot = frontendSimRef.current
      if (!snapshot) return
      try {
        const bridge = await fetchJson<SafetyFrontendSimResponse>('/frontend-sim', {
          method: 'POST',
          body: JSON.stringify({
            ...snapshot,
            gps_accuracy_m: 14,
          }),
        })
        if (stopped) return
        setDetectorStatus((current) => ({
          ...current,
          frontend_vehicle_count: bridge.frontend_vehicle_count,
          frontend_nearby_count: bridge.frontend_nearby_count,
          frontend_same_direction_nearby: bridge.frontend_same_direction_nearby,
          frontend_opposite_direction_nearby: bridge.frontend_opposite_direction_nearby,
          closest_vehicle_id: bridge.closest_vehicle_id,
          closest_distance_m: bridge.closest_distance_m,
        }))
        setSafetyFromSim({
          wrongWay: bridge.wrong_way,
          collisionBundle: bridge.collision_bundle,
          roadIntelligence: bridge.road_intelligence,
          roadWarning: bridge.road_warning,
          correctionRoute: bridge.correction_route,
          osmCheck: bridge.osm_check,
          roadWorks: bridge.road_works,
          falsePositiveAnalysis: bridge.false_positive_analysis,
        })
        setSafetyTimeSlot(bridge.time_slot)
      } catch (err) {
        console.error('Safety analysis poll failed:', err)
        setSafetyAnalysisStale(true)
      }
    }

    void syncFrontendSimulation()
    const intervalId = window.setInterval(() => {
      void syncFrontendSimulation()
    }, SAFETY_POLL_INTERVAL_MS)

    return () => {
      stopped = true
      window.clearInterval(intervalId)
    }
  }, [detectorHealth])

  useEffect(() => {
    if (detectorHealth === 'offline') return

    let socket: WebSocket | null = null
    let reconnectTimer = 0
    let closedByUs = false

    const connect = () => {
      socket = new WebSocket(DETECTION_WS_URL)

      socket.onopen = () => {
        setWsConnected(true)
        setDetectorHealth('online')
        setDetectorError(null)
      }

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            type: string
            sim_time?: number
            tick?: number
            vehicles?: DetectorVehicle[]
            new_alerts?: DetectorAlert[]
            active_alerts?: DetectorAlert[]
            consensus_enabled?: boolean
          }

          if (payload.type === 'tick') {
            setSimTimeSec(payload.sim_time ?? 0)
            setSimTick(payload.tick ?? 0)
            setDetectorVehicles(payload.vehicles ?? [])
            setActiveAlerts(payload.active_alerts ?? [])
            if (payload.new_alerts?.length) {
              setRecentAlerts((current) => [...payload.new_alerts!, ...current].slice(0, 6))
            }
            setDetectorStatus((current) => ({
              ...current,
              sim_running: true,
              consensus_enabled: payload.consensus_enabled ?? current.consensus_enabled,
              vehicle_count: payload.vehicles?.length ?? current.vehicle_count,
              alert_count: payload.active_alerts?.length ?? current.alert_count,
            }))
          } else if (payload.type === 'sim_ended') {
            setDetectorStatus((current) => ({ ...current, sim_running: false }))
            setDetectorVehicles([])
            setActiveAlerts([])
          } else if (payload.type === 'safety_update') {
            const p = payload as WsSafetyUpdate
            setSafetyFromSim({
              wrongWay: p.wrong_way,
              collisionBundle: p.collision_bundle,
              roadIntelligence: p.road_intelligence,
              correctionRoute: p.correction_route,
            })
          }
        } catch (error) {
          console.error('Failed to parse detector websocket payload', error)
        }
      }

      socket.onclose = () => {
        setWsConnected(false)
        if (!closedByUs) {
          reconnectTimer = window.setTimeout(connect, 2000)
        }
      }

      socket.onerror = () => {
        setDetectorError('Detector stream is disconnected. Start the backend to see live vehicles and alerts.')
      }
    }

    connect()

    return () => {
      closedByUs = true
      window.clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [detectorHealth])

  const refreshDetectorStatus = async () => {
    try {
      const status = await fetchJson<DetectorStatus>('/status')
      setDetectorStatus(status)
      setDetectorHealth('online')
      setDetectorError(null)
    } catch (error) {
      setDetectorHealth('offline')
      setDetectorError(error instanceof Error ? error.message : 'Detector backend status unavailable.')
    }
  }

  const startDetectorScenario = async (scenarioId: number) => {
    setDetectorBusy(true)
    try {
      await fetch(`${DETECTION_API_BASE}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: scenarioId })
      })
    } catch (e) {
      setDetectorError(e instanceof Error ? e.message : 'Error starting scenario')
    } finally {
      setDetectorBusy(false)
    }
  }

  const stopDetectorScenario = async () => {
    setDetectorBusy(true)
    try {
      await fetch(`${DETECTION_API_BASE}/stop`, { method: 'POST' })
    } catch (e) {
      setDetectorError(e instanceof Error ? e.message : 'Error stopping scenario')
    } finally {
      setDetectorBusy(false)
    }
  }

  const toggleDetectorConsensus = async () => {
    setDetectorBusy(true)
    try {
      await fetchJson('/consensus', {
        method: 'POST',
        body: JSON.stringify({ enabled: !detectorStatus.consensus_enabled }),
      })
      await refreshDetectorStatus()
    } catch (error) {
      setDetectorError(error instanceof Error ? error.message : 'Could not update consensus mode.')
    } finally {
      setDetectorBusy(false)
    }
  }

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setRouteErr('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFromQuery(`${pos.coords.latitude}, ${pos.coords.longitude}`)
      },
      (err) => {
        setRouteErr('Unable to retrieve your location: ' + err.message)
      }
    )
  }

  const planRoute = async () => {
    setRouteErr(null)
    setRouteLoading(true)
    try {
      const [from, to] = await Promise.all([geocodeBengaluru(fromQuery), geocodeBengaluru(toQuery)])
      if (!from || !to) {
        setRouteErr('Could not find one or both places in Bengaluru. Try landmarks like MG Road or Manyata.')
        return
      }
      const route = await fetchDrivingRouteOsrm(from.coords, to.coords)
      const asRoute: LngLat[] = route.coordinates.map(([lng, lat]) => [lng, lat] as LngLat)
      setRoutePoints(asRoute)
      setCarT(0.03)
      const nextRouteMeters = buildRouteLUT(asRoute).total
      carDistanceMetersRef.current = nextRouteMeters * 0.03

      try {
        const res = await fetchLocalTraffic(carDistanceMetersRef.current, nextRouteMeters, true)
        setVehicles(res.vehicles.map(v => ({
          ...v,
          speed: v.speed / 3.6,
          maxSpeed: v.speed / 3.6,
          acceleration: 0,
          meshRef: null,
        })))
      } catch (err) {
        console.error('Failed fetching local traffic on new route', err)
      }

      setActiveRouteLabel(`${from.label} -> ${to.label}`)
      setRouteSummary({
        fromLabel: from.label,
        toLabel: to.label,
        totalDistanceMeters: route.distanceMeters,
        totalDurationSec: route.durationSec,
        steps: route.steps.length > 0 ? route.steps : [{ instruction: 'Continue on the planned route', distanceMeters: route.distanceMeters }],
      })
      await offlineMode.cacheRoutePolyline({
        coordinates: asRoute.map((p) => [p[0], p[1]] as [number, number]),
        label: `${from.label} → ${to.label}`,
        updatedAt: Date.now(),
      })
      await offlineMode.setLastSyncTime(Date.now())
      setLastSyncTime(Date.now())
    } catch (e) {
      setRouteErr(e instanceof Error ? e.message : 'Routing failed')
    } finally {
      setRouteLoading(false)
    }
  }

  const spawnRandomVehicle = () => {
    // Deprecated for backend local logic
  }

  const wrongWayCombined = wrongWayApi.active || isWrongLaneDebounced

  return (
    <>
      <DashboardLayout
        theme={theme}
        setTheme={setTheme}
        mapContainerRef={mapContainerRef}
        wrongWayApi={wrongWayApi}
        isWrongLane={isWrongLane}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabledStore}
        drivingEnabled={drivingEnabled}
        setDrivingEnabled={setDrivingEnabled}
        setLaneOffset={setLaneOffset}
        spawnRandom={spawnRandomVehicle}
        fromQuery={fromQuery}
        setFromQuery={setFromQuery}
        toQuery={toQuery}
        setToQuery={setToQuery}
        routeLoading={routeLoading}
        planRoute={() => void planRoute()}
        routeErr={routeErr}
        activeRouteLabel={activeRouteLabel}
        nextRouteStepInstruction={nextRouteStep?.instruction ?? null}
        turnHint={turnHint}
        remainingKm={remainingKm}
        remainingMeters={remainingMeters}
        routeSummaryTrip={formatDistance(routeSummary.totalDistanceMeters)}
        routeSummaryEta={formatDuration(routeSummary.totalDurationSec)}
        routeSummaryLeft={formatDuration(estimatedRemainingSec)}
        isWrongLaneHud={isWrongLaneDebounced}
        egoLane={egoLane}
        vehiclesLength={vehicles.length}
        frontendNearby={detectorStatus.frontend_nearby_count}
        speedKmh={speedKmh}
        laneOffset={laneOffset}
        carT={carT}
        vehicles={vehicles}
        routeCurvature={routeCurvature}
        carScreenLane={carScreen.lane}
        collisionBundle={collisionBundle}
        roadIntelligence={roadIntelligence}
        roadWarning={roadWarning}
        osmCheck={osmCheck}
        roadWorks={roadWorks}
        falsePositiveAnalysis={falsePositiveAnalysis}
        safetyTimeSlot={safetyTimeSlot}
        correctionPlan={correctionPlan}
        wrongWayCombined={wrongWayCombined}
        telemetry={{
          speedKmh,
          bearing: car.bearing,
          lane: egoLane,
          drivingEnabled,
          remainingLabel:
            remainingKm >= 1 ? `${remainingKm.toFixed(1)} km left` : `${Math.round(remainingMeters)} m left`,
          etaLabel: formatDuration(estimatedRemainingSec),
        }}
        online={online}
        lastSyncTime={lastSyncTime}
        predictedHeading={!online ? car.bearing : null}
        activeRouteForStatus={activeRouteLabel}
        wsConnected={wsConnected}
        detectorHealth={detectorHealth}
        detectorStatus={detectorStatus}
        detectorError={detectorError}
        detectorBusy={detectorBusy}
        refreshDetectorStatus={() => void refreshDetectorStatus()}
        toggleDetectorConsensus={() => void toggleDetectorConsensus()}
        stopDetectorScenario={() => void stopDetectorScenario()}
        simTick={simTick}
        simTimeSec={simTimeSec}
        detectorScenarios={detectorScenarios}
        startDetectorScenario={(id) => void startDetectorScenario(id)}
        activeAlerts={activeAlerts}
        detectorVehicles={detectorVehicles}
        recentAlerts={recentAlerts}
        trafficDensity={trafficDensity}
        requestCurrentLocation={requestCurrentLocation}
        onInjectIntruder={injectIntruder}
        intruderInjectTick={intruderInjectTick}
        onIntruderNear={onIntruderNear}
      />

      {/* Collision Alert HUD */}
      {alertMessage && (
        <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-red-900/30">
          <div className="pointer-events-auto flex flex-col items-center gap-4 rounded-xl border border-red-500 bg-black/90 p-8 text-center shadow-2xl backdrop-blur-md transition-all">
            <svg className="h-16 w-16 text-red-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-3xl font-bold uppercase tracking-widest text-red-500">{alertMessage.includes('Collision') ? 'Collision Detected' : 'Safety Engaged'}</h2>
            <p className="text-red-200/80 text-lg">{alertMessage}</p>
            <button
              onClick={() => {
                collisionStateRef.current = false
                setAlertMessage(null)
              }}
              className="mt-4 rounded-lg bg-red-500 px-6 py-2 font-bold text-white shadow shadow-red-500/50 hover:bg-red-400 active:scale-95 transition-all"
            >
              FALSE ALARM (RESUME)
            </button>
          </div>
        </div>
      )}

      {/* Auto Drive HUD Toggle */}
      <div className="absolute right-6 top-6 z-50 flex gap-2">
        <button
          onClick={() => {
            const next = !isAutoDrive
            setIsAutoDrive(next)
            isAutoDriveRef.current = next
          }}
          className={`flex items-center gap-2 rounded-full px-4 py-2 font-bold shadow-lg transition-all ${isAutoDrive
            ? 'bg-blue-500 text-white shadow-blue-500/50 border border-blue-400'
            : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700'
            }`}
        >
          {isAutoDrive ? (
            <>
              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
              AUTO DRIVE ACTIVE
            </>
          ) : (
            'MANUAL DRIVE'
          )}
        </button>
      </div>
    </>
  )
}
