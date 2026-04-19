"""
Collision risk estimation using distance, relative heading, speeds, and braking distance.

Calibrated for typical Indian road conditions: conservative braking, mixed traffic.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum
from typing import Any, Literal

from backend.core.detector import haversine_distance


class RiskLevel(str, Enum):
  LOW = 'LOW'
  MEDIUM = 'MEDIUM'
  HIGH = 'HIGH'


# Comfortable decel on mixed roads (~0.35g)
DEFAULT_DECEL_MPS2 = 3.5
# Reaction + actuator delay (seconds)
REACTION_TIME_SEC = 0.9


def _kmh_to_mps(kmh: float) -> float:
  return max(0.0, kmh) / 3.6


def braking_distance_m(speed_kmh: float, decel_mps2: float = DEFAULT_DECEL_MPS2) -> float:
  v = _kmh_to_mps(speed_kmh)
  if decel_mps2 <= 0:
    return 0.0
  return (v * v) / (2.0 * decel_mps2)


def time_to_collision_sec(distance_m: float, closing_speed_mps: float) -> float:
  if closing_speed_mps <= 0.05:
    return 9999.0
  return max(0.0, distance_m / closing_speed_mps)


def relative_bearing_category(
  ego_bearing: float,
  target_bearing: float,
) -> Literal['closing', 'same', 'opposite', 'crossing']:
  d = abs(ego_bearing - target_bearing) % 360.0
  d = min(d, 360.0 - d)
  if d < 35:
    return 'same'
  if d > 145:
    return 'opposite'
  if 55 < d < 125:
    return 'crossing'
  return 'closing'


@dataclass
class CollisionAssessment:
  risk_level: RiskLevel
  probability_score: float  # 0..1
  closing_speed_kmh: float
  estimated_ttc_sec: float
  safe_stop_distance_m: float
  notes: str

  def to_dict(self) -> dict[str, Any]:
    return {
      'risk_level': self.risk_level.value,
      'probability_score': round(self.probability_score, 2),
      'closing_speed_kmh': round(self.closing_speed_kmh, 1),
      'estimated_ttc_sec': round(self.estimated_ttc_sec, 2),
      'safe_stop_distance_m': round(self.safe_stop_distance_m, 1),
      'notes': self.notes,
    }


def predict_collision_risk(
  distance_m: float,
  ego_speed_kmh: float,
  ego_bearing: float,
  other_speed_kmh: float,
  other_bearing: float,
  *,
  decel_mps2: float = DEFAULT_DECEL_MPS2,
) -> CollisionAssessment:
  """
  Probability heuristic: combines TTC vs required stopping distance with closing geometry.
  """
  # Closing speed along line of sight (simplified)
  v1 = _kmh_to_mps(ego_speed_kmh)
  v2 = _kmh_to_mps(other_speed_kmh)
  rel = relative_bearing_category(ego_bearing, other_bearing)
  if rel == 'opposite':
    closing = v1 + v2
  elif rel == 'same':
    closing = abs(v1 - v2)
  else:
    closing = max(0.0, (v1 + v2) * 0.55)

  ttc = time_to_collision_sec(distance_m, closing)
  stop_need = braking_distance_m(ego_speed_kmh, decel_mps2) + REACTION_TIME_SEC * v1

  # Map to probability
  if ttc > 12 or closing < 0.5:
    prob = 0.08
    level = RiskLevel.LOW
    notes = 'Low closure; monitor.'
  elif ttc > 6 and distance_m > stop_need * 1.6:
    prob = 0.22
    level = RiskLevel.LOW
    notes = 'Adequate space if braking early.'
  elif ttc > 3 and distance_m > stop_need * 1.1:
    prob = 0.45
    level = RiskLevel.MEDIUM
    notes = 'Brake smoothly; maintain lane.'
  else:
    prob = min(0.95, 0.55 + (stop_need / max(distance_m, 1.0)) * 0.25)
    level = RiskLevel.HIGH
    notes = 'High risk: prepare evasive maneuver if safe.'

  return CollisionAssessment(
    risk_level=level,
    probability_score=prob,
    closing_speed_kmh=closing * 3.6,
    estimated_ttc_sec=ttc,
    safe_stop_distance_m=stop_need,
    notes=notes,
  )


def assess_wrong_way_threat(
  ego_lat: float,
  ego_lon: float,
  ego_speed_kmh: float,
  ego_bearing: float,
  wrong_lat: float,
  wrong_lon: float,
  wrong_speed_kmh: float,
  wrong_bearing: float,
) -> CollisionAssessment:
  distance_m = haversine_distance(ego_lat, ego_lon, wrong_lat, wrong_lon)
  return predict_collision_risk(
    distance_m,
    ego_speed_kmh,
    ego_bearing,
    wrong_speed_kmh,
    wrong_bearing,
  )
