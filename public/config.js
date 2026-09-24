// Настройки моста. Заполни workerUrl и apiToken после деплоя worker'а.
const BRIDGE_CONFIG = {
  // Адрес Cloudflare Worker, например: https://gemini-bridge.ваш-поддомен.workers.dev
  workerUrl: "https://YOUR_WORKER_URL.workers.dev",
  // Тот же токен, что ты положишь в секрет API_TOKEN на worker'е
  apiToken: "CHANGE_ME_random_string",
  // Модель по умолчанию (можно сменить в шапке страницы)
  model: "gemini-2.5-pro",
};