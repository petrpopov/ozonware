# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## OpenWS — Open Warehouse System

Складской учет с интеграцией OZON FBS/FBO и Google Sheets.

**Stack**: Node.js 18 + Express / React 18 + Vite / PostgreSQL 15 / Nginx / Docker Compose

## Quick Start

```bash
# Dev (two terminals)
cd backend && npm run dev        # port 3000
cd frontend && npm run dev       # port 3001, proxies /api → 3000

# Docker (full stack)
docker-compose up -d             # nginx :80, backend :3000, postgres :4432
```

## Memory Bank

For detailed information, read the relevant `.memory_bank/` file:

| File | Contents |
|------|----------|
| [`.memory_bank/architecture.md`](.memory_bank/architecture.md) | Full directory structure, backend/frontend architecture, services, Docker |
| [`.memory_bank/database.md`](.memory_bank/database.md) | All table schemas, triggers, stock logic, OZON product matching |
| [`.memory_bank/api.md`](.memory_bank/api.md) | Complete API endpoint reference with methods and params |
| [`.memory_bank/development.md`](.memory_bank/development.md) | Dev commands, env vars, conventions, pages, implementation details |

**When working on**:
- **New API endpoint** → read `api.md` first to avoid conflicts
- **Database changes** → read `database.md` for existing schema
- **Frontend** → read `architecture.md` for component structure
- **Setup/config** → read `development.md` for commands and env vars

## Conventions

- User-facing text in **Russian**. Code/identifiers in **English**.
- All stock-modifying operations are **transactional**.
- No auth — single user (user_id=1).
- No test framework or linter configured.
