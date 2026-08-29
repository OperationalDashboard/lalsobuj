const BASE = "/api";

export function getToken() {
  return sessionStorage.getItem("lsp_token");
}

export function setToken(token) {
  if (token) sessionStorage.setItem("lsp_token", token);
  else sessionStorage.removeItem("lsp_token");
}

export function getUser() {
  const raw = sessionStorage.getItem("lsp_user");
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user) {
  if (user) sessionStorage.setItem("lsp_user", JSON.stringify(user));
  else sessionStorage.removeItem("lsp_user");
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
    setUser(null);
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  del: (path) => request(path, { method: "DELETE" }),
};
