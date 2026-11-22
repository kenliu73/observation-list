const rawBase = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = rawBase.replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function hasExternalApiBase(): boolean {
  return API_BASE.length > 0;
}
