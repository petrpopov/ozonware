# Frontend (React + Vite)

## Stack
- React 18
- React Router (tabs as routes)
- TanStack Query (server state + refetch)
- Zustand (UI store: toasts)

## Scripts
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Notes
- API calls go through `VITE_API_BASE` (default `/api`).
- Data is refreshed when entering a tab route (`useRouteRefetch`) and by query invalidation after mutations.
- Old non-React frontend code was moved to `frontend/legacy`.

## Local API Proxy
1. Copy env template:
   - `cp .env.example .env`
2. Default values already route frontend API to backend:
   - `VITE_API_BASE=/api`
   - `VITE_API_TARGET=http://localhost:3000`
3. Restart dev server after env changes.
