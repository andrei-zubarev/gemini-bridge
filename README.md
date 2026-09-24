# Gemini Bridge

Личный мост к Gemini API: страница-клон интерфейса Gemini (GitHub Pages) + прокси-слой (Cloudflare Worker), который хранит API-ключ и ходит в Google из своего дата-центра. ПК с корпоративной сети может пользоваться Gemini без VPN и без доступа к Google напрямую.

## Архитектура

```
Браузер ──► GitHub Pages (UI, public/) ──POST──► Cloudflare Worker ──► Google Gemini API
            (только интерфейс)                    (хранит ключ, не виден браузеру)
```

- API-ключ Gemini **никогда не попадает в браузер** — он лежит только в секретах worker'а.
- Worker принимает запросы только с правильным заголовком `x-api-token`.

## Структура

```
public/          → UI (GitHub Pages)
  config.js      → workerUrl, apiToken, модель
  index.html, style.css, app.js
worker/index.js  → Cloudflare Worker (прокси)
wrangler.toml    → конфиг worker'а
```

## 1. Деплой Cloudflare Worker

```bash
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY   # твой ключ из AI Studio
npx wrangler secret put API_TOKEN        # случайный длинный токен
```

После деплоя worker доступен по адресу вида `https://gemini-bridge.<поддомен>.workers.dev`.

## 2. Настройка UI

В `public/config.js` заполни:

```js
workerUrl: "https://gemini-bridge.<поддомен>.workers.dev",
apiToken:  "тот же токен, что положен в секрет API_TOKEN",
model:     "gemini-2.5-pro",
```

## 3. GitHub Pages

В настройках репозитория: **Settings → Pages → Deploy from a branch → main → /public**.
Сайт откроется на `https://andrei-zubarev.github.io/gemini-bridge/`.

## Локальная проверка

Можно проверить worker локально:

```bash
copy .dev.vars.example .dev.vars   # впиши настоящий ключ
npx wrangler dev
```

## Безопасность

- `API_TOKEN` (передаётся в заголовке `x-api-token`) защищает worker от чужих.
- Токен в UI виден всем, кто открыл страницу, — это нормально для личного проекта.
- `ALLOWED_ORIGIN` в `wrangler.toml` ограничивает CORS (по умолчанию `*`).