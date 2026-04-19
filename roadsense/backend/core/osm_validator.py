"""
OSM-based road direction validator.

Uses the already-loaded NetworkX/OSMnx graph to check whether the
ego vehicle is travelling in the legally allowed direction on the
nearest OSM edge.  This is an independent signal from the
traffic-flow consensus check.
"""
from __future__ import annotations

from typing import Optional

import networkx as nx

from backend.core.road_network import (
    angular_difference,
    get_edge_bearing,
    is_one_way,
    snap_to_edge,
)

# Degrees of heading deviation that constitute a wrong-way violation
_VIOLATION_THRESHOLD_DEG = 120.0


def get_road_direction(G: nx.MultiDiGraph, lat: float, lon: float) -> Optional[dict]:
    """
    Find the nearest OSM edge to (lat, lon) and return its direction metadata.

    Returns None if the graph is unavailable or no edge can be found.

    Return dict keys:
      segment_id      – OSM way ID (int or str)
      allowed_bearing – geometric bearing u→v in degrees [0, 360)
      is_oneway       – True when the OSM 'oneway' attribute is set
      reverse_allowed – True when the road is bidirectional
      road_name       – street name from OSM 'name' attribute, or 'Unknown'
    """
    if G is None:
        return None

    result = snap_to_edge(G, lat, lon)
    if result is None:
        return None

    u, v, _key, edge_data = result

    allowed_bearing = get_edge_bearing(G, u, v)
    oneway = is_one_way(edge_data)

    # OSM way ID — may be a list when several ways share the same edge
    osmid = edge_data.get('osmid')
    if isinstance(osmid, list):
        osmid = osmid[0]

    # Road name — OSMnx can return a list for conflated edges
    name = edge_data.get('name')
    if isinstance(name, list):
        name = name[0]

    return {
        'segment_id': osmid,
        'allowed_bearing': round(allowed_bearing, 1),
        'is_oneway': oneway,
        'reverse_allowed': not oneway,
        'road_name': str(name) if name else 'Unknown',
    }


def check_ego_against_osm(ego_bearing: float, road_dir: Optional[dict]) -> dict:
    """
    Compare the ego vehicle's heading against the OSM-defined allowed direction.

    Rules
    -----
    • road not found   → osm_violation=False, reason='road_not_found'
    • bidirectional    → osm_violation=False, reason='bidirectional_road'
    • one-way, deviation ≤ 120° → osm_violation=False, reason='aligned_with_oneway_road'
    • one-way, deviation  > 120° → osm_violation=True
        confidence:  'high'   deviation > 150°
                     'medium' deviation > 135°
                     'low'    deviation > 120°
    """
    base = {
        'osm_violation': False,
        'allowed_bearing': None,
        'is_oneway': None,
        'road_name': None,
        'confidence': 'none',
        'reason': 'road_not_found',
    }

    if road_dir is None:
        return base

    base['allowed_bearing'] = road_dir['allowed_bearing']
    base['is_oneway'] = road_dir['is_oneway']
    base['road_name'] = road_dir['road_name']

    if not road_dir['is_oneway']:
        base['reason'] = 'bidirectional_road'
        return base

    # One-way road — measure deviation
    deviation = angular_difference(ego_bearing, road_dir['allowed_bearing'])

    if deviation <= _VIOLATION_THRESHOLD_DEG:
        base['reason'] = 'aligned_with_oneway_road'
        return base

    # Violation detected
    if deviation > 150:
        confidence = 'high'
    elif deviation > 135:
        confidence = 'medium'
    else:
        confidence = 'low'

    return {
        'osm_violation': True,
        'allowed_bearing': road_dir['allowed_bearing'],
        'is_oneway': True,
        'road_name': road_dir['road_name'],
        'confidence': confidence,
        'reason': f'wrong-way on one-way road (deviation {round(deviation, 1)}\u00b0)',
    }
