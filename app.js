(() => {
  "use strict";

  const STORE_KEY = "gemini-bridge-chats";
  const workerUrl = (BRIDGE_CONFIG.workerUrl || "").replace(/\/+$/, "");
  const apiToken = BRIDGE_CONFIG.apiToken || "";

  // ---------- Состояние ----------
  let chats = loadChats();
  let currentId = null;

  const els = {
    chatList: document.getElementById("chatList"),
    newChatBtn: document.getElementById("newChatBtn"),
    modelSelect: document.getElementById("modelSelect"),
    clearBtn: document.getElementById("clearBtn"),
    messages: document.getElementById("messages"),
    input: document.getElementById("input"),
    sendBtn: document.getElementById("sendBtn"),
    composer: document.getElementById("composer"),
  };

  function loadChats() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; }
    catch { return []; }
  }
  function saveChats() {
    localStorage.setItem(STORE_KEY, JSON.stringify(chats));
  }

  function currentChat() {
    return chats.find((c) => c.id === currentId) || null;
  }

  function setCurrent(id) {
    currentId = id;
    if (currentId === null) currentId = chats[0]?.id || null;
    renderChatList();
    renderMessages();
  }

  function createChat() {
    chats.unshift({ id: "c" + Date.now(), title: "Новый чат", messages: [] });
    saveChats();
    setCurrent(chats[0].id);
  }

  function ensureChat() {
    const chat = currentChat();
    if (chat && chat.messages.length > 0) {
      createChat();
    } else if (!chat) {
      createChat();
    }
    return currentChat();
  }

  // ---------- Рендер ----------
  function renderChatList() {
    els.chatList.innerHTML = "";
    for (const chat of chats) {
      const item = document.createElement("div");
      item.className = "chat-item" + (chat.id === currentId ? " active" : "");
      item.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>' +
        '<span class="title"></span>';
      item.querySelector(".title").textContent = chat.title;
      item.addEventListener("click", () => setCurrent(chat.id));
      els.chatList.appendChild(item);
    }
  }

  function renderMessages() {
    const chat = currentChat();
    els.messages.innerHTML = "";
    if (!chat) {
      showEmptyState();
      return;
    }
    const thread = document.createElement("div");
    thread.className = "chat-thread";
    if (chat.messages.length === 0) {
      showEmptyState();
      return;
    }
    for (const m of chat.messages) {
      thread.appendChild(renderMessage(m.role, m.text, m));
    }
    els.messages.appendChild(thread);
    scrollBottom();
  }

  function showEmptyState() {
    els.messages.innerHTML =
      '<div class="chat-thread"><div class="empty"><div class="empty-star"></div>' +
      '<h2>Добро пожаловать в Gemini</h2>' +
      '<p>Задавайте вопросы, и я постараюсь на них ответить</p></div></div>';
  }

  function renderMessage(role, text, meta) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "user" : "model");
    if (meta && meta.error) wrap.className += " error";
    if (meta && meta.id) wrap.dataset.mid = meta.id;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (role === "model") {
      if (meta && meta.pending) {
        bubble.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
      } else if (meta && meta.error) {
        bubble.textContent = text;
      } else {
        bubble.innerHTML = mdToHtml(text || "");
      }
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      wrap.appendChild(avatar);
      wrap.appendChild(bubble);
    } else {
      bubble.textContent = text;
      wrap.appendChild(bubble);
    }
    return wrap;
  }

  function scrollBottom() {
    els.messages.scrollTo({ top: els.messages.scrollHeight });
  }

  // ---------- Отправка ----------
  function setBusy(busy) {
    els.input.disabled = busy;
    els.sendBtn.classList.toggle("ready", !busy);
    els.sendBtn.style.pointerEvents = busy ? "none" : "auto";
  }

  function setStatus(text) {
    const el = document.getElementById("statusLine");
    if (el) el.textContent = text || "";
  }

  async function send() {
    const text = els.input.value.trim();
    if (!text) return;

    if (!workerUrl || workerUrl.includes("YOUR_WORKER_URL")) {
      const chat = ensureChat();
      chat.messages.push({ role: "user", text });
      chat.messages.push({
        role: "model",
        text: "Не настроен workerUrl в public/config.js и токен. См. README.",
        error: true,
      });
      chat.title = text.slice(0, 40);
      saveChats();
      renderMessages();
      els.input.value = "";
      return;
    }

    const chat = ensureChat();
    chat.messages.push({ role: "user", text, id: "u" + Date.now() });
    chat.title = chat.messages[0].text.slice(0, 40);
    const pending = { role: "model", text: "", pending: true, id: "m" + Date.now() };
    chat.messages.push(pending);
    saveChats();
    renderMessages();
    els.input.value = "";
    els.input.style.height = "auto";
    setBusy(true);

    const payload = {
      messages: chat.messages.filter((m) => !m.pending && !m.error).map((m) => ({ role: m.role, text: m.text })),
      model: els.modelSelect.value,
      stream: true,
    };

    const lastModelMsg = () => chat.messages.find((m) => m.pending);

    const controller = new AbortController();
    const watchdog = setTimeout(() => controller.abort(), 120000);
    const t0 = Date.now();

    const tryAttempt = async (attempt) => {
      if (attempt > 1) setStatus("Попытка " + attempt + " из 3, сеть нестабильна...");
      const res = await fetch(workerUrl + "?t=" + encodeURIComponent(apiToken), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
      if (!res.ok) {
        let data = null;
        try { data = await res.json(); } catch {}
        return { error: data && data.error ? data.error : "Ошибка " + res.status };
      }
      let out = "";
      setStatus("Ждём ответ модели...");
      await readStream(res.body, (chunk) => {
        out += chunk;
        setStatus("");
        const mm = lastModelMsg();
        if (mm) mm.text += chunk;
        updateLiveBubble(mm);
      });
      return { out };
    };

    try {
      let result = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          result = await tryAttempt(attempt);
          if (result && result.out) break;
          if (attempt < 3 && (!result || !result.out)) {
            await new Promise((r2) => setTimeout(r2, 2500));
            continue;
          }
        } catch (err) {
          if (attempt < 3 && err.name !== "AbortError") {
            await new Promise((r2) => setTimeout(r2, 2500));
            continue;
          }
          throw err;
        }
      }

      const p2 = lastModelMsg();
      if (p2) p2.pending = false;
      if (result && result.error) {
        p2.error = true;
        p2.text = result.error;
        setStatus("Ответ с ошибкой: " + result.error);
      } else if (!result || !result.out) {
        p2.error = true;
        p2.text = "Пустой ответ от модели. Попробуйте ещё раз или смените модель в шапке (если выбрана Pro — нужен платный план).";
      }
      saveChats();
      renderMessages();
    } catch (err) {
      const p = lastModelMsg();
      if (p) {
        p.pending = false;
        p.text = err.name === "AbortError"
          ? "Ответ пришёл дольше 2 минут. Попробуйте ещё раз или смените модель."
          : "Ошибка сети после 3 попыток: " + err.message;
        p.error = true;
      }
      saveChats();
      renderMessages();
    } finally {
      clearTimeout(watchdog);
      setStatus("");
      setBusy(false);
    }
  }

  function updateLiveBubble(mm) {
    if (!mm || !mm.id) return;
    const node = els.messages.querySelector('[data-mid="' + mm.id + '"]');
    if (!node) return;
    const bubble = node.querySelector(".bubble");
    if (!bubble) return;
    bubble.innerHTML = mm.text ? mdToHtml(mm.text) : '<div class="typing"><span></span><span></span><span></span></div>';
    scrollBottom();
  }

  async function readStream(body, onChunk) {
    const reader = body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const payload = t.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const obj = JSON.parse(payload);
          const parts = obj?.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.text) onChunk(part.text);
          }
        } catch {}
      }
    }
  }

  // ---------- Мини-markdown ----------
  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inline(s) {
    let t = s;
    t = t.replace(/`([^`]+)`/g, '<code class="inline">$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    return t;
  }

  function mdToHtml(src) {
    if (!src) return "";
    const norm = src.replace(/\r\n/g, "\n");
    let escaped = escapeHtml(norm);
    escaped = escaped.replace(/```([\s\S]*?)```/g, (_, code) => {
      const c = code.replace(/^\n|\n$/g, "");
      return "<pre><code>" + c + "</code></pre>";
    });
    const blocks = escaped.split(/\n{2,}/);
    const out = blocks
      .map((block) => {
        const b = block.trim();
        if (!b) return "";
        if (b.startsWith("<pre>")) return b;
        const lines = b.split("\n");
        const header = b.match(/^(#{1,3}) (.*)$/);
        if (header) {
          const n = header[1].length;
          return `<h${n}>${inline(header[2])}</h${n}>`;
        }
        if (lines.every((l) => /^[-*] /.test(l))) {
          return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^[-*] /, "")) + "</li>").join("") + "</ul>";
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return "<ol>" + lines.map((l) => "<li>" + inline(l.replace(/^\d+\. /, "")) + "</li>").join("") + "</ol>";
        }
        const par = lines.map((l) => inline(l)).join("<br>");
        return `<p>${par}</p>`;
      })
      .join("");
    return out;
  }

  // ---------- События ----------
  els.newChatBtn.addEventListener("click", () => {
    createChat();
    els.input.focus();
  });

  els.sendBtn.addEventListener("click", send);

  els.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  els.input.addEventListener("input", () => {
    els.input.style.height = "auto";
    els.input.style.height = Math.min(els.input.scrollHeight, 200) + "px";
    els.sendBtn.classList.toggle("ready", els.input.value.trim().length > 0);
  });

  els.clearBtn.addEventListener("click", () => {
    const chat = currentChat();
    if (chat) {
      chat.messages = [];
      chat.title = "Новый чат";
      saveChats();
      renderMessages();
    }
  });

  els.modelSelect.addEventListener("change", () => {
    try { localStorage.setItem("gemini-bridge-model", els.modelSelect.value); } catch {}
  });

  (function init() {
    const savedModel = localStorage.getItem("gemini-bridge-model");
    if (savedModel) {
      els.modelSelect.value = savedModel;
    } else {
      const custom = BRIDGE_CONFIG.model;
      if (custom && [...els.modelSelect.options].some((o) => o.value === custom)) {
        els.modelSelect.value = custom;
      }
    }
    setCurrent(null);
    els.input.focus();
  })();
})();