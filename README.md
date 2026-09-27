# WB Аналитик — Telegram Mini App

MVP на фиксированном стеке:

- Next.js + TypeScript
- Tailwind CSS
- Hono
- Drizzle ORM
- PostgreSQL
- Render
- Telegram Mini App

## Локальный запуск

```bash
npm install
npm run dev
```

Откройте `http://localhost:3000`.

## API

- `GET /api/health` — проверка работоспособности.
- `POST /api/upload` — приём `.xlsx` / `.csv` файла (MVP: валидация и метаданные).

## Переменные окружения

Скопируйте `.env.example` в `.env.local`.

`DATABASE_URL` пока не нужен для запуска UI/API; он понадобится при подключении базы.

## Render

В репозитории есть `render.yaml`.

После публикации репозитория в GitHub:
1. Создайте Web Service из репозитория.
2. Render прочитает `render.yaml`.
3. После деплоя используйте HTTPS-адрес Render как URL Telegram Mini App.

## Следующий этап

Разбор структуры отчёта Wildberries и нормализация строк в TypeScript.
