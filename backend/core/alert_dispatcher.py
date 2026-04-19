"""
Build structured alerts for nearby drivers and pedestrians when a wrong-way vehicle is active.
"""

from __future__ import annotations

import math
from typing import Any, Optional

from backend.core.collision_predictor import (
  RiskLevel,
  predict_collision_risk,
  relative_bearing_category,
)
from backend.core.detector import haversine_distance


def _bearing_point(lat: float, lon: float, bearing_deg: float, distance_m: float) -> tuple[float, float]:
  """Approximate destination point for short distances."""
  R = 6371000.0
  brng = math.radians(bearing_deg)
  lat1 = math.radians(lat)
  lon1 = math.radians(lon)
  dr = distance_m / R
  lat2 = math.asin(math.sin(lat1) * math.cos(dr) + math.cos(lat1) * math.sin(dr) * math.cos(brng))
  lon2 = lon1 + math.atan2(
    math.sin(brng) * math.sin(dr) * math.cos(lat1),
    math.cos(dr) - math.sin(lat1) * math.sin(lat2),
  )
  return math.degrees(lat2), math.degrees(lon2)


def _direction_label(ego_bearing: float, target_bearing: float) -> str:
  rel = relative_bearing_category(ego_bearing, target_bearing)
  return {
    'closing': 'ahead-closing',
    'same': 'same-direction',
    'opposite': 'oncoming',
    'crossing': 'crossing-path',
  }[rel]


def build_driver_alerts(
  ego_lat: float,
  ego_lon: float,
  ego_bearing: float,
  ego_speed_kmh: float,
  wrong_lat: float,
  wrong_lon: float,
  wrong_bearing: float,
  wrong_speed_kmh: float,
) -> dict[str, Any]:
  distance_m = haversine_distance(ego_lat, ego_lon, wrong_lat, wrong_lon)
  assessment = predict_collision_risk(
    distance_m,
    ego_speed_kmh,
    ego_bearing,
    wrong_speed_kmh,
    wrong_bearing,
  )
  return {
    'target': 'driver',
    'distance_m': round(distance_m, 1),
    'relative_direction': _direction_label(ego_bearing, wrong_bearing),
    'collision_risk': assessment.risk_level.value,
    'collision_probability': assessment.probability_score,
    'closing_speed_kmh': assessment.closing_speed_kmh,
    'eta_impact_sec': assessment.estimated_ttc_sec,
    'safe_stop_distance_m': assessment.safe_stop_distance_m,
  }


def build_pedestrian_alerts(
  wrong_lat: float,
  wrong_lon: float,
  wrong_bearing: float,
  wrong_speed_kmh: float,
  pedestrian_points: list[dict[str, Any]],
) -> list[dict[str, Any]]:
  """
  pedestrian_points: {lat, lon} optional id
  """
  alerts: list[dict[str, Any]] = []
  for p in pedestrian_points:
    plat = float(p['lat'])
    plon = float(p['lon'])
    dist = haversine_distance(wrong_lat, wrong_lon, plat, plon)
    if dist > 120:
      continue
    # Pedestrians assumed stationary; risk based on wrong-way vehicle proximity + speed
    assessment = predict_collision_risk(
      dist,
      wrong_speed_kmh,
      wrong_bearing,
      0.0,
      (wrong_bearing + 180.0) % 360.0,
    )
    risk = assessment.risk_level
    if risk == RiskLevel.LOW and dist > 40:
      continue
    alerts.append(
      {
        'target': 'pedestrian',
        'id': p.get('id'),
        'distance_m': round(dist, 1),
        'collision_risk': risk.value,
        'advisory': 'Move away from carriageway; wrong-way vehicle nearby.',
      },
    )
  return alerts


def dispatch_nearby_bundle(
  ego_lat: float,
  ego_lon: float,
  ego_bearing: float,
  ego_speed_kmh: float,
  wrong_lat: float,
  wrong_lon: float,
  wrong_bearing: float,
  wrong_speed_kmh: float,
  pedestrians: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
  pedestrians = pedestrians or []
  return {
    'driver_alert': build_driver_alerts(
      ego_lat,
      ego_lon,
      ego_bearing,
      ego_speed_kmh,
      wrong_lat,
      wrong_lon,
      wrong_bearing,
      wrong_speed_kmh,
    ),
    'pedestrians': build_pedestrian_alerts(
      wrong_lat,
      wrong_lon,
      wrong_bearing,
      wrong_speed_kmh,
      pedestrians,
    ),
  }


def synthetic_pedestrians_near_route(
  center_lat: float,
  center_lon: float,
  count: int = 6,
  radius_m: float = 35.0,
) -> list[dict[str, Any]]:
  """Demo-only: synthesize sidewalk points around a location for UI/testing."""
  pts: list[dict[str, Any]] = []
  step = max(1, int(360 / max(count, 1)))
  for i in range(count):
    ang = i * step
    lat, lon = _bearing_point(center_lat, center_lon, float(ang), radius_m * 0.35)
    pts.append({'id': f'ped_{i}', 'lat': lat, 'lon': lon})
  return pts
