import { create } from 'zustand'
import type {
  CollisionBundle,
  CorrectionRoutePayload,
  FalsePositiveAnalysis,
  OsmCheck,
  RoadIntelligence,
  RoadWarning,
  RoadWorksStatus,
  WrongWayPayload,
} from '../types/safety'

const defaultWrongWay = (): WrongWayPayload => ({
  active: false,
  confidence: 0,
  current_heading: 0,
  expected_heading: 0,
  heading_delta: 0,
  nearby_count: 0,
  majority_support: 0,
  reason: 'idle',
})

const defaultRoadWarning = (): RoadWarning => ({ active: false, reason: 'ok' })

const defaultOsmCheck = (): OsmCheck => ({
  osm_violation: false,
  allowed_bearing: null,
  is_oneway: null,
  road_name: null,
  confidence: 'none',
  reason: 'road_not_found',
})

const defaultRoadWorks = (): RoadWorksStatus => ({ active: false })

const defaultFalsePositiveAnalysis = (): FalsePositiveAnalysis => ({
  risk_case: null,
  mitigation_applied: false,
  mitigation_description: 'no_false_positive_detected',
  suppressed: false,
})

type SafetyState = {
  wrongWay: WrongWayPayload
  collisionBundle: CollisionBundle | null
  roadIntelligence: RoadIntelligence | null
  roadWarning: RoadWarning
  correctionRoute: CorrectionRoutePayload | null
  osmCheck: OsmCheck
  roadWorks: RoadWorksStatus
  falsePositiveAnalysis: FalsePositiveAnalysis
  soundEnabled: boolean
  theme: 'dark' | 'light'
  isSafetyAnalysisStale: boolean
  setSafetyFromSim: (payload: Partial<SafetyState>) => void
  setSoundEnabled: (v: boolean) => void
  setTheme: (t: 'dark' | 'light') => void
  setSafetyAnalysisStale: (v: boolean) => void
}

export const useSafetyStore = create<SafetyState>((set) => ({
  wrongWay: defaultWrongWay(),
  collisionBundle: null,
  roadIntelligence: null,
  roadWarning: defaultRoadWarning(),
  correctionRoute: null,
  osmCheck: defaultOsmCheck(),
  roadWorks: defaultRoadWorks(),
  falsePositiveAnalysis: defaultFalsePositiveAnalysis(),
  soundEnabled: true,
  theme: 'dark',
  isSafetyAnalysisStale: false,
  setSafetyFromSim: (payload) =>
    set((s) => ({
      ...s,
      wrongWay: payload.wrongWay ?? s.wrongWay,
      collisionBundle:
        payload.collisionBundle !== undefined ? payload.collisionBundle : s.collisionBundle,
      roadIntelligence:
        payload.roadIntelligence !== undefined ? payload.roadIntelligence : s.roadIntelligence,
      roadWarning: payload.roadWarning ?? s.roadWarning,
      correctionRoute:
        payload.correctionRoute !== undefined ? payload.correctionRoute : s.correctionRoute,
      osmCheck: payload.osmCheck ?? s.osmCheck,
      roadWorks: payload.roadWorks ?? s.roadWorks,
      falsePositiveAnalysis: payload.falsePositiveAnalysis ?? s.falsePositiveAnalysis,
      isSafetyAnalysisStale: false,
    })),
  setSoundEnabled: (v) => set({ soundEnabled: v }),
  setTheme: (t) => set({ theme: t }),
  setSafetyAnalysisStale: (v) => set({ isSafetyAnalysisStale: v }),
}))
