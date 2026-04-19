"""
Dead-reckoning helper when GNSS updates are sparse (offline / tunnel transitions).

Uses last known position, speed, and heading with a simple flat-earth step.
"""

from __future__ import annotations

import math
from typing import Any


def _meters_to_lat_lon_delta(
  lat: float,
  distance_north_m: float,
  distance_east_m: float,
) -> tuple[float, float]:
  # WGS84 approximate
  dlat = distance_north_m / 111_320.0
  dlon = distance_east_m / (111_320.0 * max(0.2, math.cos(math.radians(lat))))
  return dlat, dlon


def predict_next_position(
  lat: float,
  lon: float,
  speed_kmh: float,
  bearing_deg: float,
  dt_sec: float,
) -> dict[str, Any]:
  """
  Returns predicted lat/lon and uncertainty growth (meters, heuristic).
  """
  v = max(0.0, speed_kmh) / 3.6  # m/s
  dist = v * max(0.0, dt_sec)
  brng = math.radians(bearing_deg)
  north = dist * math.cos(brng)
  east = dist * math.sin(brng)
  dlat, dlon = _meters_to_lat_lon_delta(lat, north, east)
  pred_lat = lat + dlat
  pred_lon = lon + dlon
  # Uncertainty grows with speed and time (simple bound)
  uncertainty_m = 3.0 + 0.35 * dist + 0.02 * (speed_kmh ** 1.15)
  return {
    'lat': pred_lat,
    'lon': pred_lon,
    'bearing_deg': bearing_deg,
    'uncertainty_m': round(uncertainty_m, 1),
  }


def smooth_heading(previous: float, measured: float, alpha: float = 0.35) -> float:
  """Exponential smoothing on a circle."""
  x = (1 - alpha) * math.sin(math.radians(previous)) + alpha * math.sin(math.radians(measured))
  y = (1 - alpha) * math.cos(math.radians(previous)) + alpha * math.cos(math.radians(measured))
  return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0
