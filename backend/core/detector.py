import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Optional

import networkx as nx

from backend.core.road_network import (
  angular_difference,
  compute_bearing,
  get_edge_bearing,
  is_one_way,
  snap_to_edge,
)

HEADING_MISMATCH_THRESHOLD = 120.0
SPEED_GATE_KMH = 5.0
PERSISTENCE_WINDOW_SEC = 2.5
SUSPICION_THRESHOLD = 80.0
SUSPICION_SPEED_MAX = 25.0
CROWD_WINDOW_SEC = 60.0
CROWD_THRESHOLD = 0.7
CROWD_MIN_VEHICLES = 5
ALERT_RADIUS_M = 500.0
CLOSE_APPROACH_SPEED_MIN = 10.0


@dataclass
class VehicleState:
  vehicle_id: str
  lat: float
  lon: float
  speed_kmh: float
  bearing: float
  timestamp: float
  suspicion_start: Optional[float] = None
  wrong_way_start: Optional[float] = None
  alert_active: bool = False
  suspicion_active: bool = False
  confidence: float = 0.0
  edge_key: Optional[tuple] = None
  heading_deviation: float = 0.0
  attack_class: str = 'none'


@dataclass
class VehicleAtRisk:
  vehicle_id: str
  lat: float
  lon: float
  closing_speed_kmh: float
  estimated_ttc_sec: float
  risk_score: float


@dataclass
class Alert:
  alert_id: str
  vehicle_id: str
  lat: float
  lon: float
  heading_deviation: float
  confidence: float
  attack_class: str
  timestamp: float
  alert_type: str
  vehicles_at_risk: list[VehicleAtRisk] = field(default_factory=list)
  is_suppressed_diversion: bool = False


class CrowdConsensus:
  def __init__(self):
    self.segment_history: dict[tuple, deque] = defaultdict(lambda: deque(maxlen=50))

  def record(self, edge_key: tuple, vehicle_bearing: float, allowed_bearing: float, timestamp: float):
    deviation = angular_difference(vehicle_bearing, allowed_bearing)
    self.segment_history[edge_key].append(
      {
        'timestamp': timestamp,
        'is_wrong': deviation > HEADING_MISMATCH_THRESHOLD,
      },
    )

  def is_diversion(self, edge_key: tuple, now: float) -> bool:
    history = self.segment_history.get(edge_key, deque())
    recent = [item for item in history if now - item['timestamp'] <= CROWD_WINDOW_SEC]
    if len(recent) < CROWD_MIN_VEHICLES:
      return False
    wrong_fraction = sum(1 for item in recent if item['is_wrong']) / len(recent)
    return wrong_fraction >= CROWD_THRESHOLD


def classify_attack(deviation: float, speed: float, persistence: float) -> str:
  if speed < 15 and deviation > 150:
    return 'slow-creep entry'
  if persistence < 1.0 and deviation > 120:
    return 'U-turn probe'
  if deviation > 170:
    return 'head-on intrusion'
  if speed > 60:
    return 'high-speed wrong-way'
  return 'wrong-way violation'


def compute_confidence(deviation: float, persistence: float, speed: float, crowd_ok: bool) -> float:
  deviation_score = min(deviation / 180.0, 1.0) * 50.0
  persistence_score = min(persistence / PERSISTENCE_WINDOW_SEC, 1.0) * 20.0
  speed_score = min(speed / 30.0, 1.0) * 15.0
  crowd_score = 15.0 if crowd_ok else 0.0
  return round(min(deviation_score + persistence_score + speed_score + crowd_score, 100.0), 1)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
  radius = 6371000
  phi1 = math.radians(lat1)
  phi2 = math.radians(lat2)
  dphi = math.radians(lat2 - lat1)
  dlambda = math.radians(lon2 - lon1)
  a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
  return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def compute_closing_speed(v1_bearing: float, v1_speed: float, v2_bearing: float, v2_speed: float) -> float:
  angle_diff = angular_difference(v1_bearing, v2_bearing)
  factor = math.cos(math.radians(180 - angle_diff))
  return round((v1_speed + v2_speed) * max(factor, 0), 1)


class WrongWayDetector:
  def __init__(self, graph: nx.MultiDiGraph):
    self.G = graph
    self.vehicles: dict[str, VehicleState] = {}
    self.crowd = CrowdConsensus()
    self.alerts: list[Alert] = []
    self.alert_counter = 0

  def _next_alert_id(self) -> str:
    self.alert_counter += 1
    return f'WWD-{self.alert_counter:04d}'

  def process_tick(
    self,
    vehicle_id: str,
    lat: float,
    lon: float,
    speed_kmh: float,
    timestamp: float,
  ) -> Optional[Alert]:
    prev = self.vehicles.get(vehicle_id)
    if prev is None:
      self.vehicles[vehicle_id] = VehicleState(
        vehicle_id=vehicle_id,
        lat=lat,
        lon=lon,
        speed_kmh=speed_kmh,
        bearing=0.0,
        timestamp=timestamp,
      )
      return None

    if haversine_distance(prev.lat, prev.lon, lat, lon) < 1.0:
      bearing = prev.bearing
    else:
      bearing = compute_bearing(prev.lat, prev.lon, lat, lon)

    if speed_kmh < SPEED_GATE_KMH:
      self.vehicles[vehicle_id] = VehicleState(
        vehicle_id=vehicle_id,
        lat=lat,
        lon=lon,
        speed_kmh=speed_kmh,
        bearing=bearing,
        timestamp=timestamp,
        suspicion_start=prev.suspicion_start,
        wrong_way_start=None,
        alert_active=False,
        suspicion_active=False,
      )
      return None

    edge = snap_to_edge(self.G, lat, lon)
    if edge is None:
      return None

    u, v, key, edge_data = edge
    edge_key = (u, v, key)
    allowed_bearing = get_edge_bearing(self.G, u, v)
    one_way = is_one_way(edge_data)
    deviation = angular_difference(bearing, allowed_bearing)

    self.crowd.record(edge_key, bearing, allowed_bearing, timestamp)

    if not one_way:
      reverse_bearing = (allowed_bearing + 180) % 360
      deviation = min(deviation, angular_difference(bearing, reverse_bearing))

    suspicion_active = False
    suspicion_start = prev.suspicion_start
    if deviation > SUSPICION_THRESHOLD and speed_kmh < SUSPICION_SPEED_MAX and one_way:
      suspicion_active = True
      if suspicion_start is None:
        suspicion_start = timestamp
    elif deviation <= SUSPICION_THRESHOLD:
      suspicion_start = None

    is_wrong_heading = deviation > HEADING_MISMATCH_THRESHOLD and one_way
    wrong_way_start = prev.wrong_way_start
    alert_active = prev.alert_active
    alert_to_return = None

    if is_wrong_heading:
      if wrong_way_start is None:
        wrong_way_start = timestamp

      persistence = timestamp - wrong_way_start
      is_diversion = self.crowd.is_diversion(edge_key, timestamp)

      if is_diversion:
        wrong_way_start = None
        alert_active = False
      elif persistence >= PERSISTENCE_WINDOW_SEC and not alert_active:
        alert_active = True
        confidence = compute_confidence(deviation, persistence, speed_kmh, not is_diversion)
        attack_class = classify_attack(deviation, speed_kmh, persistence)
        at_risk = self._find_at_risk_vehicles(vehicle_id, lat, lon, bearing, speed_kmh)
        alert = Alert(
          alert_id=self._next_alert_id(),
          vehicle_id=vehicle_id,
          lat=lat,
          lon=lon,
          heading_deviation=round(deviation, 1),
          confidence=confidence,
          attack_class=attack_class,
          timestamp=timestamp,
          alert_type='confirmed',
          vehicles_at_risk=at_risk,
        )
        self.alerts.append(alert)
        alert_to_return = alert
      elif suspicion_active and not alert_active and not prev.suspicion_active:
        confidence = compute_confidence(deviation, 0.5, speed_kmh, True) * 0.6
        alert = Alert(
          alert_id=self._next_alert_id(),
          vehicle_id=vehicle_id,
          lat=lat,
          lon=lon,
          heading_deviation=round(deviation, 1),
          confidence=round(confidence, 1),
          attack_class='approaching wrong-way entry',
          timestamp=timestamp,
          alert_type='suspicion',
          vehicles_at_risk=[],
        )
        self.alerts.append(alert)
        alert_to_return = alert
    else:
      if alert_active:
        alert = Alert(
          alert_id=self._next_alert_id(),
          vehicle_id=vehicle_id,
          lat=lat,
          lon=lon,
          heading_deviation=round(deviation, 1),
          confidence=0.0,
          attack_class='resolved',
          timestamp=timestamp,
          alert_type='resolved',
        )
        self.alerts.append(alert)
        alert_to_return = alert
      wrong_way_start = None
      alert_active = False

    self.vehicles[vehicle_id] = VehicleState(
      vehicle_id=vehicle_id,
      lat=lat,
      lon=lon,
      speed_kmh=speed_kmh,
      bearing=bearing,
      timestamp=timestamp,
      suspicion_start=suspicion_start,
      wrong_way_start=wrong_way_start,
      alert_active=alert_active,
      suspicion_active=suspicion_active,
      confidence=compute_confidence(
        deviation,
        timestamp - (wrong_way_start or timestamp),
        speed_kmh,
        True,
      )
      if alert_active
      else 0.0,
      edge_key=edge_key,
      heading_deviation=round(deviation, 1),
      attack_class=classify_attack(deviation, speed_kmh, 0) if alert_active else 'none',
    )
    return alert_to_return

  def _find_at_risk_vehicles(
    self,
    wrong_way_id: str,
    wrong_way_lat: float,
    wrong_way_lon: float,
    wrong_way_bearing: float,
    wrong_way_speed: float,
  ) -> list[VehicleAtRisk]:
    at_risk: list[VehicleAtRisk] = []
    for vehicle_id, state in self.vehicles.items():
      if vehicle_id == wrong_way_id:
        continue
      distance = haversine_distance(wrong_way_lat, wrong_way_lon, state.lat, state.lon)
      if distance > ALERT_RADIUS_M or state.speed_kmh < CLOSE_APPROACH_SPEED_MIN:
        continue

      closing_speed = compute_closing_speed(wrong_way_bearing, wrong_way_speed, state.bearing, state.speed_kmh)
      if closing_speed <= 0:
        continue

      closing_speed_ms = closing_speed / 3.6
      ttc = distance / closing_speed_ms if closing_speed_ms > 0 else 9999.0
      risk_score = round((closing_speed / 100.0) * (1 - distance / ALERT_RADIUS_M) * 100, 1)
      at_risk.append(
        VehicleAtRisk(
          vehicle_id=vehicle_id,
          lat=state.lat,
          lon=state.lon,
          closing_speed_kmh=closing_speed,
          estimated_ttc_sec=round(ttc, 1),
          risk_score=risk_score,
        ),
      )

    at_risk.sort(key=lambda item: item.estimated_ttc_sec)
    return at_risk

  def get_vehicle_statuses(self) -> dict:
    return {
      vehicle_id: {
        'vehicle_id': vehicle_id,
        'lat': state.lat,
        'lon': state.lon,
        'speed_kmh': state.speed_kmh,
        'bearing': state.bearing,
        'alert_active': state.alert_active,
        'suspicion_active': state.suspicion_active,
        'confidence': state.confidence,
        'heading_deviation': state.heading_deviation,
        'attack_class': state.attack_class,
      }
      for vehicle_id, state in self.vehicles.items()
    }

  def get_active_alerts(self) -> list:
    active: dict[str, dict] = {}
    for alert in self.alerts:
      if alert.alert_type == 'resolved':
        active.pop(alert.vehicle_id, None)
      else:
        active[alert.vehicle_id] = {
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
        }
    return list(active.values())

