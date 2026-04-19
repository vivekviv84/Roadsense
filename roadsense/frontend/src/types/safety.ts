/** Types for extended safety API + WebSocket payloads */

export type WrongWayPayload = {
  active: boolean
  confidence: number
  current_heading: number
  expected_heading: number
  heading_delta: number
  nearby_count: number
  majority_support: number
  reason: string
}

export type CollisionDriverAlert = {
  target: string
  distance_m: number
  relative_direction: string
  collision_risk: 'LOW' | 'MEDIUM' | 'HIGH'
  collision_probability: number
  closing_speed_kmh: number
  eta_impact_sec: number
  safe_stop_distance_m: number
}

export type PedestrianAlert = {
  target: string
  id?: string
  distance_m: number
  collision_risk: string
  advisory: string
}

export type CollisionBundle = {
  driver_alert: CollisionDriverAlert
  pedestrians: PedestrianAlert[]
}

export type RoadIntelligence = {
  road_id: string
  dominant_direction: string | null
  confidence: number
  total_samples: number
  by_direction: Record<string, number>
}

export type RoadWarning = {
  active: boolean
  reason: string
}

export type CorrectionStep = {
  id: number
  instruction: string
  distance_m: number | null
  icon: string
}

export type CorrectionRoutePayload = {
  steps: CorrectionStep[]
  rejoin_eta_sec: number | null
  severity: string
  notes: string
}

export type OsmCheck = {
  osm_violation: boolean
  allowed_bearing: number | null
  is_oneway: boolean | null
  road_name: string | null
  confidence: 'none' | 'low' | 'medium' | 'high'
  reason: string
}

export type RoadWorksStatus = {
  active: boolean
  zone_label?: string
  alert_type?: string
  message?: string
}

export type FalsePositiveAnalysis = {
  risk_case: string | null
  mitigation_applied: boolean
  mitigation_description: string
  suppressed: boolean
}

export type SafetyFrontendSimResponse = {
  frontend_vehicle_count: number
  frontend_nearby_count: number
  frontend_same_direction_nearby: number
  frontend_opposite_direction_nearby: number
  closest_vehicle_id: string | null
  closest_distance_m: number | null
  wrong_way: WrongWayPayload
  road_intelligence: RoadIntelligence
  road_warning: RoadWarning
  osm_check: OsmCheck
  road_works: RoadWorksStatus
  false_positive_analysis: FalsePositiveAnalysis
  collision_bundle: CollisionBundle | null
  correction_route: CorrectionRoutePayload | null
  time_slot: number
}

export type WsSafetyUpdate = {
  type: 'safety_update'
  wrong_way: WrongWayPayload
  collision_bundle: CollisionBundle | null
  road_intelligence: RoadIntelligence
  correction_route: CorrectionRoutePayload | null
}
