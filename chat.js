// Replace this URL after deploying the Cloudflare Worker.
const API_URL = "https://yume-ai-api.yumechiyomi-ai.workers.dev";

// Local fallback is optional. It only works on the computer running Ollama
// and the local Python bridge. Public visitors do not share your local model.
const LOCAL_FALLBACK_URL = "http://127.0.0.1:8788/chat";
const STORAGE_KEY = "yume-ai-chat-v1";
const MAX_HISTORY = 12;

const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const form = document.getElementById("chatForm");
const input = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const statusEl = document.getElementById("connectionStatus");

let history = loadHistory();
let busy = false;

function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.slice(-MAX_HISTORY) : [];
  } catch { return []; }
}

function saveHistory() {
  // This is local browser history, not the creator's personal memory database.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
}

function addMessage(role, text, meta = "") {
  if (welcomeEl) welcomeEl.remove();
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "You" : "Y";
  const content = document.createElement("div");
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  
  if (role === "user") {
    // Tin nhắn của người dùng giữ nguyên dạng text thuần túy để bảo mật
    bubble.textContent = text;
  } else {
    // Tin nhắn của AI (assistant) sẽ được dịch từ Markdown sang HTML
    // Marked.parse giúp hiển thị định dạng bold, list, code block...
    bubble.innerHTML = marked.parse(text);
  }

  content.appendChild(bubble);
  if (meta) {
    const m = document.createElement("div");
    m.className = "message-meta";
    m.textContent = meta;
    content.appendChild(m);
  }
  wrap.append(avatar, content);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}

function renderHistory() {
  if (!history.length) return;
  if (welcomeEl) welcomeEl.remove();
  history.forEach(item => addMessage(item.role, item.content));
}

function setBusy(value) {
  busy = value;
  sendButton.disabled = value;
  input.disabled = value;
}

async function askCloud(messages) {
  if (API_URL.includes("YOUR-WORKER-NAME")) {
    throw new Error("Bạn chưa cấu hình API_URL trong frontend/chat.js.");
  }
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Cloud API lỗi (${response.status})`);
  return { reply: data.reply, provider: data.provider || "gemini" };
}

async function askLocal(messages) {
  const response = await fetch(LOCAL_FALLBACK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });
  if (!response.ok) throw new Error("Local Ollama không phản hồi.");
  const data = await response.json();
  if (!data.reply) throw new Error("Local model trả về dữ liệu không hợp lệ.");
  return { reply: data.reply, provider: "ollama-local" };
}

async function sendMessage(text) {
  const clean = text.trim();
  if (!clean || busy) return;

  history.push({ role: "user", content: clean });
  history = history.slice(-MAX_HISTORY);
  addMessage("user", clean);
  saveHistory();
  input.value = "";
  input.style.height = "auto";
  setBusy(true);

  const typing = document.createElement("div");
  typing.className = "typing";
  typing.textContent = "Yume đang suy nghĩ...";
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const context = history.slice(-MAX_HISTORY);
  try {
    let result;
    try {
      result = await askCloud(context);
      statusEl.textContent = "Cloud AI · Gemini";
    } catch (cloudError) {
      console.warn("Cloud AI unavailable; trying local fallback:", cloudError);
      result = await askLocal(context);
      statusEl.textContent = "Local AI · Ollama";
    }
    typing.remove();
    history.push({ role: "assistant", content: result.reply });
    history = history.slice(-MAX_HISTORY);
    saveHistory();
    addMessage("assistant", result.reply, result.provider);
  } catch (error) {
    typing.remove();
    const reason = error?.message || "Không thể kết nối AI.";
    addMessage("assistant", `Mình chưa kết nối được với bộ não AI rồi 😿\n\n${reason}\n\nBạn hãy kiểm tra Worker/Gemini hoặc bật Ollama local nhé.`, "Connection error");
  } finally {
    setBusy(false);
    input.focus();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  sendMessage(input.value);
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 150)}px`;
});

input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll(".suggestion").forEach(button => {
  button.addEventListener("click", () => sendMessage(button.textContent));
});

document.getElementById("newChat").addEventListener("click", () => {
  history = [];
  saveHistory();
  location.reload();
});

document.getElementById("clearChat").addEventListener("click", () => {
  if (confirm("Xóa lịch sử trò chuyện được lưu trên thiết bị này?")) {
    history = [];
    saveHistory();
    location.reload();
  }
});

async function checkConnection() {
  try {
    if (API_URL.includes("YOUR-WORKER-NAME")) throw new Error("Not configured");
    const response = await fetch(`${API_URL}/api/health`);
    if (!response.ok) throw new Error("API unavailable");
    statusEl.textContent = "Cloud API sẵn sàng";
  } catch {
    statusEl.textContent = "Đang chờ kết nối AI";
  }
}

renderHistory();
checkConnection();
