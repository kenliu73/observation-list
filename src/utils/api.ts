import type {
  EtfDetailResponse,
  EtfDirectoryItem,
  EtfHoldingsSnapshot,
  EtfQuote,
  HoldingsCompareResponse,
} from '../types/etf';
import { computeHoldingsCompare } from './holdingsCompare';

const rawBase = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = rawBase.replace(/\/+$/, '');
const FORCE_STATIC = import.meta.env.VITE_STATIC_DATA === 'true';

let staticDetected = FORCE_STATIC && API_BASE.length === 0;
let cachedStaticQuotes: { quotes: EtfQuote[]; fetchedAt: string } | null = null;
const cachedStaticDetails = new Map<string, EtfDetailResponse>();

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function hasExternalApiBase(): boolean {
  return API_BASE.length > 0;
}

export function isStaticDataMode(): boolean {
  return staticDetected;
}

function staticDataUrl(relPath: string, bustCache = false): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  const suffix = bustCache ? `?t=${Date.now()}` : '';
  return `${base}data/${relPath}${suffix}`;
}

async function fetchJsonSafe<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json') && !ct.includes('text/plain')) {
    return null;
  }
  return (await res.json()) as T;
}

export async function fetchEtfDirectory(): Promise<EtfDirectoryItem[]> {
  if (!staticDetected) {
    try {
      const live = await fetchJsonSafe<{ items: EtfDirectoryItem[] }>(
        apiUrl('/api/etfs/directory')
      );
      if (live && Array.isArray(live.items)) return live.items;
      if (!hasExternalApiBase()) staticDetected = true;
    } catch {
      if (!hasExternalApiBase()) staticDetected = true;
    }
  }

  const snap = await fetchJsonSafe<{ items: EtfDirectoryItem[] }>(
    staticDataUrl('directory.json')
  );
  return Array.isArray(snap?.items) ? snap.items : [];
}

export async function fetchEtfQuotes(
  codes: string[],
  forceRefresh = false
): Promise<{ quotes: EtfQuote[]; fetchedAt: string; isStatic: boolean }> {
  const normalized = Array.from(
    new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  );
  if (normalized.length === 0) {
    return { quotes: [], fetchedAt: '', isStatic: staticDetected };
  }

  if (!staticDetected) {
    try {
      const url = apiUrl(
        `/api/etfs/quotes?codes=${encodeURIComponent(normalized.join(','))}${
          forceRefresh ? '&refresh=1' : ''
        }`
      );
      const res = await fetch(url);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = (await res.json()) as { quotes: EtfQuote[]; fetchedAt: string };
          return { ...data, isStatic: false };
        }
      }
      if (!hasExternalApiBase() && res.status === 404) {
        staticDetected = true;
      } else {
        throw new Error('無法取得臺灣證券交易所即時報價');
      }
    } catch (err) {
      if (!hasExternalApiBase() && !staticDetected) {
        staticDetected = true;
      } else if (staticDetected) {
        // Fall through to static snapshot below
      } else {
        throw err;
      }
    }
  }

  if (!cachedStaticQuotes || forceRefresh) {
    const snap = await fetchJsonSafe<{ quotes: EtfQuote[]; fetchedAt: string }>(
      staticDataUrl('quotes.json', forceRefresh)
    );
    if (!snap) {
      throw new Error('尚未找到靜態報價資料（請確認 GitHub Actions 部署已完成）');
    }
    cachedStaticQuotes = snap;
  }

  const wanted = new Set(normalized);
  const filtered = cachedStaticQuotes.quotes.filter((q) => wanted.has(q.code));
  return {
    quotes: filtered,
    fetchedAt: cachedStaticQuotes.fetchedAt,
    isStatic: true,
  };
}

export async function fetchEtfDetail(
  code: string,
  forceRefresh = false
): Promise<{ detail: EtfDetailResponse; isStatic: boolean }> {
  const upper = code.trim().toUpperCase();

  if (!staticDetected) {
    try {
      const url = apiUrl(
        `/api/etfs/${encodeURIComponent(upper)}/detail${forceRefresh ? '?refresh=1' : ''}`
      );
      const res = await fetch(url);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = (await res.json()) as EtfDetailResponse;
          return { detail: data, isStatic: false };
        }
      }
      if (!hasExternalApiBase() && res.status === 404) {
        staticDetected = true;
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `無法載入 ${upper} 的 ETF 資料`);
      }
    } catch (err) {
      if (!hasExternalApiBase() && !staticDetected) {
        staticDetected = true;
      } else if (!staticDetected) {
        throw err;
      }
    }
  }

  if (!forceRefresh && cachedStaticDetails.has(upper)) {
    return { detail: cachedStaticDetails.get(upper)!, isStatic: true };
  }

  const snap = await fetchJsonSafe<EtfDetailResponse>(
    staticDataUrl(`details/${encodeURIComponent(upper)}.json`, forceRefresh)
  );
  if (!snap) {
    throw new Error(
      `GitHub 靜態模式目前預先收錄 47 檔熱門台股 ETF 完整線圖與成分股，${upper} 暫僅於左側提供即時收盤報價。`
    );
  }
  cachedStaticDetails.set(upper, snap);
  return { detail: snap, isStatic: true };
}

export async function fetchHoldingsCompare(
  codes: string[],
  forceRefresh = false
): Promise<{ data: HoldingsCompareResponse; skippedCodes: string[]; isStatic: boolean }> {
  const uniqueCodes = Array.from(
    new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  ).slice(0, 8);

  if (!staticDetected) {
    try {
      const url = apiUrl(
        `/api/etfs/holdings-compare?codes=${encodeURIComponent(uniqueCodes.join(','))}${
          forceRefresh ? '&refresh=1' : ''
        }`
      );
      const res = await fetch(url);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = (await res.json()) as HoldingsCompareResponse;
          return { data, skippedCodes: [], isStatic: false };
        }
      }
      if (!hasExternalApiBase() && res.status === 404) {
        staticDetected = true;
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '無法取得重疊持股對比資料');
      }
    } catch (err) {
      if (!hasExternalApiBase() && !staticDetected) {
        staticDetected = true;
      } else if (!staticDetected) {
        throw err;
      }
    }
  }

  const loadedSnapshots: EtfHoldingsSnapshot[] = [];
  const skippedCodes: string[] = [];

  await Promise.all(
    uniqueCodes.map(async (c) => {
      try {
        const { detail } = await fetchEtfDetail(c, forceRefresh);
        loadedSnapshots.push({
          code: detail.quote.code,
          name: detail.quote.name,
          dataDate: detail.holdings.dataDate,
          items: detail.holdings.items,
        });
      } catch {
        skippedCodes.push(c);
      }
    })
  );

  // Preserve requested code order
  const byCode = new Map(loadedSnapshots.map((s) => [s.code, s]));
  const ordered = uniqueCodes
    .map((c) => byCode.get(c))
    .filter((x): x is EtfHoldingsSnapshot => Boolean(x));

  if (ordered.length < 2) {
    throw new Error('所選 ETF 需至少 2 檔具備成分股快照資料，才可進行重疊持股比對');
  }

  return {
    data: computeHoldingsCompare(
      ordered,
      ordered.map((e) => e.code)
    ),
    skippedCodes,
    isStatic: true,
  };
}
