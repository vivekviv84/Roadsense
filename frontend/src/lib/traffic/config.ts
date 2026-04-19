// Left-hand traffic: left lane is ONCOMING (dir=-1), right lane is SAME direction (dir=1)
// No middle lane — strict 2-lane road
export type LaneKey = 'left' | 'middle' | 'right'

export type LaneMap<T> = Record<LaneKey, T[]>

export type LaneValueMap<T> = Record<LaneKey, T>

export type TrafficConfig = {
  spawnRateSec: LaneValueMap<number>
  maxSpeedMps: LaneValueMap<{ min: number; max: number }>
  accelerationMps2: LaneValueMap<number>
  brakeMps2: LaneValueMap<number>
  spawnDistanceMeters: LaneValueMap<number>
  initialCarsPerLane: LaneValueMap<number>
  laneDirections: LaneValueMap<1 | -1>
  minDistanceMeters: number
  safeDistanceMeters: number
  spawnClearanceMeters: number
  freeRoadLookaheadMeters: number
  despawnAheadMeters: number
  despawnBehindMeters: number
  poolSize: number
}

export const TRAFFIC_CONFIG: TrafficConfig = {
  spawnRateSec: {
    left: 2.2,   // oncoming: spawn from far ahead, move toward camera
    middle: 999, // disabled — no middle lane
    right: 2.6,  // same direction: spawn from behind
  },
  maxSpeedMps: {
    left: { min: 9, max: 14 },   // oncoming traffic ~32–50 km/h
    middle: { min: 0, max: 0 },  // disabled
    right: { min: 8, max: 13 },  // same-direction ~29–47 km/h
  },
  accelerationMps2: {
    left: 2.8,
    middle: 0,
    right: 2.4,
  },
  brakeMps2: {
    left: 5.5,
    middle: 0,
    right: 5.0,
  },
  spawnDistanceMeters: {
    left: 350,   // oncoming: spawn well ahead (approaching from horizon)
    middle: 0,   // disabled
    right: 260,  // same-dir: spawn behind ego
  },
  initialCarsPerLane: {
    left: 4,     // oncoming — seed 4 cars spread across the approach corridor
    middle: 0,   // disabled
    right: 4,    // same-direction
  },
  laneDirections: {
    left: -1,    // oncoming (decreasing t, approaching camera)
    middle: 1,   // unused
    right: 1,    // same direction as ego (increasing t)
  },
  minDistanceMeters: 22,
  safeDistanceMeters: 45,
  spawnClearanceMeters: 38,
  freeRoadLookaheadMeters: 120,
  despawnAheadMeters: 400,
  despawnBehindMeters: 150,
  poolSize: 28,
}
