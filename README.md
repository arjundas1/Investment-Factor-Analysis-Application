# Investment Factor Analysis Application

## Overview
Our application uses a React + Vite frontend, a Node.js/Express backend, PostgreSQL (hosted on AWS RDS) for data storage, and Recharts for visual analytics. The architecture is a straightforward client-server design: each frontend page sends requests to backend API routes, the backend performs SQL queries and portfolio/factor computations, and returns JSON responses that the frontend renders into tables, charts, and recommendations. We also use session storage to persist user selections (like factor weights and screener settings) across pages, which helps connect the overall workflow.

## Pages
Our application has 5 distinct pages.

1. The Allocation page collects retirement inputs and returns stock/bond splits with supporting visuals.
2. The Factors page lets users define custom factor weights (value, profitability, momentum, and size).
3. The Screener page ranks stocks using those weights and selected market cap category, with score breakdowns and composite ranking.
4. The Backtest page visualizes historical factor strategy performance versus a market baseline.
5. The Portfolio page turns selected screened stocks into a final weighted portfolio and gives users interactive controls to adjust the final portfolio.

## Run Locally

### Prerequisites
1. Node.js 18+ and npm.
2. Network access to the PostgreSQL instance configured for the backend.

### 1) Install dependencies
From the project root:

```bash
npm install
```

From the server folder:

```bash
cd server
npm install
```

### 2) Configure backend settings
Update backend configuration in `server/config.json` with valid values for:

- `rds_host`
- `rds_port`
- `rds_user`
- `rds_password`
- `rds_db`
- `server_host`
- `server_port`

Optional keys used by web search:

- `gemini_api_key`
- `gemini_model`

### 3) Start the backend
In one terminal:

```bash
cd server
npm start
```

Backend runs on `http://localhost:8080` by default.

### 4) Start the frontend
In a second terminal from the project root:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

### 5) Open the app
Navigate to:

`http://localhost:5173`

## Dependencies

### Frontend (root package.json)

Runtime dependencies:

- react (^19.2.4)
- react-dom (^19.2.4)
- react-router-dom (^6.30.3)
- recharts (^3.7.0)

Development dependencies:

- @eslint/js (^9.39.1)
- @types/react (^19.2.7)
- @types/react-dom (^19.2.3)
- @vitejs/plugin-react (^5.1.1)
- eslint (^9.39.1)
- eslint-plugin-react-hooks (^7.0.1)
- eslint-plugin-react-refresh (^0.4.24)
- globals (^16.5.0)
- vite (^7.3.1)

### Backend (server/package.json)

Runtime dependencies:

- cors (^2.8.6)
- express (^5.2.1)
- pg (^8.20.0)

## Project Team
Professor: Dr. Susan Davidson, School of Engineering and Applied Sciences, University of Pennsylvania.

The group for our Database & Information Systems project consists of:

| Sl.No. | Name | PennKey |
| - | - | - |
| 1 | Arash Katirai | akatirai |
| 2 | Arjun Das | dasarjun |
| 3 | Marvin Guemo | guemo |
| 4 | Peter Denkert | petedank |
