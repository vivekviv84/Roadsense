import math
import os

import networkx as nx
import osmnx as ox


def load_graph(place: str = 'Bengaluru, India', network_type: str = 'drive') -> nx.MultiDiGraph:
  graph = ox.graph_from_place(place, network_type=network_type)
  graph = ox.add_edge_speeds(graph)
  graph = ox.add_edge_travel_times(graph)
  return graph


def load_graph_bbox(north, south, east, west, network_type='drive') -> nx.MultiDiGraph:
  bbox = (west, south, east, north)
  try:
    graph = ox.graph_from_bbox(bbox, network_type=network_type)
  except TypeError:
    # OSMnx < 2 accepted north/south/east/west as positional arguments.
    graph = ox.graph_from_bbox(north, south, east, west, network_type=network_type)
  graph = ox.add_edge_speeds(graph)
  graph = ox.add_edge_travel_times(graph)
  return graph


def save_graph(graph: nx.MultiDiGraph, path: str):
  os.makedirs(os.path.dirname(path), exist_ok=True)
  ox.save_graphml(graph, path)


def load_graph_from_file(path: str) -> nx.MultiDiGraph:
  return ox.load_graphml(path)


def compute_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
  lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
  dlon = lon2 - lon1
  x = math.sin(dlon) * math.cos(lat2)
  y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
  bearing = math.degrees(math.atan2(x, y))
  return (bearing + 360) % 360


def angular_difference(a: float, b: float) -> float:
  diff = abs(a - b) % 360
  return diff if diff <= 180 else 360 - diff


def snap_to_edge(graph: nx.MultiDiGraph, lat: float, lon: float):
  try:
    nearest = ox.nearest_edges(graph, lon, lat, return_dist=False)
  except Exception:
    return None
  if not (isinstance(nearest, tuple) and len(nearest) == 3):
    return None
  u, v, key = nearest
  edge_data = graph.edges[u, v, key]
  return u, v, key, edge_data


def get_edge_bearing(graph: nx.MultiDiGraph, u: int, v: int) -> float:
  u_data = graph.nodes[u]
  v_data = graph.nodes[v]
  return compute_bearing(u_data['y'], u_data['x'], v_data['y'], v_data['x'])


def is_one_way(edge_data: dict) -> bool:
  one_way = edge_data.get('oneway', False)
  if isinstance(one_way, bool):
    return one_way
  if isinstance(one_way, str):
    return one_way.lower() in ('yes', 'true', '1')
  return False
