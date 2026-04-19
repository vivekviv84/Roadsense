"""
Traffic-flow wrong-way detection.

Uses nearby vehicle headings to infer dominant flow direction. If the ego vehicle's
heading differs by more than 140° from that majority while moving above a speed gate,
we classify wrong-way — subject to minimum sample size for robustness.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Optional

# Tuned for dense Indian urban traffic: require clear flow consensus.
MIN_NEARBY_VEHICLES = 3
MIN_EGO_SPEED_KMH = 10.0
MIN_PEER_SPEED_KMH = 10.0
OPPOSITE_HEADING_DEG = 140.0


def _angular_difference_deg(a: float, b: float) -> float:
  d = abs(a - b) % 360.0
  return min(d, 360.0 - d)


def _circular_mean_deg(bearings: list[float]) -> float:
  if not bearings:
    return 0.0
  sx = sum(math.sin(math.radians(b)) for b in bearings)
  sy = sum(math.cos(math.radians(b)) for b in bearings)
  return (math.degrees(math.atan2(sx, sy)) + 360.0) % 360.0


@dataclass
class TrafficFlowWrongWayResult:
  active: bool
  confidence: float
  current_heading: float
  expected_heading: float
  heading_delta: float
  nearby_count: int
  majority_support: float
  reason: str

  def to_dict(self) -> dict[str, Any]:
    return {
      'active': self.active,
      'confidence': round(self.confidence, 1),
      'current_heading': round(self.current_heading, 1),
      'expected_heading': round(self.expected_heading, 1),
      'heading_delta': round(self.heading_delta, 1),
      'nearby_count': self.nearby_count,
      'majority_support': round(self.majority_support, 2),
      'reason': self.reason,
    }


def analyze_traffic_flow_wrong_way(
  ego_bearing_deg: float,
  ego_speed_kmh: float,
  nearby_vehicles: list[dict[str, Any]],
) -> TrafficFlowWrongWayResult:
  """
  nearby_vehicles: items with keys bearing (deg), speed_kmh (optional).
  """
  peers: list[float] = []
  for v in nearby_vehicles:
    spd = float(v.get('speed_kmh') or 0.0)
    if spd < MIN_PEER_SPEED_KMH:
      continue
    peers.append(float(v.get('bearing') or 0.0))

  if ego_speed_kmh < MIN_EGO_SPEED_KMH or len(peers) < MIN_NEARBY_VEHICLES:
    return TrafficFlowWrongWayResult(
      active=False,
      confidence=0.0,
      current_heading=ego_bearing_deg,
      expected_heading=ego_bearing_deg,
      heading_delta=0.0,
      nearby_count=len(peers),
      majority_support=0.0,
      reason='insufficient_flow_or_speed',
    )

  majority = _circular_mean_deg(peers)
  delta = _angular_difference_deg(ego_bearing_deg, majority)

  # Fraction of peers within 45° of majority = flow coherence (India: chaotic lanes).
  aligned = sum(1 for b in peers if _angular_difference_deg(b, majority) <= 45.0)
  majority_support = aligned / max(len(peers), 1)

  active = delta > OPPOSITE_HEADING_DEG
  # Confidence blends heading opposition and how coherent traffic is.
  confidence = min(100.0, (delta / 180.0) * 70.0 + majority_support * 30.0)

  reason = 'wrong_way_opposite_flow' if active else 'aligned_with_flow'
  return TrafficFlowWrongWayResult(
    active=active,
    confidence=confidence,
    current_heading=ego_bearing_deg,
    expected_heading=majority,
    heading_delta=delta,
    nearby_count=len(peers),
    majority_support=majority_support,
    reason=reason,
  )


def merge_with_gps_noise_guard(
  result: TrafficFlowWrongWayResult,
  gps_accuracy_m: Optional[float],
) -> TrafficFlowWrongWayResult:
  """Reduce false positives when GPS accuracy is poor (typical urban canyons)."""
  if gps_accuracy_m is None or gps_accuracy_m < 35:
    return result
  # Above ~35m uncertainty, soften confidence and suppress marginal alerts.
  if not result.active:
    return result
  softened = TrafficFlowWrongWayResult(
    active=result.active and result.confidence >= 55.0,
    confidence=max(0.0, result.confidence * 0.65),
    current_heading=result.current_heading,
    expected_heading=result.expected_heading,
    heading_delta=result.heading_delta,
    nearby_count=result.nearby_count,
    majority_support=result.majority_support,
    reason='gps_noise_guard' if result.confidence < 55.0 else result.reason,
  )
  return softened
