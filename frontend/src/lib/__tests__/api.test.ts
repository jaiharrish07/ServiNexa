import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// Must import after mocks
const { api } = await import('../api');

beforeEach(() => {
  vi.restoreAllMocks();
  api.setToken(null);
  for (const k of Object.keys(store)) delete store[k];
});

describe('ApiClient', () => {
  it('setToken stores token and persists to localStorage', () => {
    api.setToken('abc123');
    expect(api.getToken()).toBe('abc123');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('token', 'abc123');
  });

  it('setToken(null) clears the token', () => {
    api.setToken('abc123');
    api.setToken(null);
    expect(api.getToken()).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
  });

  it('get() builds the correct URL and sends auth header', async () => {
    api.setToken('mytoken');
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: 'ok' }),
    });
    globalThis.fetch = mockFetch;

    const result = await api.get('/api/test');
    expect(result).toEqual({ data: 'ok' });
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mytoken',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('handles 401 by clearing token and throwing', async () => {
    api.setToken('expired');
    // Mock window.location to prevent jsdom navigation error
    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', { value: locationMock, writable: true });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });

    await expect(api.get('/api/secure')).rejects.toThrow('Unauthorized');
    expect(api.getToken()).toBeNull();
  });
});
