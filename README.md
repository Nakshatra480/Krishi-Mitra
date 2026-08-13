# KrishiMitra 🌾

AI-powered crop yield prediction and optimization system for **Smart India Hackathon**.

## What it does
- Monitors fields from sowing to harvest using **Growing Degree Days (GDD)**
- Predicts yield for **55 crops across 30 Indian states** (1997–2020 data)
- Runs an adversarial **DeepSeek Challenger** to audit every recommendation
- Deterministic **Safety Policy + Validator** makes the final decision — not the LLM
- Bilingual (English + Hindi) farmer and admin dashboard

## Yield model accuracy

Measured on a **temporal holdout** — trained on 1997–2016, scored on 2017–2020,
which the model never saw. A random train/test split would score better here and
mean less, because the same crop-state-year cluster would land in both halves.

| Metric | Value |
|---|---|
| Median absolute error | **12.9%** |
| Predictions within ±20% | 65.4% |
| R² (log yield) | 0.951 |
| Prediction interval | 80% coverage, empirically calibrated |

Live at `GET /model-info` on the AI service, so the claim is traceable rather
than folklore. Every prediction carries a `confidence` field; anything below
`high` means it came from a fallback and is labelled as such in the UI.

Model: ExtraTrees regression on log-yield, over crop/season/state, rainfall,
per-hectare fertiliser and pesticide intensity, and a crop/state/season
agronomic prior. See `ai-service/train_model.py` for why each choice was made
and `ai-service/data/README.md` for the dataset's known limitations.

## Architecture

```
React (client/)  →  Node/Express (server/)  →  MongoDB Atlas
                          ↓
                   Python/FastAPI (ai-service/)
                          ↓
                   DeepSeek LLM + Open-Meteo + Tavily
```

## Services

| Service | Directory | Port |
|---------|-----------|------|
| React frontend | `client/` | 3000 |
| Node/Express API | `server/` | 5000 |
| Python AI service | `ai-service/` | 8000 |

## Stack

- **Frontend**: React 18, Vite, React Router, Axios, TailwindCSS, Recharts
- **Backend**: Node.js 20, Express 4, Mongoose 8, JWT, bcrypt, Multer
- **AI Service**: Python 3.13, FastAPI, scikit-learn, pandas, joblib
- **Database**: MongoDB Atlas
- **LLM**: DeepSeek (chat + vision)
- **External**: Open-Meteo, Tavily
- **Deployment**: Railway (all 3 services)

## Quick Start

### Prerequisites
- Node 20+, Python 3.11+, MongoDB Atlas URI

### 1. Train the model (run once locally)
```bash
cd ai-service
pip install -r requirements.txt
python train_model.py
# Commits yield_model.pkl to repo
```

### 2. Start all services

```bash
# Terminal 1 — AI service
cd ai-service && uvicorn main:app --reload --port 8000

# Terminal 2 — Node server
cd server && npm install && npm run dev

# Terminal 3 — React client
cd client && npm install && npm run dev
```

### 3. Seed demo data
```bash
cd server && node seed/seed.js
```

## Environment Variables

See `.env.example` in each service directory.

### server/.env.example
```
PORT=5000
MONGO_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
PYTHON_SERVICE_URL=http://localhost:8000
SERVICE_KEY=your-shared-service-key
TAVILY_API_KEY=
CLIENT_URL=http://localhost:3000
# Optional. Identifies this deployment to OpenStreetMap Nominatim, which the
# village search uses. Their policy asks for an honest app name and contact.
NOMINATIM_USER_AGENT=KrishiMitra/1.0 (+https://github.com/Nakshatra480/Krishi-Mitra)
```

### ai-service/.env.example
```
DEEPSEEK_API_KEY=
SERVICE_KEY=your-shared-service-key
```

### client/.env.example
```
VITE_API_URL=http://localhost:5000/api
```

## Deploy to Railway

See [DEPLOY.md](./DEPLOY.md) for full Railway deployment guide.

## Demo

Demo farmer: phone `9999999999`, password `demo1234`

Demo field: Rice, Barabanki, Uttar Pradesh — sown 2 July.

> **The LLM does not have authority. It identifies risks. Deterministic code verifies evidence and makes the final decision.**
