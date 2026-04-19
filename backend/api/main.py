import asyncio
import json
import math
import os
import uuid
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.core.config import FRONTEND_SIM_CONFIG
from backend.core.detector import WrongWayDetector, haversine_distance
from backend.core.wrong_way_detector import analyze_traffic_flow_wrong_way, merge_with_gps_noise_guard
from backend.core.alert_dispatcher import dispatch_nearby_bundle, synthetic_pedestrians_near_route
from backend.core.road_learning import record_passage, get_road_intelligence, warn_if_opposes_flow, time_slot_now
from backend.core.correction_route import suggest_correction_plan
from backend.core.offline_predictor import predict_next_position, smooth_heading
from backend.core.road_network import load_graph_bbox, load_graph_from_file, save_graph
from backend.core.osm_validator import get_road_direction, check_ego_against_osm
from backend.core.false_positive_classifier import classify_false_positive_risk
from backend.simulation.simulator import (
  Simulator,
  build_scenario_1,
  build_scenario_2,
  build_scenario_3,
)
from backend.simulation.local_traffic import local_simulator

app = FastAPI(title='RoadSense API', version='1.0.0')

app.add_middleware(
  CORSMiddleware,
  allow_origins=['*'],
  allow_credentials=True,
  allow_methods=['*'],
  allow_headers=['*'],
)

# ── Road Works Zones (in-memory, no DB persistence) ─────────────────────────
# Silk Board Junction: 12.9177° N, 77.6233° E
# Hebbal Flyover:      13.0358° N, 77.5970° E
road_works_zones: dict[str, dict] = {
  'rw-silkboard': {
    'lat': 12.9177,
    'lon': 77.6233,
    'radius_m': 400.0,
    'label': 'Silk Board Junction — Flyover Construction',
    'active': True,
  },
  'rw-hebbal': {
    'lat': 13.0358,
    'lon': 77.5970,
    'radius_m': 350.0,
    'label': 'Hebbal Flyover — Lane Closure',
    'active': True,
  },
}

G = None
simulator: Optional[Simulator] = None
detector: Optional[WrongWayDetector] = None
sim_running = False
sim_task = None
current_scenario = 1
consensus_enabled = True
connected_clients: list[WebSocket] = []
frontend_bridge_state = {
  'frontend_vehicle_count': 0,
  'frontend_nearby_count': 0,
  'frontend_same_direction_nearby': 0,
  'frontend_opposite_direction_nearby': 0,
  'closest_vehicle_id': None,
  'closest_distance_m': None,
}

GRAPH_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'bengaluru.graphml')


@app.on_event('startup')
async def startup():
  global G
  from backend.core import road_learning as road_learning_module

  road_learning_module.init_db()
  if G is not None:
    return
  print('[API] Loading road network...')
  if os.path.exists(GRAPH_PATH):
    G = load_graph_from_file(GRAPH_PATH)
  else:
    G = load_graph_bbox(
      north=12.9850,
      south=12.9200,
      east=77.6200,
      west=77.5500,
    )
    save_graph(G, GRAPH_PATH)
  print('[API] Road network ready.')


class ScenarioRequest(BaseModel):
  scenario: int


class ConsensusToggle(BaseModel):
  enabled: bool


class FrontendEgo(BaseModel):
  vehicle_id: str = 'ego'
  lat: float
  lon: float
  speed_kmh: float
  bearing: float


class FrontendSimVehicle(BaseModel):
  vehicle_id: str
  lat: float
  lon: float
  speed_kmh: float
  bearing: float
  lane: str
  dir: int


class FrontendSimSnapshot(BaseModel):
  timestamp: float
  ego: FrontendEgo
  vehicles: list[FrontendSimVehicle]
  gps_accuracy_m: Optional[float] = None


class OfflinePredictRequest(BaseModel):
  lat: float
  lon: float
  speed_kmh: float
  bearing_deg: float
  dt_sec: float = 1.0
  previous_bearing_deg: Optional[float] = None


class RoadWorksAddRequest(BaseModel):
  lat: float
  lon: float
  radius_m: float
  label: str


class RoadWorksRemoveRequest(BaseModel):
  zone_id: str


# ── Road Works Endpoints ──────────────────────────────────────────────────────

@app.post('/road-works/add')
def road_works_add(req: RoadWorksAddRequest):
  zone_id = f'rw-{uuid.uuid4().hex[:8]}'
  road_works_zones[zone_id] = {
    'lat': req.lat,
    'lon': req.lon,
    'radius_m': req.radius_m,
    'label': req.label,
    'active': True,
  }
  return {'zone_id': zone_id, **road_works_zones[zone_id]}


@app.post('/road-works/remove')
def road_works_remove(req: RoadWorksRemoveRequest):
  if req.zone_id not in road_works_zones:
    raise HTTPException(status_code=404, detail=f'Zone {req.zone_id!r} not found')
  road_works_zones.pop(req.zone_id)
  return {'removed': req.zone_id}


@app.get('/road-works/list')
def road_works_list():
  return {
    'zones': [
      {'zone_id': zid, **zone}
      for zid, zone in road_works_zones.items()
      if zone['active']
    ]
  }


@app.get('/health')
def health():
  return {'status': 'ok', 'graph_loaded': G is not None}


@app.get('/scenarios')
def list_scenarios():
  return {
    'scenarios': [
      {
        'id': 1,
        'name': 'The near-miss',
        'description': 'Normal traffic plus one high-speed wrong-way intruder with predictive alerting.',
      },
      {
        'id': 2,
        'name': 'The diversion',
        'description': 'Diversion traffic using the wrong direction should be suppressed by crowd consensus.',
      },
      {
        'id': 3,
        'name': 'Urban grid',
        'description': 'Wrong-way vehicles on regular city streets, not just highway ramps.',
      },
    ],
  }


@app.get('/api/traffic')
def get_local_traffic(ego_position: float = 0.0, route_length: float = 8000.0, reset: bool = False):
  local_simulator.route_length = route_length
  if reset:
    local_simulator.reset(ego_position)
  else:
    local_simulator.tick(ego_position)
  return local_simulator.get_snapshot()


@app.post('/start')
async def start_simulation(req: ScenarioRequest):
  global simulator, detector, sim_running, sim_task, current_scenario

  if G is None:
    raise HTTPException(status_code=503, detail='Road network not loaded yet')

  await stop_simulation_internal()

  current_scenario = req.scenario
  if req.scenario == 1:
    simulator = build_scenario_1(G)
  elif req.scenario == 2:
    simulator = build_scenario_2(G)
  elif req.scenario == 3:
    simulator = build_scenario_3(G)
  else:
    raise HTTPException(status_code=400, detail='Scenario must be 1, 2, or 3')

  detector = WrongWayDetector(G)
  sim_running = True
  sim_task = asyncio.create_task(run_simulation_loop())
  return {'status': 'started', 'scenario': req.scenario}


@app.post('/stop')
async def stop_simulation():
  await stop_simulation_internal()
  return {'status': 'stopped'}


async def stop_simulation_internal():
  global sim_running, sim_task, simulator, detector
  sim_running = False
  if sim_task:
    sim_task.cancel()
    try:
      await sim_task
    except asyncio.CancelledError:
      pass
    sim_task = None
  simulator = None
  detector = None


@app.post('/consensus')
async def toggle_consensus(req: ConsensusToggle):
  global consensus_enabled
  consensus_enabled = req.enabled
  return {'consensus_enabled': consensus_enabled}


@app.get('/status')
def get_status():
  return {
    'sim_running': sim_running,
    'current_scenario': current_scenario,
    'consensus_enabled': consensus_enabled,
    'vehicle_count': len(simulator.vehicles) if simulator else 0,
    'alert_count': len(detector.alerts) if detector else 0,
    **frontend_bridge_state,
  }


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
  """Great-circle distance in metres between two lat/lon points."""
  R = 6_371_000.0
  phi1, phi2 = math.radians(lat1), math.radians(lat2)
  dphi = math.radians(lat2 - lat1)
  dlam = math.radians(lon2 - lon1)
  a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
  return 2 * R * math.asin(math.sqrt(a))


def _check_road_works(lat: float, lon: float) -> dict:
  """Return road_works payload for the /frontend-sim response."""
  for zone_id, zone in road_works_zones.items():
    if not zone['active']:
      continue
    dist = _haversine_m(lat, lon, zone['lat'], zone['lon'])
    if dist <= zone['radius_m']:
      return {
        'active': True,
        'zone_id': zone_id,
        'zone_label': zone['label'],
        'distance_m': round(dist, 1),
        'alert_type': 'CAUTION_OPPOSITE_TRAFFIC',
        'message': 'Road works ahead \u2014 expect vehicles in opposite direction',
      }
  return {'active': False}


@app.post('/frontend-sim')
async def ingest_frontend_sim(snapshot: FrontendSimSnapshot):
  global frontend_bridge_state

  nearby_radius_m = FRONTEND_SIM_CONFIG['nearby_radius_m']
  nearby: list[dict] = []
  nearby_flow_inputs: list[dict] = []
  for vehicle in snapshot.vehicles:
    distance_m = haversine_distance(
      snapshot.ego.lat,
      snapshot.ego.lon,
      vehicle.lat,
      vehicle.lon,
    )
    if distance_m <= nearby_radius_m:
      nearby.append(
        {
          'vehicle_id': vehicle.vehicle_id,
          'distance_m': round(distance_m, 1),
          'dir': vehicle.dir,
          'lane': vehicle.lane,
        },
      )
      nearby_flow_inputs.append({'bearing': vehicle.bearing, 'speed_kmh': vehicle.speed_kmh})

  closest = min(nearby, key=lambda item: item['distance_m'], default=None)
  frontend_bridge_state = {
    'frontend_vehicle_count': len(snapshot.vehicles),
    'frontend_nearby_count': len(nearby),
    'frontend_same_direction_nearby': sum(1 for vehicle in nearby if vehicle['dir'] == 1),
    'frontend_opposite_direction_nearby': sum(1 for vehicle in nearby if vehicle['dir'] == -1),
    'closest_vehicle_id': closest['vehicle_id'] if closest else None,
    'closest_distance_m': closest['distance_m'] if closest else None,
  }

  flow_raw = analyze_traffic_flow_wrong_way(
    snapshot.ego.bearing,
    snapshot.ego.speed_kmh,
    nearby_flow_inputs,
  )
  flow = merge_with_gps_noise_guard(flow_raw, snapshot.gps_accuracy_m)

  road_id = f'{snapshot.ego.lat:.4f}_{snapshot.ego.lon:.4f}'
  octant = int((snapshot.ego.bearing % 360.0) // 45.0)
  user_dir_key = f'E{octant}'
  record_passage(road_id, user_dir_key, weight=1.0)
  intel = get_road_intelligence(road_id)
  opposes_flow, flow_warn_reason = warn_if_opposes_flow(user_dir_key, intel)

  # ── OSM road-direction validation (independent of consensus) ────────────
  road_dir = get_road_direction(G, snapshot.ego.lat, snapshot.ego.lon)
  osm_check = check_ego_against_osm(snapshot.ego.bearing, road_dir)

  # ── Road Works Zone check ────────────────────────────────────────────────
  road_works = _check_road_works(snapshot.ego.lat, snapshot.ego.lon)

  # If ego is inside a road-works zone and wrong_way fires, reclassify the
  # alert as a planned diversion rather than a genuine wrong-way violation.
  wrong_way_dict = flow.to_dict()
  if road_works['active'] and flow.active:
    wrong_way_dict = {
      **wrong_way_dict,
      'reason': 'ROAD_WORKS_DIVERSION',
      'active': False,   # suppress the wrong-way penalty
    }

  # ── False-positive classification ────────────────────────────────────────
  fp_analysis = classify_false_positive_risk(
    ego_state={
      'vehicle_id': snapshot.ego.vehicle_id,
      'speed_kmh': snapshot.ego.speed_kmh,
      'bearing': snapshot.ego.bearing,
    },
    nearby_vehicles=nearby,
    osm_check={**osm_check, '_road_dir_raw': road_dir},
    road_works=road_works,
    gps_accuracy_m=snapshot.gps_accuracy_m,
    wrong_way_confidence=flow.confidence,
  )
  if fp_analysis['suppressed']:
    wrong_way_dict = {**wrong_way_dict, 'active': False}

  # Build road_warning: OSM one-way violation takes priority; road-works zone
  # suppresses the warning if we are already inside a construction area.
  if road_works['active'] or fp_analysis['suppressed']:
    road_warning = {'active': False, 'reason': 'road_works_zone_diversion_suppressed'}
  elif osm_check['osm_violation']:
    road_warning = {
      'active': True,
      'reason': 'WRONG WAY \u2014 One-Way Road Violation',
    }
  else:
    road_warning = {'active': opposes_flow, 'reason': flow_warn_reason}

  collision_bundle = None
  if flow.active:
    wrong = next((v for v in snapshot.vehicles if v.dir == -1), None)
    if wrong is None and snapshot.vehicles:
      wrong = max(
        snapshot.vehicles,
        key=lambda v: haversine_distance(snapshot.ego.lat, snapshot.ego.lon, v.lat, v.lon),
      )
    if wrong is not None:
      collision_bundle = dispatch_nearby_bundle(
        snapshot.ego.lat,
        snapshot.ego.lon,
        snapshot.ego.bearing,
        snapshot.ego.speed_kmh,
        wrong.lat,
        wrong.lon,
        wrong.bearing,
        wrong.speed_kmh,
        synthetic_pedestrians_near_route(snapshot.ego.lat, snapshot.ego.lon),
      )

  correction = suggest_correction_plan() if flow.active else None

  payload = {
    **frontend_bridge_state,
    'wrong_way': wrong_way_dict,
    'road_intelligence': intel.to_dict(),
    'road_warning': road_warning,
    'osm_check': osm_check,
    'road_works': road_works,
    'false_positive_analysis': fp_analysis,
    'collision_bundle': collision_bundle,
    'correction_route': correction,
    'time_slot': time_slot_now(),
  }

  if flow.active and not road_works['active']:
    await broadcast(
      {
        'type': 'safety_update',
        'wrong_way': wrong_way_dict,
        'collision_bundle': collision_bundle,
        'road_intelligence': intel.to_dict(),
        'correction_route': correction,
      },
    )

  return payload


@app.get('/road-intelligence/{road_id:path}')
def road_intelligence(road_id: str):
  return get_road_intelligence(road_id).to_dict()


@app.post('/offline/predict')
def offline_predict(req: OfflinePredictRequest):
  bearing = req.bearing_deg
  if req.previous_bearing_deg is not None:
    bearing = smooth_heading(req.previous_bearing_deg, req.bearing_deg)
  pred = predict_next_position(req.lat, req.lon, req.speed_kmh, bearing, req.dt_sec)
  pred['bearing_deg'] = bearing
  return pred


async def run_simulation_loop():
  global sim_running

  tick_delay = 0.5
  while sim_running and simulator and detector:
    try:
      observations = simulator.tick()
      if not observations and not simulator.is_running():
        sim_running = False
        break

      new_alerts = []
      for obs in observations:
        if not consensus_enabled:
          from backend.core import detector as detector_module

          original = detector_module.CROWD_THRESHOLD
          detector_module.CROWD_THRESHOLD = 999.0
          alert = detector.process_tick(
            obs['vehicle_id'],
            obs['lat'],
            obs['lon'],
            obs['speed_kmh'],
            obs['timestamp'],
          )
          detector_module.CROWD_THRESHOLD = original
        else:
          alert = detector.process_tick(
            obs['vehicle_id'],
            obs['lat'],
            obs['lon'],
            obs['speed_kmh'],
            obs['timestamp'],
          )
        if alert:
          new_alerts.append(
            {
              'alert_id': alert.alert_id,
              'vehicle_id': alert.vehicle_id,
              'lat': alert.lat,
              'lon': alert.lon,
              'heading_deviation': alert.heading_deviation,
              'confidence': alert.confidence,
              'attack_class': alert.attack_class,
              'timestamp': alert.timestamp,
              'alert_type': alert.alert_type,
              'vehicles_at_risk': [
                {
                  'vehicle_id': vehicle.vehicle_id,
                  'lat': vehicle.lat,
                  'lon': vehicle.lon,
                  'closing_speed_kmh': vehicle.closing_speed_kmh,
                  'estimated_ttc_sec': vehicle.estimated_ttc_sec,
                  'risk_score': vehicle.risk_score,
                }
                for vehicle in alert.vehicles_at_risk
              ],
            },
          )

      vehicle_labels = simulator.get_vehicle_labels()
      vehicle_statuses = detector.get_vehicle_statuses()
      payload = {
        'type': 'tick',
        'sim_time': round(simulator.sim_time, 1),
        'tick': simulator.tick_count,
        'vehicles': [
          {
            **vehicle_statuses.get(obs['vehicle_id'], {}),
            'label': vehicle_labels.get(obs['vehicle_id'], 'normal'),
          }
          for obs in observations
          if obs['vehicle_id'] in vehicle_statuses
        ],
        'new_alerts': new_alerts,
        'active_alerts': detector.get_active_alerts(),
        'consensus_enabled': consensus_enabled,
      }
      await broadcast(payload)
      await asyncio.sleep(tick_delay)
    except asyncio.CancelledError:
      break
    except Exception as error:
      print(f'[SimLoop] Error: {error}')
      await asyncio.sleep(1)

  await broadcast({'type': 'sim_ended'})


@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
  await websocket.accept()
  connected_clients.append(websocket)
  try:
    while True:
      data = await websocket.receive_text()
      try:
        message = json.loads(data)
      except json.JSONDecodeError:
        message = None
      if message and message.get('type') == 'ping':
        await websocket.send_text(json.dumps({'type': 'pong'}))
  except WebSocketDisconnect:
    pass
  finally:
    if websocket in connected_clients:
      connected_clients.remove(websocket)


async def broadcast(payload: dict):
  message = json.dumps(payload)
  disconnected: list[WebSocket] = []
  for client in connected_clients:
    try:
      await client.send_text(message)
    except Exception:
      disconnected.append(client)
  for client in disconnected:
    if client in connected_clients:
      connected_clients.remove(client)
