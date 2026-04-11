# Open Warehouse System (OpenWS)

Система складского учета с интеграцией OZON FBS/FBO и Google Sheets.

## Архитектура

```
ozonware/
├── frontend/              # React 18 + Vite (SPA)
├── backend-kotlin/        # Kotlin + Spring Boot 3.4 REST API
├── nginx/                 # Nginx конфигурация
├── .memory_bank/          # Подробная документация для AI
├── docker-compose.yml     # Docker orchestration
├── DESIGN.md              # Дизайн-система и принципы
└── CLAUDE.md              # Инструкции для Claude Code
```

## Стек технологий

- **Frontend**: React 18, React Router, TanStack Query, Zustand, Vite 6
- **Backend**: Kotlin, Spring Boot 3.4, Gradle, JPA/Hibernate
- **Database**: PostgreSQL 15, Flyway миграции
- **Web Server**: Nginx (Alpine)
- **Containerization**: Docker, Docker Compose

## Быстрый старт

### Предварительные требования

- Docker и Docker Compose **или** Node.js 18+ для локальной разработки

### Запуск через Docker

```bash
# Запуск всех контейнеров
docker-compose up -d

# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f
```

Приложение будет доступно по адресу: **http://localhost**
API будет доступен по адресу: **http://localhost/api**

### Локальная разработка

**macOS**: infra в Docker, backend + frontend на хосте

```bash
# Терминал 1 — Infra (PostgreSQL, RabbitMQ, MinIO)
docker-compose up postgres rabbitmq minio

# Терминал 2 — Backend (Kotlin + Spring Boot)
cd backend-kotlin
./gradlew bootRun              # port 3000

# Терминал 3 — Frontend
cd frontend
npm install
npm run dev                    # port 3001, проксирует /api → localhost:3000
```

Откройте **http://localhost:3001** в браузере.

**Linux/Docker**: Полный стек в контейнерах

```bash
docker-compose up -d
```

### Остановка приложения

```bash
docker-compose down

# Остановка с удалением данных
docker-compose down -v
```

## Основные возможности

- **Управление товарами** — CRUD, кастомные поля, поиск
- **Приход товаров** — увеличение остатков
- **Отгрузка** — списание товаров (вручную, из OZON FBS/FBO)
- **Списание** — брак, потери, резерв
- **Инвентаризация** — сверка фактических остатков
- **Интеграция OZON** — синхронизация заказов FBS/FBO, импорт CSV, авто-отгрузки
- **Google Sheets** — синхронизация остатков по SKU
- **Отчёты** — статистика, история операций, таймлайн товара

## API Endpoints

### Products
- `GET /api/products` — Получить все товары (опционально `?search=`)
- `GET /api/products/:id` — Получить товар по ID
- `POST /api/products` — Создать товар
- `PUT /api/products/:id` — Обновить товар
- `DELETE /api/products/:id` — Удалить товар (блокируется если есть операции)

### Operations
- `GET /api/operations` — Получить операции (фильтры: `?type=`, `?limit=`, `?offset=`, `?shipment_kind=`)
- `GET /api/operations/:id` — Получить операцию по ID
- `POST /api/operations` — Создать операцию (приход/отгрузка/инвентаризация/списание)
- `PUT /api/operations/:id` — Обновить операцию
- `DELETE /api/operations/:id` — Удалить операцию (с откатом остатков)
- `POST /api/operations/bulk-delete` — Массовое удаление

### Product Fields
- `GET /api/product-fields` — Получить настройки полей
- `POST /api/product-fields` — Создать поле
- `PUT /api/product-fields/:id` — Обновить поле
- `DELETE /api/product-fields/:id` — Удалить поле

### Settings
- `GET /api/settings/:key` — Получить настройку
- `POST /api/settings/:key` — Сохранить настройку

### Stats
- `GET /api/stats` — Получить статистику
- `GET /api/writeoffs` — Список списаний
- `GET /api/writeoffs/summary` — Сводка по списаниям

### OZON
- `GET /api/ozon/settings` / `POST /api/ozon/settings` — Настройки OZON
- `GET /api/ozon/sync` — **SSE** синхронизация FBS
- `GET /api/ozon/fbo/sync` — **SSE** синхронизация FBO
- `POST /api/ozon/fbs/cancel` / `POST /api/ozon/fbo/cancel` — Отмена синхронизации
- `GET /api/ozon/shipments` / `GET /api/ozon/fbo/supplies` — Статистика по дням
- `POST /api/ozon/shipments` / `POST /api/ozon/fbo/shipments` — Создать отгрузки
- `POST /api/ozon/products/sync` — Синхронизация фото из каталога OZON
- `POST /api/ozon/orders/import` — Импорт CSV заказов
- `GET /api/ozon/orders/product/:id/stats` — Статистика товара
- `GET /api/ozon/orders/product/:id/timeline` — Таймлайн товара

### Google Sheets
- `GET /api/google-sheets-config` / `POST /api/google-sheets-config` — Настройка синхронизации
- `POST /api/google-sheets-test` — Проверка подключения
- `POST /api/google-sheets-sync` — Синхронизация остатков

### Maintenance
- `POST /api/maintenance/reset-state` — Сброс состояния (удаление операций, обнуление остатков)

## База данных

Миграции Flyway: `backend-kotlin/src/main/resources/db/migration/`

### Основные таблицы

- **products** — Товары на складе
- **product_fields** — Настройки кастомных полей
- **product_field_options** — Значения для select-полей
- **product_field_values** — Значения полей товара
- **operations** — Операции (приход, отгрузка, инвентаризация, списание, корректировка)
- **operation_items** — Строки операций с товарами
- **operation_inventory_diffs** — Дельта инвентаризации
- **user_settings** — Пользовательские настройки

### Lookup таблицы

- **operation_types** — Типы операций
- **operation_channels** — Каналы (вручную, OZON FBS, OZON FBO, Google Sheets)
- **writeoff_reasons** — Причины списания
- **correction_reasons** — Причины корректировки
- **warehouses** — Склады
- **product_field_types** — Типы полей (text, select, number)
- **ozon_posting_statuses** — Статусы заказов FBS
- **ozon_supply_states** — Статусы поставок FBO

### OZON таблицы

- **ozon_postings** / **ozon_posting_items** — Заказы FBS
- **ozon_fbo_supplies** / **ozon_fbo_supply_items** — Поставки FBO
- **ozon_order_import_batches** / **ozon_order_lines** — Импорт CSV заказов

### Подключение к БД

```bash
docker exec -it warehouse-db psql -U warehouse_user -d openws
```

### Backup

```bash
docker exec warehouse-db pg_dump -U warehouse_user openws > backup.sql
```

### Restore

```bash
docker exec -i warehouse-db psql -U warehouse_user openws < backup.sql
```

## Переменные окружения

### Backend (`application.yml`)

```yaml
spring:
  datasource:
    url: jdbc:postgresql://postgres:5432/openws
    username: warehouse_user
    password: warehouse_password
  jpa:
    hibernate:
      ddl-auto: validate
  flyway:
    enabled: true

server:
  port: 3000
  servlet:
    context-path: /api
```

Конфигурация через переменные окружения:
- `SPRING_DATASOURCE_URL` — PostgreSQL URL
- `SPRING_DATASOURCE_USERNAME` — БД пользователь
- `SPRING_DATASOURCE_PASSWORD` — БД пароль
- `SERVER_PORT` — Порт (default 3000)

### Frontend (`.env`)

```env
VITE_API_BASE=/api
VITE_API_TARGET=http://localhost:3000
```

## Особенности

- **Полностью контейнеризовано** — запуск одной командой
- **REST API** — чистая архитектура с разделением frontend/backend
- **Транзакции** — целостность данных при операциях с остатками
- **OZON SSE** — прогресс синхронизации в реальном времени
- **Нехватка при отгрузке** — поддержка частичной отгрузки с актами корректировки
- **Автоматическая инициализация БД** — схема создается при первом запуске
- **Health checks** — контроль состояния сервисов
- **Nginx reverse proxy** — единая точка входа

## Порты

- **80** — Nginx (Frontend + API proxy)
- **3000** — Backend (доступен внутри Docker network)
- **4432** — PostgreSQL (доступен на хосте для отладки)

## Troubleshooting

### Backend не компилируется

```bash
# Очистка Gradle кэша
cd backend-kotlin
./gradlew clean

# Rebuild
./gradlew bootRun
```

### Backend не может подключиться к БД

```bash
# Проверьте, что postgres контейнер здоров
docker-compose ps

# Проверьте логи БД
docker-compose logs postgres

# Проверьте URL и учётные данные в application.yml
cat src/main/resources/application.yml

# Перезапустите infra
docker-compose down -v
docker-compose up postgres
```

### Frontend не загружается

```bash
# Очистка зависимостей
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev

# Проверьте логи Vite
# Должны быть в терминале где запущен npm run dev
```

### Ошибки миграции БД

```bash
# Flyway логи находятся в логах Spring Boot
# Проверьте что все V*.sql файлы в порядке
ls -la backend-kotlin/src/main/resources/db/migration/

# Если нужен сброс (dev only!)
docker-compose exec postgres psql -U warehouse_user -d openws -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker-compose restart backend-kotlin
```

## Production

Для production рекомендуется:

1. Использовать HTTPS (добавить SSL сертификаты в nginx)
2. Настроить регулярные backup БД
3. Использовать внешний volume для postgres_data
4. Настроить мониторинг (Prometheus + Grafana)
5. Добавить rate limiting в nginx
6. Включить gzip сжатие
7. Настроить логирование в централизованную систему

## Лицензия

MIT

## Автор

OpenWS - Open Warehouse System
