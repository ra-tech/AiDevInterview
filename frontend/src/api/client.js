const API_URL = import.meta.env.PROD ? '' : import.meta.env.VITE_API_URL || 'http://localhost:4000';

/**
 * Every request needs credentials: 'include' so the httpOnly JWT cookie set by the backend
 * actually gets sent back on subsequent requests — without this, the browser treats each
 * request as a fresh anonymous session even right after a successful login.
 */
async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: options.body instanceof FormData ? options.headers : { 'Content-Type': 'application/json', ...options.headers }
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // some endpoints (e.g. DELETE) may return no body
  }

  if (!res.ok) {
    const error = new Error(data?.error?.formErrors?.[0] || data?.error || `Request failed (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  postForm: (path, formData) => request(path, { method: 'POST', body: formData })
};
