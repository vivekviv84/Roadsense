import { Car, type TrafficCarSnapshot } from './Car'
import {
  TRAFFIC_CONFIG,
  type LaneKey,
  type LaneMap,
  type LaneValueMap,
  type TrafficConfig,
} from './config'

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function wrapDistance(distance: number, routeLengthMeters: number) {
  const wrapped = distance % routeLengthMeters
  return wrapped < 0 ? wrapped + routeLengthMeters : wrapped
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function createLaneMap<T>(factory: () => T): LaneValueMap<T> {
  return {
    left: factory(),
    middle: factory(),
    right: factory(),
  }
}

export class TrafficManager {
  readonly config: TrafficConfig
  readonly lanes: LaneMap<Car>

  private routeLengthMeters: number
  private readonly pool: Car[]
  private readonly spawnTimers: LaneValueMap<number>
  private readonly nextSpawnDelays: LaneValueMap<number>

  constructor(routeLengthMeters: number, config: TrafficConfig = TRAFFIC_CONFIG) {
    this.routeLengthMeters = Math.max(routeLengthMeters, 1)
    this.config = config
    this.lanes = {
      left: [],
      middle: [],
      right: [],
    }
    this.pool = Array.from({ length: config.poolSize }, (_, index) => new Car(`traffic_${index + 1}`))
    this.spawnTimers = createLaneMap(() => 0)
    this.nextSpawnDelays = createLaneMap(() => 3)
  }

  reset(routeLengthMeters: number, egoDistanceMeters: number) {
    this.routeLengthMeters = Math.max(routeLengthMeters, 1)
    for (const lane of this.laneKeys()) {
      for (const car of this.lanes[lane]) car.deactivate()
      this.lanes[lane] = []
      this.spawnTimers[lane] = 0
      this.nextSpawnDelays[lane] = this.config.spawnRateSec[lane] * randomRange(0.8, 1.2)
    }

    for (const lane of this.laneKeys()) {
      this.seedLane(lane, egoDistanceMeters, this.config.initialCarsPerLane[lane])
    }
  }

  update(dt: number, egoDistanceMeters: number) {
    for (const lane of this.laneKeys()) {
      this.sortLane(lane)
      this.updateLaneVehicles(lane, dt)
      this.recycleFarVehicles(lane, egoDistanceMeters)
      this.spawnTimers[lane] += dt
      
      if (this.spawnTimers[lane] >= this.nextSpawnDelays[lane]) {
        this.spawnTimers[lane] = 0
        // Left lane (oncoming): highly varied intervals
        // Right lane (same-dir): moderately varied
        const multiplier = lane === 'left' ? randomRange(0.4, 2.2) : randomRange(0.7, 1.4)
        this.nextSpawnDelays[lane] = Math.max(0.5, this.config.spawnRateSec[lane] * multiplier)
        
        this.trySpawn(lane, egoDistanceMeters)
      }

      // Guarantee at least one car is visibly ahead of the player in their lane
      if (lane === 'right') {
        const hasCarAhead = this.lanes[lane].some((car) => {
          const rel = this.relativeDistanceFromEgo(car.position, egoDistanceMeters)
          return rel > 30 && rel < 280
        })
        if (!hasCarAhead) {
          // Force spawn one realistically ahead if missing
          const spawnPos = wrapDistance(egoDistanceMeters + randomRange(120, 180), this.routeLengthMeters)
          if (this.canSpawn(lane, spawnPos)) {
            this.spawnCar(lane, spawnPos)
          }
        }
      }
    }
  }

  forceSpawn(lane: LaneKey, egoDistanceMeters: number) {
    const spawnPosition = this.spawnPositionForLane(lane, egoDistanceMeters)
    if (!this.canSpawn(lane, spawnPosition)) return false
    this.spawnCar(lane, spawnPosition)
    return true
  }

  getSnapshots(): TrafficCarSnapshot[] {
    return this.laneKeys().flatMap((lane) =>
      this.lanes[lane].filter((car) => car.active).map((car) => car.toSnapshot(this.routeLengthMeters)),
    )
  }

  private laneKeys(): LaneKey[] {
    return ['left', 'middle', 'right']
  }

  private seedLane(lane: LaneKey, egoDistanceMeters: number, count: number) {
    if (count <= 0) return
    const dir = this.config.laneDirections[lane]
    const spawnDistance = this.config.spawnDistanceMeters[lane]
    // Distribute seed cars evenly along the spawn corridor.
    // Oncoming (dir=-1): spread from ahead-close to ahead-far.
    // Same-dir (dir=+1): spread from behind-far to behind-close.
    const minDist = this.config.safeDistanceMeters * 1.8
    const maxDist = Math.min(spawnDistance, this.routeLengthMeters * 0.4)
    const step = count > 1 ? (maxDist - minDist) / (count - 1) : 0

    for (let i = 0; i < count; i++) {
      const dist = minDist + i * step + randomRange(-8, 8)
      // dir=-1 (oncoming): positive offset from ego = ahead of ego
      // dir=+1 (same-dir): negative offset from ego = behind ego
      const position = wrapDistance(
        egoDistanceMeters + (dir === -1 ? dist : -dist),
        this.routeLengthMeters,
      )
      this.spawnCar(lane, position)
    }
  }

  private spawnPositionForLane(lane: LaneKey, egoDistanceMeters: number) {
    // Randomize the default spawn distance to prevent chunking/clustering
    const variance = randomRange(0.8, 1.5)
    const spawnDistance = this.config.spawnDistanceMeters[lane] * variance
    const dir = this.config.laneDirections[lane]
    
    // Oncoming (dir=-1): spawn AHEAD of ego (positive offset)
    // Same-dir (dir=+1): spawn BEHIND ego (negative offset)
    return wrapDistance(
      egoDistanceMeters + (dir === -1 ? spawnDistance : -spawnDistance),
      this.routeLengthMeters,
    )
  }

  private trySpawn(lane: LaneKey, egoDistanceMeters: number) {
    const spawnPosition = this.spawnPositionForLane(lane, egoDistanceMeters)
    if (!this.canSpawn(lane, spawnPosition)) return
    this.spawnCar(lane, spawnPosition)
  }

  private canSpawn(lane: LaneKey, spawnPosition: number) {
    const dir = this.config.laneDirections[lane]
    return this.lanes[lane].every((car) => {
      const gap = this.directionalGap(spawnPosition, car.position, dir)
      return gap >= this.config.spawnClearanceMeters
    })
  }

  private spawnCar(lane: LaneKey, position: number) {
    const car = this.pool.find((candidate) => !candidate.active)
    if (!car) return

    const maxSpeedRange = this.config.maxSpeedMps[lane]
    const maxSpeed = randomRange(maxSpeedRange.min, maxSpeedRange.max)
    const speed = maxSpeed * randomRange(0.72, 0.9)

    car.reset({
      lane,
      dir: this.config.laneDirections[lane],
      position,
      speed,
      maxSpeed,
      acceleration: this.config.accelerationMps2[lane],
      brake: this.config.brakeMps2[lane],
    })
    this.lanes[lane].push(car)
    this.sortLane(lane)
  }

  private updateLaneVehicles(lane: LaneKey, dt: number) {
    const cars = this.lanes[lane]
    const dir = this.config.laneDirections[lane]

    for (let index = cars.length - 1; index >= 0; index--) {
      const car = cars[index]
      const frontCar = index < cars.length - 1 ? cars[index + 1] : null

      let targetSpeed = car.maxSpeed
      if (frontCar) {
        const gap = this.directionalGap(car.position, frontCar.position, dir)
        if (gap < this.config.safeDistanceMeters) {
          const ratio = clamp(
            (gap - this.config.minDistanceMeters) /
              Math.max(this.config.safeDistanceMeters - this.config.minDistanceMeters, 1),
            0,
            1,
          )
          targetSpeed = Math.min(
            car.maxSpeed * ratio,
            frontCar.speed + ratio * 2,
          )
        }
        if (gap < this.config.minDistanceMeters) {
          targetSpeed = Math.min(targetSpeed, frontCar.speed * 0.6)
        }
      }

      if (car.speed < targetSpeed) {
        car.speed = Math.min(targetSpeed, car.speed + car.acceleration * dt)
      } else {
        const closingRatio =
          frontCar == null
            ? 1
            : clamp(
                this.directionalGap(car.position, frontCar.position, dir) /
                  this.config.safeDistanceMeters,
                0.2,
                1,
              )
        car.speed = Math.max(targetSpeed, car.speed - car.brake * (1.15 - closingRatio) * dt)
      }

      car.position = wrapDistance(car.position + dir * car.speed * dt, this.routeLengthMeters)
    }

    this.sortLane(lane)
  }

  private recycleFarVehicles(lane: LaneKey, egoDistanceMeters: number) {
    this.lanes[lane] = this.lanes[lane].filter((car) => {
      const rel = this.relativeDistanceFromEgo(car.position, egoDistanceMeters)
      const keep =
        rel <= this.config.despawnAheadMeters && rel >= -this.config.despawnBehindMeters
      if (!keep) car.deactivate()
      return keep
    })
  }

  private sortLane(lane: LaneKey) {
    const dir = this.config.laneDirections[lane]
    this.lanes[lane].sort((a, b) => this.laneCoordinate(a.position, dir) - this.laneCoordinate(b.position, dir))
  }

  private laneCoordinate(position: number, dir: 1 | -1) {
    return dir === 1 ? position : this.routeLengthMeters - position
  }

  private directionalGap(from: number, to: number, dir: 1 | -1) {
    const fromCoord = this.laneCoordinate(from, dir)
    const toCoord = this.laneCoordinate(to, dir)
    let gap = toCoord - fromCoord
    if (gap < 0) gap += this.routeLengthMeters
    return gap
  }

  private relativeDistanceFromEgo(position: number, egoDistanceMeters: number) {
    let rel = position - egoDistanceMeters
    if (rel > this.routeLengthMeters / 2) rel -= this.routeLengthMeters
    if (rel < -this.routeLengthMeters / 2) rel += this.routeLengthMeters
    return rel
  }
}
