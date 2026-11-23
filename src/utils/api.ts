import type {
  EtfDetailResponse,
  EtfDirectoryItem,
  EtfDividendSummaryItem,
  EtfHoldingsSnapshot,
  EtfQuote,
  HoldingsCompareResponse,
  WatchlistDividendSummaryResponse,
} from '../types/etf';
import { computeHoldingsCompare } from './holdingsCompare';
import { fetchRealtimeCnyesQuotes } from './realtimeQuotes';

const rawBase = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = rawBase.replace(/\/+$/, '');
const FORCE_STATIC = import.meta.env.VITE_STATIC_DATA === 'true';

let staticDetected = FORCE_STATIC && API_BASE.length === 0;
let cachedStaticQuotes: { quotes: EtfQuote[]; fetchedAt: string } | null = null;
let cachedStaticSummaries: WatchlistDividendSummaryResponse | null = null;
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
        }&_=${Date.now()}`
      );
      const res = await fetch(url, { cache: 'no-store' });
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
        // Fall through to static snapshot + live browser quote below
      } else {
        throw err;
      }
    }
  }

  const [snapResult, rtMap] = await Promise.all([
    !cachedStaticQuotes || forceRefresh
      ? fetchJsonSafe<{ quotes: EtfQuote[]; fetchedAt: string }>(
          staticDataUrl('quotes.json', forceRefresh)
        ).then((s) => {
          if (s) cachedStaticQuotes = s;
          return s;
        })
      : Promise.resolve(cachedStaticQuotes),
    fetchRealtimeCnyesQuotes(normalized),
  ]);

  const snapQuotes = snapResult || cachedStaticQuotes;
  const staticByCode = new Map<string, EtfQuote>(
    (snapQuotes?.quotes || []).map((q) => [q.code, q])
  );

  const mergedQuotes: EtfQuote[] = [];
  let latestFetchedAt = snapQuotes?.fetchedAt || '';

  for (const c of normalized) {
    const base = staticByCode.get(c);
    const rt = rtMap.get(c);
    if (rt && rt.price > 0) {
      latestFetchedAt = rt.fetchedAt || latestFetchedAt;
      if (base) {
        const estNav = base.estimatedNav;
        mergedQuotes.push({
          ...base,
          price: rt.price,
          prevClose: rt.prevClose > 0 ? rt.prevClose : base.prevClose,
          open: rt.open ?? base.open,
          high: rt.high ?? base.high,
          low: rt.low ?? base.low,
          change: rt.change,
          changePct: rt.changePct,
          volumeLots: rt.volumeLots > 0 ? rt.volumeLots : base.volumeLots,
          premiumDiscountPct:
            estNav && estNav > 0
              ? Number((((rt.price - estNav) / estNav) * 100).toFixed(2))
              : base.premiumDiscountPct,
          quoteDate: rt.quoteDate,
          quoteTime: rt.quoteTime,
          isIntraday: rt.isIntraday,
          marketStatusLabel: rt.marketStatusLabel,
          fetchedAt: rt.fetchedAt,
        });
      } else {
        mergedQuotes.push(rt);
      }
    } else if (base) {
      mergedQuotes.push(base);
    }
  }

  if (mergedQuotes.length === 0 && !snapQuotes) {
    throw new Error('尚未找到報價資料（請確認網路連線或 GitHub Actions 部署已完成）');
  }

  return {
    quotes: mergedQuotes,
    fetchedAt: latestFetchedAt,
    isStatic: true,
  };
}

export async function fetchConstituentQuotes(
  codes: string[],
  forceRefresh = false
): Promise<{ quotes: Record<string, EtfQuote>; fetchedAt: string }> {
  const validCodes = Array.from(
    new Set(
      codes
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^(?:\d{4,6}[A-Z]?|00\d{2,4}[A-Z]?)$/.test(c))
    )
  );
  if (validCodes.length === 0) {
    return { quotes: {}, fetchedAt: '' };
  }

  if (!staticDetected) {
    try {
      const url = apiUrl(
        `/api/etfs/quotes?codes=${encodeURIComponent(validCodes.join(','))}${
          forceRefresh ? '&refresh=1' : ''
        }&_=${Date.now()}`
      );
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = (await res.json()) as { quotes: EtfQuote[]; fetchedAt: string };
          const map: Record<string, EtfQuote> = {};
          for (const q of data.quotes || []) {
            map[q.code] = q;
          }
          return { quotes: map, fetchedAt: data.fetchedAt || '' };
        }
      }
      if (!hasExternalApiBase() && res.status === 404) {
        staticDetected = true;
      }
    } catch {
      if (!hasExternalApiBase() && !staticDetected) {
        staticDetected = true;
      }
    }
  }

  const rtMap = await fetchRealtimeCnyesQuotes(validCodes);
  const map: Record<string, EtfQuote> = {};
  let latestFetchedAt = '';
  for (const [code, q] of rtMap.entries()) {
    map[code] = q;
    if (q.fetchedAt) latestFetchedAt = q.fetchedAt;
  }
  return { quotes: map, fetchedAt: latestFetchedAt };
}

export async function fetchEtfDetail(
  code: string,
  forceRefresh = false
): Promise<{ detail: EtfDetailResponse; isStatic: boolean }> {
  const upper = code.trim().toUpperCase();

  if (!staticDetected) {
    try {
      const url = apiUrl(
        `/api/etfs/${encodeURIComponent(upper)}/detail${
          forceRefresh ? '?refresh=1&' : '?'
        }_=${Date.now()}`
      );
      const res = await fetch(url, { cache: 'no-store' });
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

export async function fetchWatchlistDividendSummaries(
  codes: string[],
  forceRefresh = false
): Promise<{ items: EtfDividendSummaryItem[]; fetchedAt: string; isStatic: boolean }> {
  const uniqueCodes = Array.from(
    new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  );
  if (uniqueCodes.length === 0) {
    return { items: [], fetchedAt: '', isStatic: staticDetected };
  }

  if (!staticDetected) {
    try {
      const url = apiUrl(
        `/api/etfs/dividend-summary?codes=${encodeURIComponent(uniqueCodes.join(','))}${
          forceRefresh ? '&refresh=1' : ''
        }`
      );
      const res = await fetch(url);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const data = (await res.json()) as WatchlistDividendSummaryResponse;
          return { ...data, isStatic: false };
        }
      }
      if (!hasExternalApiBase() && res.status === 404) {
        staticDetected = true;
      } else {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || '無法取得觀察清單配息試算資料');
      }
    } catch (err) {
      if (!hasExternalApiBase() && !staticDetected) {
        staticDetected = true;
      } else if (!staticDetected) {
        throw err;
      }
    }
  }

  if (!cachedStaticSummaries || forceRefresh) {
    const snap = await fetchJsonSafe<WatchlistDividendSummaryResponse>(
      staticDataUrl('dividend-summaries.json', forceRefresh)
    );
    if (snap) {
      cachedStaticSummaries = snap;
    }
  }

  const byCode = new Map<string, EtfDividendSummaryItem>();
  if (cachedStaticSummaries) {
    for (const item of cachedStaticSummaries.items) {
      byCode.set(item.code, item);
    }
  }

  const missingCodes = uniqueCodes.filter((c) => !byCode.has(c));
  if (missingCodes.length > 0 && !cachedStaticQuotes) {
    const qSnap = await fetchJsonSafe<{ quotes: EtfQuote[]; fetchedAt: string }>(
      staticDataUrl('quotes.json', forceRefresh)
    );
    if (qSnap) cachedStaticQuotes = qSnap;
  }
  if (missingCodes.length > 0 && cachedStaticQuotes) {
    const quoteMap = new Map(cachedStaticQuotes.quotes.map((q) => [q.code, q]));
    for (const c of missingCodes) {
      const q = quoteMap.get(c);
      if (q) {
        byCode.set(c, {
          code: q.code,
          name: q.name,
          exchange: q.exchange,
          price: q.price,
          quoteDate: q.quoteDate,
          quoteTime: q.quoteTime,
          isIntraday: q.isIntraday,
          marketStatusLabel: q.marketStatusLabel,
          trailing12mDividend: 0,
          latestTtmYieldPct: null,
          dividendFrequency: null,
          payoutCount12m: 0,
          hasData: false,
        });
      }
    }
  }

  return {
    items: uniqueCodes
      .map((c) => byCode.get(c))
      .filter((x): x is EtfDividendSummaryItem => Boolean(x)),
    fetchedAt: cachedStaticSummaries?.fetchedAt || cachedStaticQuotes?.fetchedAt || '',
    isStatic: true,
  };
}

