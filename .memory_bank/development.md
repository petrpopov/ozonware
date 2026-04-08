# Development Guide

## Commands

### Backend
```bash
cd backend && npm install
npm run dev    # nodemon, port 3000
npm start      # node server.js
```

### Frontend
```bash
cd frontend && npm install
npm run dev        # Vite, port 3001, proxies /api → localhost:3000
npm run build      # Production build → dist/
npm run preview    # Serve dist/
```

### Docker (full stack)
```bash
docker-compose up -d       # postgres + backend + nginx
docker-compose down        # Stop
docker-compose down -v     # Stop + delete volumes (DATA LOSS!)
docker-compose logs -f     # View logs
```

### Database
```bash
docker exec -it warehouse-db psql -U warehouse_user -d openws
docker exec warehouse-db pg_dump -U warehouse_user openws > backup.sql
docker exec -i warehouse-db psql -U warehouse_user openws < backup.sql
```

## Environment Variables

**Backend** (`.env`):
- `PORT=3000`, `DB_HOST=postgres`, `DB_PORT=5432`, `DB_NAME=openws`, `DB_USER=warehouse_user`, `DB_PASSWORD=warehouse_password`
- `GOOGLE_SERVICE_ACCOUNT_KEY` — path to service account JSON (default: `backend/google-credentials.json`)
- `OZON_REQUEST_PAUSE_MS` — delay between OZON API calls (default: 1500)

**Frontend** (`.env`):
- `VITE_API_BASE=/api` (default)
- `VITE_API_TARGET=http://localhost:3000` (for Vite proxy)

## Conventions

- **Language**: User-facing text in Russian. Code/identifiers in English.
- **DB**: SERIAL PK, JSONB for flexible data, TIMESTAMP with auto-updated `updated_at` triggers.
- **Transactions**: All stock-modifying operations use BEGIN/COMMIT/ROLLBACK.
- **No auth**: Single user (user_id=1) assumed.
- **No tests, no linter** configured.

## Frontend Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/products` | ProductsPage | Product list with search |
| `/products/:id` | ProductCardPage | Product detail with history |
| `/receipt` | ReceiptPage | Incoming goods |
| `/shipment` | ShipmentPage | Outgoing goods (manual + OZON) |
| `/writeoff` | WriteoffPage | Defect/loss/reserve writeoffs |
| `/inventory` | InventoryPage | Stock reconciliation |
| `/reports` | ReportsPage | Stats and reports |
| `/settings` | SettingsPage | App config (OZON, Google Sheets, fields) |

## Key Implementation Details

- **Shipment shortage handling**: `allow_shortage` flag + `shortage_adjustments` array creates a correction operation alongside the shipment.
- **Bulk delete**: Atomically rolls back stock, deletes related correction operations, unlinks OZON posting/supply flags.
- **OZON SSE**: Sync endpoints use Server-Sent Events for real-time progress streaming.
- **Operation type constraint**: Dynamically extended at runtime to include `correction` type (migration-safe).
- **Product matching for OZON**: `OZON` custom field (value `OZN<sku>`), then `Артикул OZON` field (offer_id with `_dm` suffix handling).
- **Google Sheets**: Batch updates (1000 rows/chunk) with 100ms delay between batches.
