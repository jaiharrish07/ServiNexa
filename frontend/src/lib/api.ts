const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.setToken(null);
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data as T;
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, body?: unknown) { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }); }
  patch<T>(path: string, body?: unknown) { return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }); }
  put<T>(path: string, body?: unknown) { return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) }); }
  delete<T>(path: string) { return this.request<T>(path, { method: 'DELETE' }); }
}

export const api = new ApiClient();
