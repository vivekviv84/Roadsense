import time
import random
import math

class LocalSimVehicle:
    def __init__(self, v_id: str, lane: str, dir: int, position: float, speed_mps: float, max_speed_mps: float):
        self.id = v_id
        self.lane = lane
        self.dir = dir # -1 for oncoming, 1 for same dir
        self.position = position # meters along route
        self.speed = speed_mps
        self.max_speed = max_speed_mps
        self.acceleration = 2.5
        self.brake = 5.0
        self.active = True

class LocalTrafficSimulator:
    def __init__(self, route_length_m: float = 8000):
        self.route_length = route_length_m
        self.vehicles = []
        self.next_id_counter = 1
        self.last_tick = time.time()
        self.pool_size = 28
        
        # Lanes: left (oncoming), right (same direction)
        self.spawn_timers = {"left": 0, "right": 0}
        self.next_spawn_delays = {"left": 3.0, "right": 3.0}
        self.spawn_distance = {"left": 350.0, "right": 260.0}
        
    def reset(self, current_ego_m: float):
        self.vehicles = []
        self.spawn_timers = {"left": 0, "right": 0}
        self.seed_lane("left", current_ego_m, 4)
        self.seed_lane("right", current_ego_m, 4)
        self.last_tick = time.time()

    def wrap_position(self, pos: float) -> float:
        wrapped = pos % self.route_length
        return wrapped + self.route_length if wrapped < 0 else wrapped

    def seed_lane(self, lane: str, ego_m: float, count: int):
        dir = -1 if lane == "left" else 1
        min_dist = 45 * 1.8
        max_dist = min(self.spawn_distance[lane], self.route_length * 0.4)
        step = (max_dist - min_dist) / max(1, count - 1) if count > 1 else 0
        
        for i in range(count):
            dist = min_dist + i * step + random.uniform(-8, 8)
            pos = self.wrap_position(ego_m + (dist if dir == -1 else -dist))
            self.spawn_car(lane, pos, dir)

    def spawn_car(self, lane: str, pos: float, dir: int):
        if len([v for v in self.vehicles if v.active]) >= self.pool_size:
            return
            
        v_id = f"LT-{self.next_id_counter}"
        self.next_id_counter += 1
        
        if lane == "left":
            max_s = random.uniform(9, 14) # oncoming 32-50 km/h
        else:
            max_s = random.uniform(8, 13) # same dir 29-47 km/h
            
        speed = max_s * random.uniform(0.72, 0.9)
        
        veh = LocalSimVehicle(v_id, lane, dir, pos, speed, max_s)
        self.vehicles.append(veh)

    def direction_gap(self, fro: float, to: float, dir: int) -> float:
        coord_fro = fro if dir == 1 else self.route_length - fro
        coord_to = to if dir == 1 else self.route_length - to
        gap = coord_to - coord_fro
        if gap < 0:
            gap += self.route_length
        return gap

    def tick(self, ego_m: float):
        now = time.time()
        dt = min(0.1, now - self.last_tick)
        self.last_tick = now
        
        active_vehicles = [v for v in self.vehicles if v.active]
        
        for lane in ["left", "right"]:
            lane_cars = [v for v in active_vehicles if v.lane == lane]
            lane_dir = -1 if lane == "left" else 1
            
            # Sort by coordinate
            lane_cars.sort(key=lambda x: x.position if lane_dir == 1 else self.route_length - x.position)
            
            for index, car in enumerate(lane_cars):
                front_car = lane_cars[index + 1] if index < len(lane_cars) - 1 else None
                target_speed = car.max_speed
                
                if front_car:
                    gap = self.direction_gap(car.position, front_car.position, lane_dir)
                    safe_dist = 45.0
                    min_dist = 22.0
                    if gap < safe_dist:
                        ratio = max(0.0, min(1.0, (gap - min_dist) / max(safe_dist - min_dist, 1.0)))
                        target_speed = min(car.max_speed * ratio, front_car.speed + ratio * 2)
                    if gap < min_dist:
                        target_speed = min(target_speed, front_car.speed * 0.6)
                        
                if car.speed < target_speed:
                    car.speed = min(target_speed, car.speed + car.acceleration * dt)
                else:
                    car.speed = max(target_speed, car.speed - car.brake * dt)
                    
                car.position = self.wrap_position(car.position + lane_dir * car.speed * dt)

            # Cull far vehicles
            for car in lane_cars:
                rel = car.position - ego_m
                if rel > self.route_length / 2: rel -= self.route_length
                if rel < -self.route_length / 2: rel += self.route_length
                
                keep = rel <= 400.0 and rel >= -150.0
                if not keep:
                    car.active = False

            # Spawn logic
            if lane == "left":
                self.spawn_timers[lane] += dt
                if self.spawn_timers[lane] >= self.next_spawn_delays[lane]:
                    self.spawn_timers[lane] = 0
                    self.next_spawn_delays[lane] = random.uniform(1.5, 4.0)
                    
                    pos = self.wrap_position(ego_m + 250.0) # exact 250m ahead
                    
                    # Check clearance
                    can_spawn = True
                    for c in lane_cars:
                        if c.active and self.direction_gap(pos, c.position, lane_dir) < 38.0:
                            can_spawn = False
                            break
                    if can_spawn:
                        self.spawn_car(lane, pos, lane_dir)
            else:
                # Right lane: ALWAYS maintain exactly ONE car within 30-120m ahead of ego
                has_car_ahead = False
                for c in lane_cars:
                    if c.active:
                        gap = self.direction_gap(ego_m, c.position, lane_dir)
                        if 30.0 <= gap <= 120.0:
                            has_car_ahead = True
                            break
                
                if not has_car_ahead:
                    # No car in checking window, let's spawn one exactly at 80m ahead
                    pos = self.wrap_position(ego_m + 80.0)
                    # Don't spawn into another car 
                    can_spawn = True
                    for c in lane_cars:
                        if c.active and self.direction_gap(pos, c.position, lane_dir) < 15.0:
                            can_spawn = False
                            break
                    if can_spawn:
                        self.spawn_car(lane, pos, lane_dir)

        # Remove inactive
        self.vehicles = [v for v in self.vehicles if v.active]
        
    def get_snapshot(self) -> dict:
        return {
            "vehicles": [
                {
                    "id": v.id,
                    "lane": v.lane,
                    "t": v.position / self.route_length,
                    "dir": v.dir,
                    "speed": round(v.speed * 3.6, 1), # m/s -> km/h
                    "position": round(v.position, 1) # added to meet requirement
                } for v in self.vehicles
            ],
            "traffic": {
                "density": "high" if len(self.vehicles) > 15 else "medium" if len(self.vehicles) > 5 else "low",
                "alerts": []
            } # simplified traffic obj
        }

local_simulator = LocalTrafficSimulator()
