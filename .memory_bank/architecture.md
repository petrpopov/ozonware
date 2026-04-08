# Architecture

## Stack

- **Backend**: Node.js 18 + Express 4, PostgreSQL (pg pool)
- **Frontend**: React 18 + Vite 6, React Router, TanStack Query, Zustand
- **Infra**: Docker Compose (postgres 15, nginx alpine), Nginx reverse proxy

## Directory Structure

```
ozonware/
├── backend/
│   ├── server.js              # Express entry, mounts all routes
│   ├── db.js                  # pg Pool, auto-connects via env vars
│   ├── ozonService.js         # OZON FBS/FBO API (~2000 lines)
│   ├── googleSheets.js        # Google Sheets API singleton
│   └── routes/
│       ├── products.js        # GET/POST/PUT/DELETE + usage check
│       ├── operations.js      # Full CRUD with stock management
│       ├── productFields.js   # Custom field definitions CRUD
│       ├── settings.js        # Key-value user settings
│       ├── stats.js           # Dashboard counters + writeoffs
│       ├── googleSheets.js    # Google Sheets sync endpoints
│       ├── ozon.js            # OZON settings, sync (SSE), shipments
│       ├── ozonOrders.js      # CSV import, product stats/timeline
│       └── maintenance.js     # State reset
├── frontend/src/
│   ├── main.jsx               # QueryClientProvider + BrowserRouter
│   ├── App.jsx                # All routes
│   ├── api/http.js            # Fetch wrapper with /api prefix
│   ├── api/services.js        # All API calls
│   ├── api/queryClient.js     # TanStack Query config
│   ├── components/            # AppLayout, ToastHost, Icons, etc.
│   ├── pages/                 # One component per route
│   ├── hooks/useRouteRefetch  # Data refresh on tab enter
│   └── store/useUiStore       # Zustand (toasts)
├── database/                  # SQL migrations (init.sql, 001_*.sql)
├── nginx/nginx.conf           # SPA fallback + /api/ proxy to backend:3000
└── docker-compose.yml         # postgres + backend + nginx
```

## Backend Architecture

`server.js` mounts route modules at `/api/*`. Each route file connects to `db.js` pool directly (no controllers/services separation, except ozonService and googleSheets).

All operations that modify stock run inside database transactions (BEGIN/COMMIT/ROLLBACK). JSONB is used for flexible data: `custom_fields` on products, `items` and `differences` on operations.

### Services

**OzonService** (`backend/ozonService.js`): Handles OZON FBS and FBO API. Uses `node-fetch`. Rate-limited (`OZON_REQUEST_PAUSE_MS`, default 1500ms). Supports cancellation via AbortController. Key methods:
- `sync()` / `syncFbo()` — full sync from OZON API, saves to `ozon_postings` / `ozon_fbo_supplies`
- `createShipments()` / `createShipmentsFromFbo()` — create shipment operations from OZON data
- `createShipmentsFromFbsCsv()` / `analyzeFbsCsvDays()` — process parsed CSV data
- `syncProductImagesFromOzon()` — sync product photos from OZON catalog

**GoogleSheetsService** (`backend/googleSheets.js`): Singleton, initialized at startup. Requires `google-credentials.json` (Service Account). Syncs quantities by SKU matching.

## Frontend Architecture

Tab-based navigation via React Router. Each tab is a route. Data auto-refreshes on tab enter (`useRouteRefetch`) and after mutations (query invalidation).

State management:
- **TanStack Query**: Server state, caching, invalidation
- **Zustand**: UI state (toast notifications)
- **localStorage**: Theme preference

`services.js` centralizes all API calls. `http.js` provides `api.get/post/put/del` wrapper.

## Docker Deployment

- **postgres**: port 4432→5432, volume `postgres_data`, init via `database/init.sql`
- **backend**: port 3000, depends on postgres healthy
- **nginx**: port 80, serves frontend static + proxies `/api/` to backend

## Legacy

`frontend/legacy/` contains the old vanilla JS frontend — not used in current build, kept for reference.
