import type { LaneKey } from './config'

export type TrafficCarSnapshot = {
  id: string
  lane: LaneKey
  dir: 1 | -1
  position: number
  t: number
  speed: number
  maxSpeed: number
  acceleration: number
  meshRef: unknown | null
}

export class Car {
  id: string
  lane: LaneKey = 'right'
  dir: 1 | -1 = 1
  position = 0
  speed = 0
  maxSpeed = 0
  acceleration = 0
  brake = 0
  active = false
  meshRef: unknown | null = null

  constructor(id: string) {
    this.id = id
  }

  reset(opts: {
    lane: LaneKey
    dir: 1 | -1
    position: number
    speed: number
    maxSpeed: number
    acceleration: number
    brake: number
  }) {
    this.lane = opts.lane
    this.dir = opts.dir
    this.position = opts.position
    this.speed = opts.speed
    this.maxSpeed = opts.maxSpeed
    this.acceleration = opts.acceleration
    this.brake = opts.brake
    this.active = true
    this.meshRef = null
  }

  deactivate() {
    this.active = false
    this.meshRef = null
  }

  toSnapshot(routeLengthMeters: number): TrafficCarSnapshot {
    return {
      id: this.id,
      lane: this.lane,
      dir: this.dir,
      position: this.position,
      t: routeLengthMeters > 0 ? this.position / routeLengthMeters : 0,
      speed: this.speed,
      maxSpeed: this.maxSpeed,
      acceleration: this.acceleration,
      meshRef: this.meshRef,
    }
  }
}
