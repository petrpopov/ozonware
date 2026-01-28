# Open Warehouse System (OpenWS)

Система складского учета с разделением на frontend, backend и базу данных PostgreSQL.

## Архитектура

```
warehouse-app/
├── frontend/          # HTML, CSS, JS (Nginx)
├── backend/           # Node.js + Express REST API
├── database/          # PostgreSQL init scripts
├── nginx/             # Nginx конфигурация
└── docker-compose.yml # Docker orchestration
```

## Стек технологий

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js 18, Express 4
- **Database**: PostgreSQL 15
- **Web Server**: Nginx (Alpine)
- **Containerization**: Docker, Docker Compose

## Быстрый старт

### Предварительные требования

- Docker
- Docker Compose

### Запуск приложения

```bash
cd warehouse-app

# Запуск всех контейнеров
docker-compose up -d

# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f
```

Приложение будет доступно по адресу: **http://localhost**

API будет доступен по адресу: **http://localhost/api**

### Остановка приложения

```bash
docker-compose down

# Остановка с удалением данных
docker-compose down -v
```

## API Endpoints

### Products
- `GET /api/products` - Получить все товары
- `GET /api/products/:id` - Получить товар по ID
- `POST /api/products` - Создать товар
- `PUT /api/products/:id` - Обновить товар
- `DELETE /api/products/:id` - Удалить товар

### Operations
- `GET /api/operations` - Получить операции
- `GET /api/operations/:id` - Получить операцию по ID
- `POST /api/operations` - Создать операцию (приход/отгрузка/инвентаризация)
- `PUT /api/operations/:id` - Обновить операцию
- `DELETE /api/operations/:id` - Удалить операцию

### Product Fields
- `GET /api/product-fields` - Получить настройки полей
- `POST /api/product-fields` - Создать поле
- `PUT /api/product-fields/:id` - Обновить поле
- `DELETE /api/product-fields/:id` - Удалить поле

### Settings
- `GET /api/settings/:key` - Получить настройку
- `POST /api/settings/:key` - Сохранить настройку

### Stats
- `GET /api/stats` - Получить статистику

## База данных

### Структура

- **products** - Товары на складе
- **operations** - Операции (приход, отгрузка, инвентаризация)
- **product_fields** - Настройки кастомных полей
- **user_settings** - Пользовательские настройки

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

## Разработка

### Backend

```bash
cd backend
npm install
npm run dev  # С nodemon
```

### Frontend

Откройте `frontend/index.html` в браузере или используйте live server.

### Переменные окружения

Backend использует следующие переменные из `.env`:

```env
PORT=3000
DB_HOST=postgres
DB_PORT=5432
DB_NAME=openws
DB_USER=warehouse_user
DB_PASSWORD=warehouse_password
NODE_ENV=production
```

## Особенности

✅ **Полностью контейнеризовано** - запуск одной командой  
✅ **REST API** - чистая архитектура с разделением frontend/backend  
✅ **PostgreSQL** - надежная СУБД с ACID  
✅ **Автоматическая инициализация БД** - схема создается при первом запуске  
✅ **Health checks** - контроль состояния сервисов  
✅ **Транзакции** - целостность данных при операциях  
✅ **Nginx reverse proxy** - единая точка входа  

## Порты

- **80** - Nginx (Frontend + API proxy)
- **3000** - Backend (доступен внутри Docker network)
- **5432** - PostgreSQL (доступен на хосте для отладки)

## Troubleshooting

### Backend не может подключиться к БД

```bash
# Проверьте, что postgres контейнер здоров
docker-compose ps

# Проверьте логи БД
docker-compose logs postgres

# Перезапустите с пересозданием
docker-compose down -v
docker-compose up -d
```

### Frontend не загружается

```bash
# Проверьте логи nginx
docker-compose logs nginx

# Убедитесь что файлы скопированы
docker exec warehouse-nginx ls -la /usr/share/nginx/html
```

### API возвращает ошибки

```bash
# Проверьте логи backend
docker-compose logs backend

# Проверьте health check
curl http://localhost/api/health
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
