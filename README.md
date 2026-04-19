# RoadSense 🛣️
> AI-powered road safety intelligence — wrong-way detection, collision prediction, and 3D driving simulation in one full-stack platform.

![Python](https://img.shields.io/badge/Python-3.11+-blue?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-black?style=flat-square&logo=threedotjs)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

---

## What is RoadSense?

RoadSense is a full-stack ADAS (Advanced Driver Assistance System) prototype that combines **real-time AI detection**, **physics-based collision modeling**, and **3D driving simulation** to replicate the intelligence found in production road safety systems.

It is not a demo. It is built around real map data (OpenStreetMap), a learning road intelligence layer, and a multi-signal detection pipeline that runs on a 900ms cycle.

---

## Features

| System | What it does |
|---|---|
| **Wrong-Way Detection** | Dual-layer architecture — local lane logic + backend AI consensus |
| **Collision Prediction** | Physics-based TTC + risk scoring per vehicle pair |
| **3D Simulation Engine** | WebGL scene with NPC traffic, AABB collision, and ego vehicle control |
| **Road Intelligence** | SQLite-backed learning system per road segment, per time-of-day |
| **Scenario Engine** | 3 built-in adversarial test scenarios |
| **Offline Mode** | Dead reckoning navigation (±2–5m accuracy, short duration) |
| **Real-Time Alerts** | WebSocket push with visual + audio escalation |

---

## System Architecture

```
┌──────────────────────────────────┐
│     Frontend  (React + Three.js) │
│  3D Scene · HUD · MapLibre · WS  │
└────────────┬─────────────────────┘
             │  REST + WebSocket (900ms)
┌────────────▼─────────────────────┐
│   Backend AI Pipeline (FastAPI)  │
│  Detection · Prediction · Alerts │
└────────────┬─────────────────────┘
             │
┌────────────▼─────────────────────┐
│  Road Intelligence Layer         │
│  SQLite (road_usage.db) + OSM    │
└──────────────────────────────────┘
```

**Backend loop — every 900ms:**
1. Filter vehicles within 90m of ego
2. Run traffic flow analysis
3. Wrong-way detection (dual layer)
4. Update road intelligence in SQLite
5. Check flow opposition
6. Compute per-pair collision risk
7. Generate correction route
8. Push response over WebSocket

---

## Detection Systems

### Wrong-Way Detection — Two Independent Layers

**Layer 1 · Local Lane Intelligence (Frontend)**
- Runs entirely offline, no network required
- Compares surrounding vehicle bearing to lane direction
- Triggers on occupancy pattern anomaly

**Layer 2 · Backend AI Consensus Engine**
- Circular mean of all nearby vehicle bearings
- Flags deviations > 140° from expected flow
- Requires ≥ 3 vehicle consensus to trigger
- Includes GPS noise suppression + confidence score

```
final_alert = layer_1_detected  OR  layer_2_consensus
```

---

### Collision Prediction — Risk Model

Each vehicle pair within range is scored every cycle:

| Signal | Weight | Source |
|---|---|---|
| Time-to-Collision (TTC) | 40% | Relative velocity vectors |
| Inter-vehicle distance | 30% | Real-time proximity |
| Bearing convergence | 20% | Directional alignment |
| Speed differential | 10% | Absolute delta |

Reaction time baseline: **0.9 seconds**

**Output per vehicle pair:**
- Risk level: `LOW` · `MEDIUM` · `HIGH`
- Collision probability: `0.00 – 1.00`
- Safe stopping distance
- Estimated time to impact (seconds)

---

### Road Intelligence System

RoadSense learns what normal looks like per road segment over time:

- **4-hour time buckets** — distinguishes rush hour vs. off-peak
- **Octant direction encoding** — `E0` through `E7`
- **Confidence-weighted updates** — recent patterns weighted higher
- **Stored in** `road_usage.db`

Used to predict flow direction, suppress false positives, and add context-aware risk weighting.

---

## Scenario Simulation Engine

| Scenario | Setup | Validates |
|---|---|---|
| **High-Speed Intrusion** | Single head-on wrong-way vehicle | Alert latency, TTC accuracy |
| **Traffic Diversion** | Multiple vehicles in opposing flow | False-positive suppression |
| **Urban Grid** | Complex intersections + mixed directions | Ambiguity handling |

---

## API

### `POST /frontend-sim`
Core detection endpoint. Called every 900ms by the frontend.

**Request**
```json
{
  "ego": {
    "lat": 12.93,
    "lng": 77.61,
    "speed": 14.2,
    "bearing": 270
  },
  "nearby": [
    { "id": "v_01", "speed": 16.0, "bearing": 91, "distance": 45 }
  ]
}
```

**Response**
```json
{
  "wrong_way": {
    "detected": true,
    "confidence": 0.91,
    "source": "backend_consensus"
  },
  "collision": {
    "risk": "HIGH",
    "probability": 0.87,
    "ttc_seconds": 3.2,
    "stopping_distance_m": 18.4
  },
  "road_intelligence": {
    "segment_id": "seg_204",
    "expected_bearing": 270,
    "confidence": 0.84
  },
  "correction_route": {
    "bearing_delta": -178,
    "instruction": "TURN AROUND IMMEDIATELY"
  }
}
```

### Other Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System status |
| `POST` | `/start` | Start simulation session |
| `POST` | `/stop` | Stop simulation session |
| `GET` | `/status` | Live pipeline metrics |
| `GET` | `/road-intelligence/{id}` | Historical segment data |

---

## Performance

| Metric | Target |
|---|---|
| API response latency | 50–150ms |
| WebSocket alert latency | < 50ms |
| End-to-end alert time | 150–300ms |
| Backend pipeline execution | < 100ms |
| 3D render rate | ~60 FPS |

---

## Tech Stack

**Frontend**
- React 19 + TypeScript
- Three.js — WebGL 3D simulation
- MapLibre GL — geospatial map rendering
- Zustand — state management
- Tailwind CSS

**Backend**
- FastAPI + Uvicorn
- NumPy + SciPy — numerical modeling
- OSMNx + NetworkX — road graph processing
- Shapely — geometry operations
- SQLite — road intelligence persistence

**Data**
- OpenStreetMap (GraphML road graph)
- WebSockets (real-time alert delivery)

---

## Getting Started

### Requirements
- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m backend.preload_graph  # Fetches and processes OSM road graph
uvicorn backend.api.main:app --reload --port 8010
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

- Frontend → `http://localhost:5173`
- Backend → `http://localhost:8010`

---

## Project Structure

```
roadsense/
├── frontend/
│   ├── components/     # HUD, alerts, overlays
│   ├── scenes/         # Three.js 3D scene
│   ├── services/       # API + WebSocket clients
│   └── state/          # Zustand stores
│
└── backend/
    ├── api/            # FastAPI routes + WebSocket handlers
    ├── simulation/     # NPC + vehicle modeling
    ├── detection/      # Wrong-way + collision engines
    ├── intelligence/   # Road learning + SQLite
    └── data/           # OSM graph + road_usage.db
```

---

## Roadmap

- [ ] Real vehicle telemetry via OBD-II / IoT integration
- [ ] LSTM/Transformer-based trajectory prediction
- [ ] Edge deployment for embedded in-car systems
- [ ] Distributed road intelligence across multiple cities
- [ ] Mobile app with live map overlay
