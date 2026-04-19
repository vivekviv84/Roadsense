# WrongWay Detection API

## Setup

From the `frontend` folder (where `package.json` lives), the Python package root is the parent of `backend`:

```bash
pip install -r backend/requirements.txt
python -m backend.preload_graph
```

Run the API on **port 8010** to match the Vite app (`DETECTION_API_BASE` in `src/App.tsx`):

```bash
uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8010
```

(On Windows, run from the directory that contains the `backend` package, with `PYTHONPATH` including that directory if imports fail.)

## Endpoints

- `GET /health` — API + graph loaded
- `GET /scenarios` — list simulator scenarios
- `POST /start` — start scenario `{ "scenario": 1|2|3 }`
- `POST /stop` — stop simulator
- `POST /consensus` — `{ "enabled": true|false }`
- `GET /status` — status + frontend bridge counts
- `POST /frontend-sim` — ego + simulated vehicles; returns **wrong-way flow**, **collision bundle**, **road intelligence**, **correction route**, and bridge metrics
- `GET /road-intelligence/{road_id}` — historical flow stats for a synthetic road id
- `POST /offline/predict` — dead-reckoning next point from last GPS + speed + heading
- `WS /ws` — simulator ticks; also **`type: "safety_update"`** when wrong-way is detected from `/frontend-sim`

## Data

- Road usage SQLite DB: `backend/data/road_usage.db` (created on first use)
- OSM graph cache: `backend/data/bengaluru.graphml`
