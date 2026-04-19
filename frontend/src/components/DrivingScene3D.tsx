import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export type SimVehicle3D = {
  id: string
  lane: 'left' | 'middle' | 'right'
  t: number
  dir: 1 | -1
  speed: number
  maxSpeed: number
  acceleration: number
  meshRef: unknown | null
}

type Props = {
  speedKmh: number
  laneOffset: number
  drivingEnabled: boolean
  wrongLane: boolean
  egoT: number
  vehicles: SimVehicle3D[]
  routeCurvature: number
  onCollision?: () => void
  /** Increment to spawn a wrong-way intruder */
  intruderInjectTick?: number
  onIntruderNear?: () => void
  /** Increment to spawn 2-3 diversion NPCs */
  diversionInjectTick?: number
  /** Increment to clear all diversion NPCs */
  diversionClearTick?: number
}

const LEFT_LANE_X    = -2.0
const RIGHT_LANE_X   =  2.0
const ROAD_HALF_WIDTH = 5.8
const ROAD_SLICE_LENGTH = 6
const ROAD_SLICE_COUNT  = 26
const ROAD_REPEAT    = ROAD_SLICE_LENGTH * ROAD_SLICE_COUNT
const ROAD_CURVE_STRENGTH = 12
const ROAD_MARKING_LENGTH = 170
const ROAD_MIN_X = -3
const ROAD_MAX_X =  3
const ONCOMING_Z_SCALE = 2200
const SAME_DIR_Z_SCALE = 2200
const ONCOMING_SPAWN_Z = -82
const ONCOMING_CULL_Z  =  12
const EGO_Z = -0.8

function kmhToMps(kmh: number) { return kmh / 3.6 }
function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)) }

function curveOffsetAtZ(z: number, c: number) {
  const d = clamp((-z + 4) / 120, 0, 1)
  return c * ROAD_CURVE_STRENGTH * d * d
}
function curveHeadingAtZ(z: number, c: number) {
  const d = clamp((-z + 4) / 120, 0, 1)
  return Math.atan2((-2 * c * ROAD_CURVE_STRENGTH * d) / 120, -1)
}
function laneToX(lane: SimVehicle3D['lane']) {
  return lane === 'left' ? LEFT_LANE_X : lane === 'right' ? RIGHT_LANE_X : 50
}
function oncomingZ(vt: number, egoT: number) {
  let a = ((vt - egoT) % 1 + 1) % 1
  if (a > 0.5) a -= 1
  return -a * ONCOMING_Z_SCALE
}
function sameDirZ(vt: number, egoT: number) {
  const r = ((vt - egoT + 0.5) % 1 + 1) % 1 - 0.5
  return -r * SAME_DIR_Z_SCALE
}

function makeCarMesh(color: number, scale = 1) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.85 * scale, 0.55 * scale, 4.2 * scale),
    new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.45 }),
  )
  body.position.y = 0.35 * scale
  g.add(body)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.55 * scale, 0.45 * scale, 2 * scale),
    new THREE.MeshStandardMaterial({ color: 0x1a1a24, metalness: 0.2, roughness: 0.6 }),
  )
  cabin.position.set(0, 0.75 * scale, -0.15 * scale)
  g.add(cabin)
  return g
}

function createRibbonGeometry(segs: number) {
  const geo = new THREE.BufferGeometry()
  const vc = (segs + 1) * 2
  const pos = new Float32Array(vc * 3)
  const nor = new Float32Array(vc * 3)
  const uvs = new Float32Array(vc * 2)
  const idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const v = i / segs
    const l = i * 2, r = l + 1
    uvs[l*2]=0; uvs[l*2+1]=v; uvs[r*2]=1; uvs[r*2+1]=v
    nor[l*3+1]=1; nor[r*3+1]=1
    if (i < segs) idx.push(l, l+2, r, r, l+2, r+2)
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('normal',   new THREE.BufferAttribute(nor, 3))
  geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  return geo
}

function updateRibbonGeometry(
  geo: THREE.BufferGeometry, width: number, baseX: number,
  y: number, roadCurve: number, scroll: number,
) {
  const p = geo.getAttribute('position') as THREE.BufferAttribute
  const segs = p.count / 2 - 1
  const hw = width / 2
  for (let i = 0; i <= segs; i++) {
    const z = 10 - (i / segs) * ROAD_MARKING_LENGTH + scroll
    const cx = baseX + curveOffsetAtZ(z, roadCurve)
    const h = curveHeadingAtZ(z, roadCurve)
    const rx = Math.cos(h), rz = -Math.sin(h)
    const li = i * 2, ri = li + 1
    p.setXYZ(li,  cx - rx*hw, y, z - rz*hw)
    p.setXYZ(ri,  cx + rx*hw, y, z + rz*hw)
  }
  p.needsUpdate = true
}

type InternalCar = {
  id: string; x: number; z: number
  speed: number; dir: 1 | -1; mesh: THREE.Group
  isIntruder?: boolean
  isDiversion?: boolean
}

// ── Floating label helper ────────────────────────────────────────────────────
function makeLabelEl(text: string, borderColor: string, glowColor: string): HTMLDivElement {
  const d = document.createElement('div')
  d.style.cssText = [
    'position:absolute','pointer-events:none','z-index:60','display:none',
    'transform:translate(-50%,-100%)',
    'padding:3px 8px','border-radius:6px',
    `border:1.5px solid ${borderColor}`,
    'background:rgba(15,10,0,0.85)',
    `color:${borderColor}`,
    'font-size:0.7rem','font-weight:900','letter-spacing:0.08em','white-space:nowrap',
    'font-family:Inter,system-ui,sans-serif',
    `text-shadow:0 0 10px ${glowColor}`,
  ].join(';')
  d.textContent = text
  return d
}

export function DrivingScene3D({
  speedKmh, laneOffset, drivingEnabled, wrongLane,
  egoT, vehicles, routeCurvature, onCollision,
  intruderInjectTick, onIntruderNear,
  diversionInjectTick, diversionClearTick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef<Props>({
    speedKmh, laneOffset, drivingEnabled, wrongLane, egoT, vehicles, routeCurvature,
    onCollision, intruderInjectTick, onIntruderNear, diversionInjectTick, diversionClearTick,
  })
  propsRef.current = {
    speedKmh, laneOffset, drivingEnabled, wrongLane, egoT, vehicles, routeCurvature,
    onCollision, intruderInjectTick, onIntruderNear, diversionInjectTick, diversionClearTick,
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.style.position = 'relative'

    const width  = Math.max(container.clientWidth, 320)
    const height = Math.max(container.clientHeight, 520)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x090d14)
    scene.fog = new THREE.Fog(0x0b0f18, 18, 95)

    const camera = new THREE.PerspectiveCamera(56, width / Math.max(height, 1), 0.1, 180)
    camera.position.set(0, 6.6, 10.5)
    camera.lookAt(0, 0.45, -18)

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    renderer.setSize(width, height)
    renderer.setClearColor(0x0a0d14, 1)
    renderer.shadowMap.enabled = false
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
    container.appendChild(renderer.domElement)

    const amb  = new THREE.AmbientLight(0xffffff, 0.75)
    const sun  = new THREE.DirectionalLight(0xffffff, 0.65)
    const fill = new THREE.DirectionalLight(0x3b82f6, 0.15)
    sun.position.set(8, 22, 10)
    fill.position.set(-6, 8, -4)
    scene.add(amb, sun, fill)

    const asphaltMat    = new THREE.MeshStandardMaterial({ color: 0x1a1d24, metalness: 0.04, roughness: 0.93 })
    const centerLineMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x92400e, emissiveIntensity: 0.12, roughness: 0.5 })
    const boundaryMat   = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x334155, emissiveIntensity: 0.08, roughness: 0.65 })
    const guideMat      = new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x1e3a8a, emissiveIntensity: 0.55 })

    scene.add(new THREE.Mesh(
      new THREE.PlaneGeometry(160, 90),
      new THREE.MeshBasicMaterial({ color: 0x09101a }),
    )).position.set(0, 20, -85)

    const roadSlices: THREE.Group[] = []
    const continuousMarkings = [
      { geometry: createRibbonGeometry(96), width: 0.22, baseX: 0,                y: 0.08, material: centerLineMat },
      { geometry: createRibbonGeometry(96), width: 0.12, baseX: -ROAD_HALF_WIDTH, y: 0.03, material: boundaryMat },
      { geometry: createRibbonGeometry(96), width: 0.12, baseX:  ROAD_HALF_WIDTH, y: 0.03, material: boundaryMat },
      { geometry: createRibbonGeometry(96), width: 0.06, baseX:  RIGHT_LANE_X,    y: 0.05, material: guideMat },
      { geometry: createRibbonGeometry(96), width: 0.06, baseX:  LEFT_LANE_X,     y: 0.05, material: guideMat },
    ].map(e => { const m = new THREE.Mesh(e.geometry, e.material); scene.add(m); return { ...e, mesh: m } })

    for (let i = 0; i < ROAD_SLICE_COUNT; i++) {
      const s = new THREE.Group()
      const r = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, ROAD_SLICE_LENGTH + 0.2),
        asphaltMat,
      )
      r.rotation.x = -Math.PI / 2
      r.position.set(0, 0.01, 0)
      s.add(r)
      scene.add(s)
      roadSlices.push(s)
    }

    const ego = makeCarMesh(0xe11d48, 1)
    ego.position.set(0, 0.02, EGO_Z)
    scene.add(ego)
    const egoBodyMat = (ego.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial

    const npcMeshes = new Map<string, THREE.Group>()

    let playerX = RIGHT_LANE_X, velocityX = 0, speed = 0, targetSpeed = 0
    let collisionActive = false, alertTimer = 0, authoritiesNotified = false
    const internalCars: InternalCar[] = []
    let carIdCounter = 0, incomingSpawnTimer = 0

    let lastIntruderTick      = propsRef.current.intruderInjectTick   ?? 0
    let lastDiversionInject   = propsRef.current.diversionInjectTick  ?? 0
    let lastDiversionClear    = propsRef.current.diversionClearTick   ?? 0
    let intruderNearFired     = false

    const keys: Record<string, boolean> = {}
    const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true }
    const onKeyUp   = (e: KeyboardEvent) => { keys[e.code] = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup',   onKeyUp)

    // ── CSS animations ───────────────────────────────────────────────────────
    const styleTag = document.createElement('style')
    styleTag.textContent = `
      @keyframes rs-fadein   { from{opacity:0;transform:scale(.93)} to{opacity:1;transform:scale(1)} }
      @keyframes rs-pulse    { 0%,100%{opacity:1} 50%{opacity:.55} }
      @keyframes rs-siren    { 0%,100%{text-shadow:0 0 24px #ef4444,0 0 48px #ef4444}
                               50%{text-shadow:0 0 8px #fbbf24,0 0 24px #fbbf24} }
      @keyframes rs-lbl-pulse{ 0%,100%{opacity:1;transform:translate(-50%,-100%) scale(1)}
                               50%{opacity:.7;transform:translate(-50%,-100%) scale(1.07)} }
      .rs-collision-overlay  {
        position:absolute;inset:0;display:none;flex-direction:column;
        align-items:center;justify-content:center;background:rgba(0,0,0,.92);
        backdrop-filter:blur(6px);z-index:200;font-family:Inter,system-ui,sans-serif;gap:16px;
        animation:rs-fadein .35s ease both;
      }
      .rs-collision-icon  { font-size:5rem;line-height:1;animation:rs-siren 1s ease-in-out infinite; }
      .rs-collision-title {
        font-size:2.4rem;font-weight:900;letter-spacing:-.02em;color:#ef4444;text-align:center;
        text-transform:uppercase;text-shadow:0 0 32px rgba(239,68,68,.7);
      }
      .rs-collision-sub   { font-size:1.1rem;color:#fbbf24;font-weight:600;animation:rs-pulse 1.2s ease-in-out infinite;text-align:center; }
      .rs-collision-timer { font-size:.95rem;color:#94a3b8;font-variant-numeric:tabular-nums;letter-spacing:.04em; }
      .rs-reset-btn {
        margin-top:8px;padding:.85rem 2.5rem;
        background:linear-gradient(135deg,#3b82f6,#2563eb);border:none;border-radius:1rem;
        color:#fff;font-size:1rem;font-weight:700;cursor:pointer;letter-spacing:.06em;
        text-transform:uppercase;box-shadow:0 0 24px rgba(59,130,246,.5);transition:transform .15s,box-shadow .15s;
      }
      .rs-reset-btn:hover  { transform:scale(1.05);box-shadow:0 0 36px rgba(59,130,246,.7); }
      .rs-reset-btn:active { transform:scale(.97); }
    `
    document.head.appendChild(styleTag)

    // ── Floating NPC labels ──────────────────────────────────────────────────
    const intruderLabel = makeLabelEl('⚠ WRONG-WAY INTRUDER', 'rgba(251,146,60,0.9)', 'rgba(251,146,60,0.8)')
    intruderLabel.style.animation = 'rs-lbl-pulse .9s ease-in-out infinite'
    container.appendChild(intruderLabel)

    // 3 pre-allocated diversion labels (amber/yellow)
    const diversionLabels: HTMLDivElement[] = []
    for (let di = 0; di < 3; di++) {
      const lbl = makeLabelEl('🚧 DIVERSION', 'rgba(251,191,36,0.9)', 'rgba(251,191,36,0.7)')
      lbl.style.animation = 'rs-lbl-pulse 1.1s ease-in-out infinite'
      container.appendChild(lbl)
      diversionLabels.push(lbl)
    }

    // ── Collision overlay ────────────────────────────────────────────────────
    const overlay = document.createElement('div')
    overlay.className = 'rs-collision-overlay'

    const overlayIcon  = document.createElement('div'); overlayIcon.className = 'rs-collision-icon';  overlayIcon.textContent  = '⚠️'
    const overlayTitle = document.createElement('div'); overlayTitle.className = 'rs-collision-title'; overlayTitle.textContent = '⚡ COLLISION DETECTED'
    const overlayMsg   = document.createElement('div'); overlayMsg.className   = 'rs-collision-sub';   overlayMsg.textContent   = 'Informing Nearby Authorities…'
    const overlayTimer = document.createElement('div'); overlayTimer.className = 'rs-collision-timer'
    const resetBtn     = document.createElement('button'); resetBtn.className  = 'rs-reset-btn'; resetBtn.textContent = '🔄  RESET — False Alarm'

    // ── Spawn helpers ────────────────────────────────────────────────────────
    function clearDiversionCars() {
      for (let i = internalCars.length - 1; i >= 0; i--) {
        if (internalCars[i].isDiversion) { scene.remove(internalCars[i].mesh); internalCars.splice(i, 1) }
      }
      for (const lbl of diversionLabels) lbl.style.display = 'none'
    }

    function spawnDiversionCars() {
      clearDiversionCars()
      const count = 2 + Math.floor(Math.random() * 2)   // 2 or 3
      for (let i = 0; i < count; i++) {
        internalCars.push({
          id:          `div_${carIdCounter++}`,
          x:           LEFT_LANE_X,
          z:           EGO_Z - 85 - i * 22,
          speed:       kmhToMps(30 + Math.random() * 20),
          dir:         -1,
          mesh:        makeCarMesh(0xfbbf24, 0.92),
          isDiversion: true,
        })
        scene.add(internalCars[internalCars.length - 1].mesh)
      }
    }

    function spawnIntruder() {
      for (let i = internalCars.length - 1; i >= 0; i--) {
        if (internalCars[i].isIntruder) { scene.remove(internalCars[i].mesh); internalCars.splice(i, 1) }
      }
      intruderNearFired = false
      intruderLabel.style.display = 'none'
      internalCars.push({
        id:         `intruder_${carIdCounter++}`,
        x:          RIGHT_LANE_X,
        z:          EGO_Z - 175,
        speed:      kmhToMps(80),
        dir:        -1,
        mesh:       makeCarMesh(0xf97316, 1.0),
        isIntruder: true,
      })
      scene.add(internalCars[internalCars.length - 1].mesh)
    }

    // ── Reset button ─────────────────────────────────────────────────────────
    resetBtn.onclick = () => {
      while (internalCars.length) { const c = internalCars.pop()!; scene.remove(c.mesh) }
      collisionActive = false; alertTimer = 0; authoritiesNotified = false
      incomingSpawnTimer = 2; intruderNearFired = false
      intruderLabel.style.display = 'none'
      for (const lbl of diversionLabels) lbl.style.display = 'none'
      playerX = RIGHT_LANE_X; velocityX = 0; speed = 0
      internalCars.push({ id: `npc_f${carIdCounter++}`, x: RIGHT_LANE_X, z: EGO_Z - 80, speed: 4, dir: 1, mesh: makeCarMesh(0x94a3b8, 0.92) })
      scene.add(internalCars[internalCars.length - 1].mesh)
      overlayIcon.textContent  = '⚠️'
      overlayTitle.textContent = '⚡ COLLISION DETECTED'
      overlayMsg.textContent   = 'Informing Nearby Authorities…'
      overlayTimer.textContent = ''
      overlay.style.display    = 'none'
    }

    overlay.append(overlayIcon, overlayTitle, overlayMsg, overlayTimer, resetBtn)
    container.appendChild(overlay)

    function triggerCollision() {
      if (collisionActive) return
      collisionActive = true; alertTimer = 5; authoritiesNotified = false
      overlayIcon.textContent  = '⚠️'
      overlayTitle.textContent = '⚡ COLLISION DETECTED'
      overlayMsg.textContent   = 'Informing Nearby Authorities…'
      overlay.style.display    = 'flex'
      overlayTimer.textContent = 'Notifying in 5.0 s…'
      propsRef.current.onCollision?.()
    }

    // ── Render loop ──────────────────────────────────────────────────────────
    let rafId = 0, last = performance.now(), roadScroll = 0

    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const p = propsRef.current
      const rc = clamp(p.routeCurvature, -1, 1)

      // Tick-based spawn signals
      const curIntruder = p.intruderInjectTick ?? 0
      if (curIntruder !== lastIntruderTick) { lastIntruderTick = curIntruder; spawnIntruder() }

      const curDivInject = p.diversionInjectTick ?? 0
      if (curDivInject !== lastDiversionInject) { lastDiversionInject = curDivInject; spawnDiversionCars() }

      const curDivClear = p.diversionClearTick ?? 0
      if (curDivClear !== lastDiversionClear) { lastDiversionClear = curDivClear; clearDiversionCars() }

      // Movement
      if (!collisionActive) {
        if (keys['ArrowLeft']  || keys['KeyA']) velocityX -= 0.02
        if (keys['ArrowRight'] || keys['KeyD']) velocityX += 0.02
        velocityX *= 0.9
        playerX = Math.max(ROAD_MIN_X, Math.min(ROAD_MAX_X, playerX + velocityX))
        targetSpeed = p.drivingEnabled ? kmhToMps(p.speedKmh) : 0
        speed += (targetSpeed - speed) * 0.05
      } else {
        speed = 0; velocityX = 0
        if (!authoritiesNotified) {
          alertTimer -= dt
          overlayTimer.textContent = `Notifying in ${Math.max(0, alertTimer).toFixed(1)} s…`
          if (alertTimer <= 0) {
            authoritiesNotified = true
            overlayIcon.textContent  = '✅'
            overlayTitle.textContent = 'AUTHORITIES NOTIFIED'
            overlayMsg.textContent   = 'Help is on the way'
            overlayTimer.textContent = ''
          }
        }
      }

      ego.position.x = playerX; ego.position.y = 0.02
      const egoTurn = Math.abs(rc) > 0.08 ? curveHeadingAtZ(-10, rc) * 0.9 : 0
      ego.rotation.y = THREE.MathUtils.lerp(ego.rotation.y, egoTurn + velocityX * 0.25, 0.12)
      ego.rotation.z = THREE.MathUtils.lerp(ego.rotation.z, -velocityX * 0.5, 0.12)
      guideMat.color.setHex(p.wrongLane ? 0xef4444 : 0x3b82f6)
      guideMat.emissive.setHex(p.wrongLane ? 0x7f1d1d : 0x1e3a8a)
      egoBodyMat.color.setHex(p.wrongLane ? 0xdc2626 : 0xe11d48)
      asphaltMat.color.setHex(p.wrongLane ? 0x221515 : 0x1a1d24)

      // Road scroll
      roadScroll = (roadScroll + speed * dt * 2.8) % ROAD_REPEAT
      const ms = roadScroll % ROAD_SLICE_LENGTH
      for (let i = 0; i < roadSlices.length; i++) {
        let z = 8 - i * ROAD_SLICE_LENGTH + roadScroll
        while (z > 10) z -= ROAD_REPEAT
        roadSlices[i].position.set(curveOffsetAtZ(z, rc), 0, z)
        roadSlices[i].rotation.y = curveHeadingAtZ(z, rc)
      }
      for (const m of continuousMarkings) updateRibbonGeometry(m.geometry, m.width, m.baseX, m.y, rc, ms)

      // Only spawn front car if we have external vehicles from API (don't autonomous-spawn fake traffic)
      const hasExternalVehicles = internalCars.some(c => !c.isIntruder && !c.isDiversion && c.dir === 1)

      if (!collisionActive && hasExternalVehicles && !internalCars.some(c => c.dir === 1 && c.z < EGO_Z - 50 && c.z > EGO_Z - 120)) {
        const c: InternalCar = { id: `npc_f${carIdCounter++}`, x: RIGHT_LANE_X, z: EGO_Z - 80, speed: Math.max(2, speed * 0.75), dir: 1, mesh: makeCarMesh(0x94a3b8, 0.92) }
        scene.add(c.mesh); internalCars.push(c)
      }

      // Periodic oncoming traffic only if API is providing vehicles
      incomingSpawnTimer -= dt
      if (incomingSpawnTimer <= 0 && !collisionActive && hasExternalVehicles) {
        incomingSpawnTimer = 3 + Math.random() * 4
        const c: InternalCar = { id: `npc_i${carIdCounter++}`, x: LEFT_LANE_X, z: EGO_Z - 100, speed: Math.max(4, speed * 0.6 + 3), dir: -1, mesh: makeCarMesh(0xf87171, 0.92) }
        scene.add(c.mesh); internalCars.push(c)
      }

      // Reset all floating labels before per-car update
      intruderLabel.style.display = 'none'
      for (const lbl of diversionLabels) lbl.style.display = 'none'
      let divLblIdx = 0

      const toRemove: string[] = []
      for (const car of internalCars) {
        if (!collisionActive) {
          car.z += car.dir === 1
            ? (speed - car.speed) * dt
            : (car.speed + speed) * dt
        }

        car.mesh.position.set(car.x, 0, car.z)
        car.mesh.rotation.y = car.dir === -1 ? Math.PI : 0

        // Per-type color: only recolor standard cars (intruder/diversion keep mesh color)
        if (!car.isIntruder && !car.isDiversion) {
          ;(car.mesh.children[0] as THREE.Mesh).material &&
            ((car.mesh.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial)
              .color.setHex(car.dir === -1 ? 0xf87171 : 0x94a3b8)
        }

        // Intruder label + near-alert
        if (car.isIntruder) {
          const wp = new THREE.Vector3(car.x, 3.2, car.z)
          const pr = wp.project(camera)
          if (pr.z > 0 && pr.z < 1) {
            intruderLabel.style.left = `${(pr.x * .5 + .5) * container.clientWidth}px`
            intruderLabel.style.top  = `${(-pr.y * .5 + .5) * container.clientHeight}px`
            intruderLabel.style.display = 'block'
          }
          if (!intruderNearFired && !collisionActive && Math.abs(car.z - EGO_Z) < 50) {
            intruderNearFired = true
            propsRef.current.onIntruderNear?.()
            triggerCollision()
          }
        }

        // Diversion label (no collision trigger)
        if (car.isDiversion && divLblIdx < diversionLabels.length) {
          const lbl = diversionLabels[divLblIdx++]
          const wp = new THREE.Vector3(car.x, 3.2, car.z)
          const pr = wp.project(camera)
          if (pr.z > 0 && pr.z < 1) {
            lbl.style.left = `${(pr.x * .5 + .5) * container.clientWidth}px`
            lbl.style.top  = `${(-pr.y * .5 + .5) * container.clientHeight}px`
            lbl.style.display = 'block'
          }
        }

        if (car.z > ONCOMING_CULL_Z + 3 || car.z < -220) { toRemove.push(car.id); scene.remove(car.mesh) }

        // Collision: skip for diversion cars (they're expected, not threats)
        if (!collisionActive && !car.isDiversion) {
          if (Math.abs(car.x - playerX) < 1.5 && Math.abs(car.z - EGO_Z) < 3) triggerCollision()
        }
      }
      for (const id of toRemove) {
        const idx = internalCars.findIndex(c => c.id === id)
        if (idx !== -1) internalCars.splice(idx, 1)
      }

      // External NPC vehicles
      const wanted = new Set<string>()
      for (const v of p.vehicles) {
        if (v.lane === 'middle') continue
        const isOC = v.dir === -1
        const z = isOC ? oncomingZ(v.t, p.egoT) : sameDirZ(v.t, p.egoT)
        if (isOC && (z > ONCOMING_CULL_Z || z < ONCOMING_SPAWN_Z - 10)) continue
        if (!isOC && (z > 12 || z < -110)) continue

        wanted.add(v.id)
        let mesh = npcMeshes.get(v.id)
        if (!mesh) { mesh = makeCarMesh(isOC ? 0xf87171 : 0x94a3b8, 0.92); scene.add(mesh); npcMeshes.set(v.id, mesh) }

        const tx = laneToX(v.lane) + curveOffsetAtZ(z, rc)
        mesh.position.x += (tx - mesh.position.x) * 0.1
        mesh.position.set(mesh.position.x, 0, z)
        mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, (isOC ? Math.PI : 0) + curveHeadingAtZ(z, rc), 0.15)
        ;(mesh.children[0] as THREE.Mesh).material &&
          ((mesh.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial)
            .color.setHex(isOC ? 0xf87171 : 0x94a3b8)
        if (!collisionActive && Math.abs(mesh.position.x - playerX) < 1.5 && Math.abs(z - EGO_Z) < 3) triggerCollision()
      }
      for (const [id, mesh] of npcMeshes) { if (!wanted.has(id)) { scene.remove(mesh); npcMeshes.delete(id) } }

      // Camera
      const ccx = curveOffsetAtZ(-12, rc)
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, ego.position.x * 0.8 + ccx * 0.1, 0.12)
      camera.position.setZ(ego.position.z + 11.3)
      camera.lookAt(ego.position.x * 0.3 + ccx, 0.35, ego.position.z - 22)

      renderer.render(scene, camera)
      rafId = requestAnimationFrame(animate)
    }

    rafId = requestAnimationFrame(animate)

    let resizeRaf = 0
    const onResize = () => {
      cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        const w = Math.max(container.clientWidth, 320), h = Math.max(container.clientHeight, 460)
        camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false)
      })
    }
    window.addEventListener('resize', onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(container)

    return () => {
      cancelAnimationFrame(rafId); cancelAnimationFrame(resizeRaf)
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup',   onKeyUp)
      renderer.dispose()
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement)
      if (overlay.parentNode          === container) container.removeChild(overlay)
      if (intruderLabel.parentNode    === container) container.removeChild(intruderLabel)
      for (const lbl of diversionLabels) { if (lbl.parentNode === container) container.removeChild(lbl) }
      if (styleTag.parentNode) styleTag.parentNode.removeChild(styleTag)
      scene.clear()
    }
  }, [])

  return <div className="rs-scene3d" ref={containerRef} />
}
