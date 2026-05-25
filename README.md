# 🔋 EV Route Optimizer — Modified A* Battery-Aware Routing Platform

> **Final Year Research Project** — Energy- and battery-health-aware EV routing with predictive maintenance using a Modified A* algorithm, Spectral Clustering, and Fuzzy Reinforcement Learning.

---

## 🎯 What Is This?

An interactive **EV Digital Twin Dashboard** that:

- Computes routes using **3 algorithms** (Shortest Path, Energy-Aware A*, Modified A*)
- Tracks **State of Charge (SoC)** and **State of Health (SoH)** in real-time
- Clusters charging stations using **Spectral Clustering**
- Ranks stations with **Fuzzy RL scoring**
- Predicts battery **Remaining Useful Life (RUL)** with a RandomForest model
- Animates the **EV moving along the route** step-by-step
- Supports **one-click demo scenarios** for academic review

---

## 🏗️ Architecture

```
Modified-A-Star-EV-Route/
├── backend/                  # Python FastAPI
│   ├── api/                  # Route handlers
│   ├── routing/astar.py      # Modified A* + 2 baselines
│   ├── battery/              # SoC/SoH simulator + charging
│   ├── clustering/           # Spectral clustering
│   ├── rl/fuzzy_rl.py        # Fuzzy station ranking
│   ├── simulation/           # Trip simulation engine
│   ├── maintenance/          # Predictive maintenance + RUL
│   └── utils/graph_loader.py # OSMnx + synthetic graph
├── frontend/                 # Next.js 14 + TypeScript
│   └── src/
│       ├── app/              # Next.js pages
│       ├── components/
│       │   ├── dashboard/    # Header, Sidebar, Panels
│       │   └── map/          # Leaflet interactive map
│       ├── state/store.ts    # Zustand global state
│       └── services/api.ts   # API client
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Backend Setup

```powershell
cd backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### 2. Frontend Setup

```powershell
cd frontend

# Install dependencies (already done if you ran the scaffold)
npm install

# Start dev server
npm run dev
```

The dashboard will be available at `http://localhost:3000`

---

## 📡 API Endpoints

| Method | Endpoint             | Description                                |
|--------|----------------------|--------------------------------------------|
| GET    | `/health`            | Health check + graph stats                 |
| GET    | `/graph`             | Road network graph (nodes + edges)         |
| GET    | `/charging-stations` | All charging stations with cluster info    |
| GET    | `/clusters`          | Cluster summaries and desirability         |
| POST   | `/route`             | Plan route(s) with one or all algorithms   |
| POST   | `/simulate`          | Run step-by-step trip simulation           |
| GET    | `/route-comparison`  | Compare all 3 algorithms                   |
| GET    | `/battery-status`    | Current battery state                      |
| POST   | `/predict-maintenance` | Predict RUL and health risk              |
| POST   | `/demo-scenario`     | Run a one-click demo scenario              |
| GET    | `/demo-scenarios`    | List all demo scenarios                    |
| POST   | `/reload`            | Reload graph (city name or synthetic)      |

---

## 🧠 Algorithms

### Modified A* (Core)
Cost function:
```
f(n) = g(n) + h(n)
g(n) = w_energy × energy_cost + w_dist × distance_norm + w_soh × soh_penalty + w_time × time + w_traffic × traffic
h(n) = energy needed to reach goal (geo-distance based)
```

The SoH penalty term `(1 - soh) × energy_cost` rewards routes that preserve battery health.

### Energy Cost Formula
```
energy_cost = distance_km × base_consumption × (1 + slope_penalty) × traffic_factor × speed_factor
```

### Battery Degradation
```
ΔSoH = α × DoD × (1 + β × (T - 25°C))
```

### Fuzzy RL Station Ranking
Inputs → Fuzzy membership functions → Rule inference → Q-weight modulation → Desirability score

---

## 🎮 Demo Scenarios

| Scenario | Description |
|----------|-------------|
| ⚡ Low SoC Start | Route fails without battery-aware planning |
| 🚧 Congested Station | Primary charger full, Modified A* reroutes |
| 🔋 Degraded Battery | SoH = 70%, conservative routing activated |
| 🚗 Heavy Traffic | Traffic forces energy-inefficient paths |
| 🔧 Maintenance Warning | Critical battery alerts triggered |

---

## 📊 Evaluation Metrics

- Total travel time (min)
- Total distance (km)
- Total energy consumed (kWh)
- Number of charging stops
- Final SoC / SoH
- Battery violation count
- Algorithm runtime (ms)
- Route feasibility score
- Maintenance risk level
- RUL in cycles and km

---

## 🗺️ Data Sources

- **Road Network**: OpenStreetMap via OSMnx (with synthetic fallback)
- **Charging Stations**: Extracted from OSM nodes or synthetic
- **Battery Data**: Synthetic degradation profiles (RF model trained on synthetic data)
- **Map Tiles**: CartoDB Dark (free, no API key)

---

## ⚙️ Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `initial_soc` | 0.85 | Starting State of Charge |
| `initial_soh` | 0.95 | Starting State of Health |
| `capacity_kwh` | 75.0 | Battery capacity |
| `w_energy` | 0.35 | Energy weight in A* |
| `w_soh` | 0.25 | SoH penalty weight |
| `soc_min` | 0.10 | Minimum SoC threshold |

---

## 🔮 Future Work

- LSTM-based RUL prediction
- Real-time traffic integration
- Multi-EV fleet coordination
- Live OSM charging station data
- PostGIS spatial queries
- Mobile-responsive UI
- Export routes as GPX

---

## 📝 Citation

If you use this in academic work, please cite:
```
@project{ev-route-optimizer,
  title={Energy- and Battery-Health-Aware EV Routing with Predictive Maintenance},
  year={2026},
  institution={Final Year Research Project},
  note={Modified A*, Spectral Clustering, Fuzzy Reinforcement Learning}
}
```
