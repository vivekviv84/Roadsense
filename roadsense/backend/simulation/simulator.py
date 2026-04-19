import math
import random
from dataclasses import dataclass
from typing import Optional

import networkx as nx
import numpy as np

GPS_NOISE_M = 4.0
TICK_INTERVAL = 0.5
DEFAULT_SPEED_KMH = 35.0
WRONG_WAY_SPEED_KMH = 25.0


@dataclass
class SimVehicle:
  vehicle_id: str
  route_nodes: list
  current_node_idx: int = 0
  progress: float = 0.0
  speed_kmh: float = DEFAULT_SPEED_KMH
  is_wrong_way: bool = False
  is_active: bool = True
  lat: float = 0.0
  lon: float = 0.0
  label: str = 'normal'


def add_gps_noise(lat: float, lon: float, noise_m: float = GPS_NOISE_M):
  dlat = random.gauss(0, noise_m) / 111320
  dlon = random.gauss(0, noise_m) / (111320 * math.cos(math.radians(lat)))
  return lat + dlat, lon + dlon


def get_node_coords(graph: nx.MultiDiGraph, node_id: int) -> tuple:
  data = graph.nodes[node_id]
  return data['y'], data['x']


def get_route(graph: nx.MultiDiGraph, origin_node: int, dest_node: int) -> Optional[list]:
  try:
    return nx.shortest_path(graph, origin_node, dest_node, weight='travel_time')
  except (nx.NetworkXNoPath, nx.NodeNotFound):
    return None


def get_random_route(graph: nx.MultiDiGraph, min_length: int = 8) -> Optional[list]:
  nodes = list(graph.nodes)
  for _ in range(50):
    origin = random.choice(nodes)
    dest = random.choice(nodes)
    if origin == dest:
      continue
    route = get_route(graph, origin, dest)
    if route and len(route) >= min_length:
      return route
  return None


def interpolate_position(graph: nx.MultiDiGraph, route: list, node_idx: int, progress: float) -> tuple:
  if node_idx >= len(route) - 1:
    return get_node_coords(graph, route[-1])

  lat1, lon1 = get_node_coords(graph, route[node_idx])
  lat2, lon2 = get_node_coords(graph, route[node_idx + 1])
  lat = lat1 + (lat2 - lat1) * progress
  lon = lon1 + (lon2 - lon1) * progress
  return lat, lon


def advance_vehicle(graph: nx.MultiDiGraph, vehicle: SimVehicle, dt: float = TICK_INTERVAL) -> bool:
  route = vehicle.route_nodes
  if vehicle.current_node_idx >= len(route) - 1:
    vehicle.is_active = False
    return False

  lat1, lon1 = get_node_coords(graph, route[vehicle.current_node_idx])
  lat2, lon2 = get_node_coords(graph, route[vehicle.current_node_idx + 1])

  dx = math.radians(lon2 - lon1) * math.cos(math.radians(lat1)) * 6371000
  dy = math.radians(lat2 - lat1) * 6371000
  segment_length_m = math.sqrt(dx ** 2 + dy ** 2)

  if segment_length_m < 1.0:
    vehicle.current_node_idx += 1
    return True

  speed_ms = vehicle.speed_kmh / 3.6
  vehicle.progress += (speed_ms * dt) / segment_length_m

  while vehicle.progress >= 1.0:
    vehicle.progress -= 1.0
    vehicle.current_node_idx += 1
    if vehicle.current_node_idx >= len(route) - 1:
      vehicle.is_active = False
      return False

  lat, lon = interpolate_position(graph, route, vehicle.current_node_idx, vehicle.progress)
  vehicle.lat, vehicle.lon = add_gps_noise(lat, lon)
  return True


def reverse_route(route: list) -> list:
  return list(reversed(route))


class Simulator:
  def __init__(self, graph: nx.MultiDiGraph, seed: int = 42):
    self.G = graph
    random.seed(seed)
    np.random.seed(seed)
    self.vehicles: dict[str, SimVehicle] = {}
    self.tick_count = 0
    self.sim_time = 0.0

  def add_normal_vehicles(self, count: int = 12):
    added = 0
    attempts = 0
    while added < count and attempts < 200:
      attempts += 1
      route = get_random_route(self.G)
      if route is None:
        continue
      vehicle_id = f'V{added + 1:03d}'
      speed = max(15, min(random.gauss(DEFAULT_SPEED_KMH, 8), 70))
      start_idx = random.randint(0, max(0, len(route) - 5))
      vehicle = SimVehicle(
        vehicle_id=vehicle_id,
        route_nodes=route,
        current_node_idx=start_idx,
        speed_kmh=speed,
        label='normal',
      )
      lat, lon = interpolate_position(self.G, route, start_idx, 0.0)
      vehicle.lat, vehicle.lon = add_gps_noise(lat, lon)
      self.vehicles[vehicle_id] = vehicle
      added += 1

  def inject_wrong_way_vehicle(
    self,
    vehicle_id: str,
    label: str = 'wrong-way',
    speed_kmh: float = WRONG_WAY_SPEED_KMH,
    route: Optional[list] = None,
  ):
    if route is None:
      for _ in range(100):
        candidate_route = get_random_route(self.G, min_length=6)
        if candidate_route is None:
          continue
        for i in range(len(candidate_route) - 1):
          u = candidate_route[i]
          v = candidate_route[i + 1]
          if self.G.has_edge(u, v):
            edge_data = self.G.edges[u, v, 0]
            if edge_data.get('oneway', False):
              route = reverse_route(candidate_route[i : i + 6])
              break
        if route:
          break

      if not route:
        fallback_route = get_random_route(self.G) or []
        route = reverse_route(fallback_route)

    if not route or len(route) < 2:
      return

    vehicle = SimVehicle(
      vehicle_id=vehicle_id,
      route_nodes=route,
      current_node_idx=0,
      speed_kmh=speed_kmh,
      is_wrong_way=True,
      label=label,
    )
    lat, lon = interpolate_position(self.G, route, 0, 0.0)
    vehicle.lat, vehicle.lon = add_gps_noise(lat, lon)
    self.vehicles[vehicle_id] = vehicle

  def inject_scenario_diversion(self, count: int = 8):
    route = get_random_route(self.G, min_length=5)
    if not route:
      return
    reversed_route = reverse_route(route)
    for index in range(count):
      vehicle_id = f'DIV{index + 1:02d}'
      start_idx = random.randint(0, max(0, len(reversed_route) - 3))
      vehicle = SimVehicle(
        vehicle_id=vehicle_id,
        route_nodes=reversed_route,
        current_node_idx=start_idx,
        speed_kmh=random.uniform(10, 25),
        label='diversion',
      )
      lat, lon = interpolate_position(self.G, reversed_route, start_idx, 0.0)
      vehicle.lat, vehicle.lon = add_gps_noise(lat, lon)
      self.vehicles[vehicle_id] = vehicle

  def tick(self) -> list:
    self.tick_count += 1
    self.sim_time += TICK_INTERVAL
    observations = []
    to_remove: list[str] = []

    for vehicle_id, vehicle in self.vehicles.items():
      if not vehicle.is_active:
        to_remove.append(vehicle_id)
        continue

      vehicle.speed_kmh = max(5, vehicle.speed_kmh + random.gauss(0, 2))
      advanced = advance_vehicle(self.G, vehicle, TICK_INTERVAL)
      if not advanced:
        to_remove.append(vehicle_id)
        continue

      observations.append(
        {
          'vehicle_id': vehicle_id,
          'lat': vehicle.lat,
          'lon': vehicle.lon,
          'speed_kmh': round(vehicle.speed_kmh, 1),
          'timestamp': self.sim_time,
          'is_wrong_way': vehicle.is_wrong_way,
          'label': vehicle.label,
        },
      )

    for vehicle_id in to_remove:
      del self.vehicles[vehicle_id]

    return observations

  def is_running(self) -> bool:
    return len(self.vehicles) > 0

  def get_vehicle_labels(self) -> dict:
    return {vehicle_id: vehicle.label for vehicle_id, vehicle in self.vehicles.items()}


def build_scenario_1(graph: nx.MultiDiGraph) -> Simulator:
  simulator = Simulator(graph, seed=1)
  simulator.add_normal_vehicles(count=10)
  simulator.inject_wrong_way_vehicle('WWD-001', label='head-on intruder', speed_kmh=45)
  return simulator


def build_scenario_2(graph: nx.MultiDiGraph) -> Simulator:
  simulator = Simulator(graph, seed=2)
  simulator.add_normal_vehicles(count=6)
  simulator.inject_scenario_diversion(count=8)
  simulator.inject_wrong_way_vehicle('WWD-001', label='wrong-way intruder', speed_kmh=30)
  return simulator


def build_scenario_3(graph: nx.MultiDiGraph) -> Simulator:
  simulator = Simulator(graph, seed=3)
  simulator.add_normal_vehicles(count=15)
  simulator.inject_wrong_way_vehicle('WWD-001', label='urban wrong-way', speed_kmh=20)
  simulator.inject_wrong_way_vehicle('WWD-002', label='slow creep entry', speed_kmh=8)
  return simulator

