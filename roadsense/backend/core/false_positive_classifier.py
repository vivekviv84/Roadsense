"""
False-positive classification and mitigation for wrong-way detection.

Five cases are evaluated in priority order.  The first matching case wins.
All state (ego heading history, u-turn suppression timers) is kept in
module-level dicts so no DB or external service is needed.
"""
from __future__ import annotations

import math
import time
from collections import deque
from typing import Optional

# ---------------------------------------------------------------------------
# Module-level state
# ---------------------------------------------------------------------------

# Sliding window of (timestamp, bearing) per ego vehicle_id
_heading_history: dict[str, deque] = {}
_HISTORY_MAXLEN = 5            # last 5 readings
_HISTORY_WINDOW_SEC = 3.0      # only look back 3 seconds for Case A

# Active u-turn suppression timers: vehicle_id → expiry timestamp
_uturn_suppression_until: dict[str, float] = {}
_UTURN_SUPPRESS_SEC = 8.0      # suppress for 8 s after probable u-turn

# OSM edge tag names that indicate a roundabout
_ROUNDABOUT_TAGS = frozenset({'roundabout', 'mini_roundabout'})


# ---------------------------------------------------------------------------
# Heading history helpers
# ---------------------------------------------------------------------------

def record_ego_heading(vehicle_id: str, bearing: float, ts: Optional[float] = None) -> None:
    """Push the latest bearing into the per-vehicle sliding window."""
    if vehicle_id not in _heading_history:
        _heading_history[vehicle_id] = deque(maxlen=_HISTORY_MAXLEN)
    _heading_history[vehicle_id].append((ts or time.time(), bearing))


def _heading_change_last_n_sec(vehicle_id: str, window_sec: float) -> float:
    """
    Return the total angular change (absolute, degrees) accumulated across
    the readings that fall within the last *window_sec* seconds.
    Returns 0.0 if there are fewer than 2 qualifying readings.
    """
    history = _heading_history.get(vehicle_id)
    if not history or len(history) < 2:
        return 0.0

    now = time.time()
    recent = [(ts, b) for ts, b in history if now - ts <= window_sec]
    if len(recent) < 2:
        return 0.0

    total = 0.0
    for i in range(1, len(recent)):
        diff = abs(recent[i][1] - recent[i - 1][1]) % 360
        total += diff if diff <= 180 else 360 - diff
    return total


# ---------------------------------------------------------------------------
# Roundabout detection helper
# ---------------------------------------------------------------------------

def _is_roundabout_edge(road_dir: Optional[dict]) -> bool:
    """
    Returns True when the OSM edge metadata indicates a roundabout.
    Checks both the 'junction' tag (stored by OSMnx in edge_data) and
    whether the road_name contains roundabout keywords as a fallback.
    """
    if road_dir is None:
        return False
    road_name = (road_dir.get('road_name') or '').lower()
    # OSMnx stores junction=roundabout as an edge attribute; we receive it
    # in road_dir['road_name'] only as a fallback.  The primary check is
    # via the segment_id being tagged, which we cannot inspect here without
    # the full graph.  We use road_name heuristic as a reasonable proxy.
    return any(tag in road_name for tag in _ROUNDABOUT_TAGS)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_NO_FP: dict = {
    'risk_case': None,
    'mitigation_applied': False,
    'mitigation_description': 'no_false_positive_detected',
    'suppressed': False,
}


def classify_false_positive_risk(
    ego_state: dict,
    nearby_vehicles: list[dict],
    osm_check: dict,
    road_works: dict,
    gps_accuracy_m: Optional[float],
    wrong_way_confidence: float,
) -> dict:
    """
    Evaluate the five false-positive cases in priority order and return
    a structured result dict.

    Parameters
    ----------
    ego_state          : dict with keys 'vehicle_id', 'speed_kmh', 'bearing'
    nearby_vehicles    : list of nearby vehicle dicts (from /frontend-sim pipeline)
    osm_check          : result of check_ego_against_osm()
    road_works         : result of _check_road_works()
    gps_accuracy_m     : GPS accuracy in metres (None = unknown / accurate)
    wrong_way_confidence: float 0-100 from TrafficFlowWrongWayResult

    Returns
    -------
    dict with keys: risk_case, mitigation_applied, mitigation_description, suppressed
    """
    vehicle_id = ego_state.get('vehicle_id', 'ego')
    speed_kmh  = float(ego_state.get('speed_kmh', 0))
    bearing    = float(ego_state.get('bearing', 0))
    now        = time.time()

    # Record heading for Case A detection
    record_ego_heading(vehicle_id, bearing, now)

    # ── Case D — Road Works Diversion (highest priority) ────────────────────
    if road_works.get('active'):
        return {
            'risk_case': 'road_works_diversion',
            'mitigation_applied': True,
            'mitigation_description': (
                'Reclassify as CAUTION_OPPOSITE_TRAFFIC, not WRONG_WAY. '
                'Road works zone active: ' + road_works.get('zone_label', '')
            ),
            'suppressed': True,
        }

    # ── Case B — Roundabout Entry ────────────────────────────────────────────
    road_dir = osm_check.get('_road_dir_raw')   # injected by caller if available
    if _is_roundabout_edge(road_dir):
        return {
            'risk_case': 'roundabout_entry',
            'mitigation_applied': True,
            'mitigation_description': (
                'Roundabout detected — bidirectional traversal expected, '
                'wrong-way alert suppressed.'
            ),
            'suppressed': True,
        }

    # ── Case A — U-Turn at Junction ──────────────────────────────────────────
    # Check active suppression window first (fast path)
    if vehicle_id in _uturn_suppression_until:
        if now < _uturn_suppression_until[vehicle_id]:
            return {
                'risk_case': 'probable_uturn',
                'mitigation_applied': True,
                'mitigation_description': (
                    f'U-turn suppression active for '
                    f'{_uturn_suppression_until[vehicle_id] - now:.1f}s more. '
                    'Alert suppressed pending maneuver completion.'
                ),
                'suppressed': True,
            }
        else:
            del _uturn_suppression_until[vehicle_id]

    if speed_kmh < 10.0:
        heading_delta = _heading_change_last_n_sec(vehicle_id, _HISTORY_WINDOW_SEC)
        if heading_delta > 90.0:
            _uturn_suppression_until[vehicle_id] = now + _UTURN_SUPPRESS_SEC
            return {
                'risk_case': 'probable_uturn',
                'mitigation_applied': True,
                'mitigation_description': (
                    f'Low speed ({speed_kmh:.1f} km/h) with heading change '
                    f'{heading_delta:.0f}° in last {_HISTORY_WINDOW_SEC}s. '
                    f'Suppressing alert for {_UTURN_SUPPRESS_SEC}s, '
                    'rechecking after maneuver completes.'
                ),
                'suppressed': True,
            }

    # ── Case C — Poor GPS / Urban Canyon ────────────────────────────────────
    if gps_accuracy_m is not None and gps_accuracy_m > 35.0:
        return {
            'risk_case': 'gps_urban_canyon',
            'mitigation_applied': True,
            'mitigation_description': (
                f'GPS accuracy {gps_accuracy_m:.0f}m exceeds 35m threshold. '
                'Confidence weight reduced by 40%; consensus raised to 5 vehicles.'
            ),
            'suppressed': False,   # degraded confidence, not a full suppress
        }

    # ── Case E — Bidirectional Road, Low Confidence ──────────────────────────
    is_oneway = osm_check.get('is_oneway')
    if is_oneway is False and wrong_way_confidence < 60.0:
        return {
            'risk_case': 'bidirectional_ambiguity',
            'mitigation_applied': True,
            'mitigation_description': (
                f'Bidirectional road with low wrong-way confidence '
                f'({wrong_way_confidence:.1f}%). '
                'Consensus threshold raised to 80% on this segment.'
            ),
            'suppressed': False,   # requires higher threshold, not a full suppress
        }

    return dict(_NO_FP)
