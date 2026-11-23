import type {
  AnnualYieldPoint,
  DistributableInfo,
  DividendPeriod,
  EtfDetailResponse,
  EtfDirectoryItem,
  EtfDividendSummaryItem,
  EtfHoldingsSnapshot,
  EtfQuote,
  HoldingItem,
  HoldingsCompareResponse,
  PricePoint,
  RollingYieldPoint,
  SectorItem,
  WatchlistDividendSummaryResponse,
} from '../src/types/etf.ts';
import { computeHoldingsCompare } from '../src/utils/holdingsCompare.ts';
import { fetchRealtimeCnyesQuotes } from '../src/utils/realtimeQuotes.ts';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const OFFICIAL_PAR_VALUE_FALLBACK: Record<string, { par: number; note: string }> = {
  '0050': { par: 9.245, note: '原始發行價 36.98 元（2025/06/11 一拆四分割調整後為 9.245 元）' },
  '0056': { par: 25, note: 'TWSE 公開說明書載明發行價格 25 元' },
  '006208': { par: 30, note: '富邦台50 信託契約發行面額 30 元' },
  '00713': { par: 30, note: 'TWSE 公開說明書載明發行價格 30 元' },
  '00850': { par: 20, note: '元大臺灣ESG永續 發行面額 20 元' },
  '00878': { par: 15, note: '國泰永續高股息 發行面額 15 元' },
  '00881': { par: 15, note: '國泰台灣科技龍頭 發行面額 15 元' },
  '00891': { par: 15, note: '中信關鍵半導體 發行面額 15 元' },
  '00900': { par: 15, note: '富邦特選高股息30 發行面額 15 元' },
  '00912': { par: 15, note: '中信臺灣智慧50 發行面額 15 元' },
  '00915': { par: 15, note: '凱基優選高股息30 發行面額 15 元' },
  '00918': { par: 15, note: '大華優利高填息30 發行面額 15 元' },
  '00919': { par: 15, note: '群益台灣精選高息 發行面額 15 元' },
  '00921': { par: 15, note: '兆豐龍頭等權重 發行面額 15 元' },
  '00922': { par: 15, note: '國泰台灣領袖50 發行面額 15 元' },
  '00923': { par: 15, note: '群益台ESG低碳50 發行面額 15 元' },
  '00929': { par: 15, note: '復華台灣科技優息 發行面額 15 元' },
  '00934': { par: 15, note: '中信成長高股息 發行面額 15 元' },
  '00936': { par: 15, note: '台新永續高息中小 發行面額 15 元' },
  '00939': { par: 15, note: '統一台灣高息動能 發行面額 15 元' },
  '00940': { par: 10, note: '元大台灣價值高息 發行面額 10 元' },
  '00944': { par: 15, note: '野村趨勢動能高息 發行面額 15 元' },
  '00946': { par: 10, note: '群益科技高息成長 發行面額 10 元' },
};

const SECTOR_PALETTE = [
  '#1D4ED8',
  '#0EA5E9',
  '#0D9488',
  '#D97706',
  '#7C3AED',
  '#E11D48',
  '#4F46E5',
  '#059669',
  '#EA580C',
  '#64748B',
];

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const directoryCache: { entry: CacheEntry<EtfDirectoryItem[]> | null } = { entry: null };
const allEtfNavCache: { entry: CacheEntry<Map<string, any>> | null } = { entry: null };
const stockCodeMapCache: { entry: CacheEntry<Map<string, string>> | null } = { entry: null };
const detailCache = new Map<string, CacheEntry<EtfDetailResponse>>();
const holdingsSnapshotCache = new Map<string, CacheEntry<EtfHoldingsSnapshot>>();

function cleanEtfName(raw: string): string {
  return (raw || '')
    .replace(/\([^)]*配息來源[^)]*\)/g, '')
    .replace(/（[^）]*配息來源[^）]*）/g, '')
    .trim();
}

export function getTaipeiNowParts(): {
  dateStr: string;
  timeStr: string;
  hhmm: number;
  isWeekday: boolean;
  formattedFull: string;
} {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const timeStr = `${parts.hour}:${parts.minute}:${parts.second}`;
  const hhmm = Number(parts.hour) * 100 + Number(parts.minute);
  const isWeekday = !['Sat', 'Sun'].includes(parts.weekday || '');
  return {
    dateStr,
    timeStr,
    hhmm,
    isWeekday,
    formattedFull: `${parts.year}/${parts.month}/${parts.day} ${timeStr}`,
  };
}

function formatDateTaipeiFromUnix(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

function parseRocDateToIso(roc: string): string | null {
  const m = roc.match(/(\d{2,3})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  if (!m) return null;
  const year = Number(m[1]) + 1911;
  const month = m[2].padStart(2, '0');
  const day = m[3].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseNum(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const cleaned = String(val).replace(/[,%\s元]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === 'N/A' || cleaned === '--') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 9000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json, text/html, */*',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractIssuer(name: string): string {
  const prefixes = [
    '元大',
    '國泰',
    '富邦',
    '群益',
    '復華',
    '中信',
    '凱基',
    '永豐',
    '台新',
    '兆豐',
    '大華',
    '統一',
    '野村',
    '新光',
    '街口',
    '期街口',
    '第一金',
    '保德信',
    '聯邦',
    '主動',
  ];
  for (const p of prefixes) {
    if (name.includes(p)) return p === '主動' ? '投信主動式' : `${p}投信`;
  }
  return '台灣投信';
}

async function getAllEtfNavMap(forceRefresh = false): Promise<Map<string, any>> {
  const now = Date.now();
  if (!forceRefresh && allEtfNavCache.entry && allEtfNavCache.entry.expiresAt > now) {
    return allEtfNavCache.entry.value;
  }
  const map = new Map<string, any>();
  try {
    const res = await fetchWithTimeout('https://mis.twse.com.tw/stock/data/all_etf.txt', 8000);
    if (res.ok) {
      const json = (await res.json()) as { a1?: Array<{ msgArray?: any[] }> };
      const rows = (json.a1 || []).flatMap((g) => g.msgArray || []);
      for (const item of rows) {
        if (item?.a) {
          map.set(String(item.a).trim(), item);
        }
      }
    }
  } catch {
    // Keep partial empty map on transient failure
  }
  allEtfNavCache.entry = { value: map, expiresAt: now + 30_000 };
  return map;
}

function normalizeStockName(name: string): string {
  return name.replace(/[\s　*＊]+/g, '').trim();
}

function parseMoneyDjSectionDate(html: string, elementSuffix: 'sdate2' | 'sdate3'): string | null {
  if (!html) return null;
  const idRe = new RegExp(`id="[^"]*${elementSuffix}"[^>]*>[^<]*?(\\d{4}\\/\\d{2}\\/\\d{2})`, 'i');
  const idMatch = html.match(idRe);
  if (idMatch) return idMatch[1].replace(/\//g, '-');
  const allMatches = [...html.matchAll(/資料日期[：:]\s*(\d{4}\/\d{2}\/\d{2})/g)];
  if (allMatches.length === 0) return null;
  const picked = elementSuffix === 'sdate3' ? allMatches[allMatches.length - 1] : allMatches[0];
  return picked[1].replace(/\//g, '-');
}

async function getTaiwanStockCodeMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (stockCodeMapCache.entry && stockCodeMapCache.entry.expiresAt > now) {
    return stockCodeMapCache.entry.value;
  }

  const map = new Map<string, string>();
  const [twseRes, tpexRes] = await Promise.all([
    fetchWithTimeout('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', 10_000)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    fetchWithTimeout('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes', 10_000)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
  ]);

  if (Array.isArray(twseRes)) {
    for (const row of twseRes) {
      const code = String(row?.Code || '').trim().toUpperCase();
      const name = String(row?.Name || '').trim();
      if (!code || !name || !/^(?:\d{4}[A-Z]?|00\d{2,4}[A-Z]?)$/.test(code)) continue;
      if (!map.has(name)) map.set(name, code);
      const norm = normalizeStockName(name);
      if (norm && !map.has(norm)) map.set(norm, code);
    }
  }

  if (Array.isArray(tpexRes)) {
    for (const row of tpexRes) {
      const code = String(row?.SecuritiesCompanyCode || '').trim().toUpperCase();
      const name = String(row?.CompanyName || '').trim();
      if (!code || !name || !/^(?:\d{4}[A-Z]?|00\d{2,4}[A-Z]?)$/.test(code)) continue;
      if (!map.has(name)) map.set(name, code);
      const norm = normalizeStockName(name);
      if (norm && !map.has(norm)) map.set(norm, code);
    }
  }

  if (map.size > 0) {
    stockCodeMapCache.entry = { value: map, expiresAt: now + 12 * 3600_000 };
  }
  return map;
}

function resolveConstituentCode(
  name: string,
  tickerByName: Map<string, string>,
  stockCodeMap: Map<string, string>
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const direct = tickerByName.get(trimmed) ?? stockCodeMap.get(trimmed);
  if (direct) return direct;
  const norm = normalizeStockName(trimmed);
  return tickerByName.get(norm) ?? stockCodeMap.get(norm) ?? null;
}

export async function getEtfDirectory(): Promise<EtfDirectoryItem[]> {
  const now = Date.now();
  if (directoryCache.entry && directoryCache.entry.expiresAt > now) {
    return directoryCache.entry.value;
  }

  const [navMap, openApiList] = await Promise.all([
    getAllEtfNavMap(),
    fetchWithTimeout('https://openapi.twse.com.tw/v1/opendata/t187ap47_L', 10000)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
  ]);

  const merged = new Map<string, EtfDirectoryItem>();

  if (Array.isArray(openApiList)) {
    for (const row of openApiList) {
      const code = String(row['基金代號'] || '').trim();
      if (!code) continue;
      const navItem = navMap.get(code);
      merged.set(code, {
        code,
        name: cleanEtfName(String(row['基金簡稱'] || navItem?.b || code)),
        fullName: String(row['基金中文名稱'] || row['基金簡稱'] || code).trim(),
        fundType: String(row['基金類型'] || '指數股票型基金').trim(),
        issuer: String(row['經理公司'] || '').trim() || extractIssuer(String(row['基金中文名稱'] || '')),
        listingDate: parseRocDateToIso(String(row['上市日期'] || '')) || String(row['上市日期'] || ''),
        estimatedNav: parseNum(navItem?.f),
        prevNav: parseNum(navItem?.h),
        issuedUnits: parseNum(navItem?.c),
      });
    }
  }

  for (const [code, navItem] of navMap.entries()) {
    if (!merged.has(code)) {
      const name = cleanEtfName(String(navItem.b || code));
      merged.set(code, {
        code,
        name,
        fullName: name,
        fundType: 'ETF',
        issuer: extractIssuer(name),
        listingDate: '',
        estimatedNav: parseNum(navItem.f),
        prevNav: parseNum(navItem.h),
        issuedUnits: parseNum(navItem.c),
      });
    }
  }

  const list = Array.from(merged.values()).sort((a, b) => a.code.localeCompare(b.code));
  directoryCache.entry = { value: list, expiresAt: now + 3600_000 };
  return list;
}

export async function fetchTwseQuotes(codes: string[], forceRefresh = false): Promise<EtfQuote[]> {
  const uniqueCodes = Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean)));
  if (uniqueCodes.length === 0) return [];

  const channels = uniqueCodes.flatMap((c) => [`tse_${c}.tw`, `otc_${c}.tw`]);
  const chunkSize = 40;
  const rawItems: any[] = [];

  const [navMap, cnyesMap] = await Promise.all([
    getAllEtfNavMap(forceRefresh),
    fetchRealtimeCnyesQuotes(uniqueCodes, 6000),
    (async () => {
      for (let i = 0; i < channels.length; i += chunkSize) {
        const chunk = channels.slice(i, i + chunkSize).join('|');
        const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(chunk)}&json=1&delay=0&_=${Date.now()}`;
        try {
          const res = await fetchWithTimeout(url, 8000);
          if (res.ok) {
            const json = (await res.json()) as { msgArray?: any[] };
            if (Array.isArray(json.msgArray)) {
              rawItems.push(...json.msgArray);
            }
          }
        } catch {
          // Continue other chunks if one chunk times out
        }
      }
    })(),
  ]);

  const taipeiNow = getTaipeiNowParts();
  const byCode = new Map<string, EtfQuote>();

  for (const item of rawItems) {
    const code = String(item?.c || '').trim().toUpperCase();
    if (!code) continue;

    const prevClose = parseNum(item.y) ?? 0;
    const rawTradePrice = parseNum(item.z);
    let price = rawTradePrice;
    if (price === null || price <= 0) {
      price = parseNum(item.pz);
    }
    if (price === null || price <= 0) {
      const topBid = parseNum(String(item.b || '').split('_')[0]);
      const topAsk = parseNum(String(item.a || '').split('_')[0]);
      if (topBid && topAsk) price = Number(((topBid + topAsk) / 2).toFixed(2));
      else price = topBid ?? topAsk ?? prevClose;
    }

    if ((price === null || price <= 0) && prevClose <= 0) continue;

    const finalPrice = price ?? prevClose;
    const change = prevClose > 0 ? Number((finalPrice - prevClose).toFixed(4)) : 0;
    const changePct = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;

    const rawDate = String(item.d || '');
    const quoteDate =
      rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : taipeiNow.dateStr;
    const quoteTime = String(item.t || '13:30:00');

    const isToday = quoteDate === taipeiNow.dateStr;
    const isIntraday = isToday && taipeiNow.isWeekday && taipeiNow.hhmm >= 900 && taipeiNow.hhmm < 1330;
    const marketStatusLabel = isIntraday
      ? '盤中即時報價'
      : isToday && taipeiNow.hhmm >= 1330
        ? '當日已收盤'
        : '最近交易日收盤';

    const navItem = navMap.get(code);
    const estNav = parseNum(navItem?.f);
    const prevNav = parseNum(navItem?.h);
    const navDateRaw = String(navItem?.i || '');
    const navDate =
      navDateRaw.length === 8
        ? `${navDateRaw.slice(0, 4)}-${navDateRaw.slice(4, 6)}-${navDateRaw.slice(6, 8)}`
        : null;

    const existing = byCode.get(code);
    if (existing && (parseNum(item.v) ?? 0) === 0) continue;

    const twseTs = `${quoteDate} ${quoteTime}`;
    const rt = cnyesMap.get(code);
    const useRt = Boolean(
      rt &&
        rt.price > 0 &&
        (rawTradePrice === null ||
          rawTradePrice <= 0 ||
          `${rt.quoteDate} ${rt.quoteTime}` >= twseTs)
    );

    const activePrice = useRt && rt ? rt.price : finalPrice;
    const activePrevClose = useRt && rt && rt.prevClose > 0 ? rt.prevClose : prevClose;
    const activeChange = useRt && rt ? rt.change : change;
    const activeChangePct = useRt && rt ? rt.changePct : changePct;

    byCode.set(code, {
      code,
      name: cleanEtfName(String(item.n || rt?.name || navItem?.b || code)),
      exchange: item.ex === 'otc' ? 'otc' : 'tse',
      price: activePrice,
      prevClose: activePrevClose,
      open: useRt && rt && rt.open !== null ? rt.open : parseNum(item.o),
      high: useRt && rt && rt.high !== null ? rt.high : parseNum(item.h),
      low: useRt && rt && rt.low !== null ? rt.low : parseNum(item.l),
      change: activeChange,
      changePct: activeChangePct,
      volumeLots:
        useRt && rt && rt.volumeLots > 0 ? rt.volumeLots : parseNum(item.v) ?? 0,
      estimatedNav: estNav,
      prevNav,
      premiumDiscountPct:
        estNav && estNav > 0
          ? Number((((activePrice - estNav) / estNav) * 100).toFixed(2))
          : parseNum(navItem?.g),
      issuedUnits: parseNum(navItem?.c),
      unitDiff: parseNum(navItem?.d),
      quoteDate: useRt && rt ? rt.quoteDate : quoteDate,
      quoteTime: useRt && rt ? rt.quoteTime : quoteTime,
      navDate,
      navTime: navItem?.j ? String(navItem.j) : null,
      isIntraday: useRt && rt ? rt.isIntraday : isIntraday,
      marketStatusLabel: useRt && rt ? rt.marketStatusLabel : marketStatusLabel,
      fetchedAt: taipeiNow.formattedFull,
    });
  }

  for (const code of uniqueCodes) {
    if (!byCode.has(code)) {
      const rt = cnyesMap.get(code);
      if (rt) {
        const navItem = navMap.get(code);
        const estNav = parseNum(navItem?.f);
        const prevNav = parseNum(navItem?.h);
        const navDateRaw = String(navItem?.i || '');
        const navDate =
          navDateRaw.length === 8
            ? `${navDateRaw.slice(0, 4)}-${navDateRaw.slice(4, 6)}-${navDateRaw.slice(6, 8)}`
            : null;
        byCode.set(code, {
          ...rt,
          name: cleanEtfName(rt.name || String(navItem?.b || code)),
          estimatedNav: estNav,
          prevNav,
          premiumDiscountPct:
            estNav && estNav > 0
              ? Number((((rt.price - estNav) / estNav) * 100).toFixed(2))
              : parseNum(navItem?.g),
          issuedUnits: parseNum(navItem?.c),
          unitDiff: parseNum(navItem?.d),
          navDate,
          navTime: navItem?.j ? String(navItem.j) : null,
        });
      }
    }
  }

  return uniqueCodes.map((c) => byCode.get(c)).filter((x): x is EtfQuote => Boolean(x));
}

async function fetchYahooChart(code: string, preferredExchange: 'tse' | 'otc') {
  const suffixes = preferredExchange === 'otc' ? ['.TWO', '.TW'] : ['.TW', '.TWO'];
  for (const suffix of suffixes) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code + suffix)}?range=5y&interval=1d&events=div`;
      const res = await fetchWithTimeout(url, 9000);
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      const result = data?.chart?.result?.[0];
      if (!result || !Array.isArray(result.timestamp) || result.timestamp.length === 0) continue;
      return result;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchTwseEtfDiv(code: string): Promise<{
  rows: Array<{ exDate: string; payDate: string | null; amount: number }>;
  prospectusRule: string | null;
  parsedParValue: number | null;
}> {
  try {
    const url = `https://www.twse.com.tw/rwd/zh/ETF/etfDiv?stkNo=${encodeURIComponent(code)}&response=json`;
    const res = await fetchWithTimeout(url, 8000);
    if (!res.ok) return { rows: [], prospectusRule: null, parsedParValue: null };
    const json = (await res.json()) as { status?: string; data?: string[][] };
    if (!Array.isArray(json.data) || json.data.length === 0) {
      return { rows: [], prospectusRule: null, parsedParValue: null };
    }
    const rows: Array<{ exDate: string; payDate: string | null; amount: number }> = [];
    let prospectusRule: string | null = null;
    let parsedParValue: number | null = null;

    for (const r of json.data) {
      const exDate = parseRocDateToIso(String(r[2] || ''));
      const payDate = parseRocDateToIso(String(r[4] || ''));
      const amount = parseNum(r[5]);
      if (!prospectusRule && r[6]) {
        prospectusRule = String(r[6]).trim();
        const m = prospectusRule.match(/發行價格為新[臺台]幣\s*([0-9.]+)\s*元|發行價格為\s*([0-9.]+)\s*元/);
        if (m) {
          parsedParValue = parseNum(m[1] || m[2]);
        }
      }
      if (exDate && amount !== null && amount > 0) {
        rows.push({ exDate, payDate, amount });
      }
    }
    return { rows, prospectusRule, parsedParValue };
  } catch {
    return { rows: [], prospectusRule: null, parsedParValue: null };
  }
}

async function fetchMoneyDjBasic(code: string) {
  const [b4Html, b5Html, b6Html, b7Html, b7aHtml, stockCodeMap] = await Promise.all([
    fetchWithTimeout(`https://www.moneydj.com/ETF/X/Basic/Basic0004.xdjhtm?etfid=${code}.TW`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    fetchWithTimeout(`https://www.moneydj.com/ETF/X/Basic/Basic0005.xdjhtm?etfid=${code}.TW`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    fetchWithTimeout(`https://www.moneydj.com/ETF/X/Basic/Basic0006.xdjhtm?etfid=${code}.TW`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    fetchWithTimeout(`https://www.moneydj.com/ETF/X/Basic/Basic0007.xdjhtm?etfid=${code}.TW`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    fetchWithTimeout(`https://www.moneydj.com/ETF/X/Basic/Basic0007A.xdjhtm?etfid=${code}.TW`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    getTaiwanStockCodeMap(),
  ]);

  let dividendFrequency: string | null = null;
  let expenseRatioPct: number | null = null;
  let managerName: string | null = null;
  let scaleMillionTwd: number | null = null;

  if (b4Html) {
    const b4Text = stripTags(b4Html);
    const freqM = b4Text.match(/配息頻率\s+([^\s]+)/);
    if (freqM) dividendFrequency = freqM[1];
    const expM = b4Text.match(/總管理費用\(%\)\s+([0-9.]+)/) || b4Text.match(/經理費\(%\)\s+([0-9.]+)/);
    if (expM) expenseRatioPct = parseNum(expM[1]);
    const mgrM = b4Text.match(/經理人\s+([^\s]+)/);
    if (mgrM) managerName = mgrM[1];
    const scaleM = b4Text.match(/ETF規模\s+([0-9,.]+)\s*\(百萬台幣\)/);
    if (scaleM) scaleMillionTwd = parseNum(scaleM[1]);
  }

  const mdjDivs: Array<{ exDate: string; payDate: string | null; amount: number; annualizedRate: number | null }> = [];
  if (b5Html) {
    const tableMatch = b5Html.match(/<table[\s\S]*?除息日[\s\S]*?<\/table>/i);
    if (tableMatch) {
      const trs = tableMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      for (const tr of trs) {
        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
        if (tds.length >= 6) {
          const exDate = tds[0].replace(/\//g, '-');
          const payDate = tds[3] && /\d{4}\/\d{2}\/\d{2}/.test(tds[3]) ? tds[3].replace(/\//g, '-') : null;
          const amount = parseNum(tds[5]);
          const annualizedRate = tds[6] ? parseNum(tds[6]) : null;
          if (/^\d{4}-\d{2}-\d{2}$/.test(exDate) && amount !== null && amount > 0) {
            mdjDivs.push({ exDate, payDate, amount, annualizedRate });
          }
        }
      }
    }
  }

  let splitFactor = 1;
  if (b6Html) {
    const splitMatches = [...b6Html.matchAll(/一股分為([一二三四五六七八九十\d]+)股|\(1:(\d+)\)/g)];
    for (const sm of splitMatches) {
      const factor = parseNum(sm[2]);
      if (factor && factor > 1) splitFactor *= factor;
    }
  }

  const tickerByName = new Map<string, string>();
  const fallbackHoldings: HoldingItem[] = [];
  if (b7Html) {
    const tableMatch = b7Html.match(/<table[^>]*id="[^"]*stable3"[\s\S]*?<\/table>/i) || b7Html.match(/<table[\s\S]*?持有股數[\s\S]*?<\/table>/i);
    if (tableMatch) {
      const trs = tableMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      let rank = 1;
      for (const tr of trs) {
        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
        if (tds.length >= 3) {
          const rawLabel = tds[0];
          const codeM = rawLabel.match(/\(([0-9A-Za-z]+)\.TW[O]?\)/);
          const cleanName = rawLabel.replace(/\([^)]+\)/g, '').trim();
          const stockCode = (codeM ? codeM[1] : null) ?? resolveConstituentCode(cleanName, tickerByName, stockCodeMap);
          const weightPct = parseNum(tds[1]) ?? 0;
          const sharesRaw = parseNum(tds[2]);
          if (cleanName && stockCode) {
            tickerByName.set(cleanName, stockCode);
            tickerByName.set(normalizeStockName(cleanName), stockCode);
          }
          if (cleanName && weightPct > 0) {
            fallbackHoldings.push({
              rank: rank++,
              code: stockCode,
              name: cleanName,
              sharesThousand: sharesRaw !== null ? Number((sharesRaw / 1000).toFixed(2)) : null,
              weightPct,
              changePct: null,
            });
          }
        }
      }
    }
  }

  const b7HoldingsDate = parseMoneyDjSectionDate(b7Html, 'sdate3');
  const b7SectorsDate = parseMoneyDjSectionDate(b7Html, 'sdate2');
  const b7aHoldingsDate = parseMoneyDjSectionDate(b7aHtml, 'sdate3');
  const b7aSectorsDate = parseMoneyDjSectionDate(b7aHtml, 'sdate2');

  let sectorsDate: string | null = null;
  const sectors: SectorItem[] = [];
  const items: HoldingItem[] = [];

  if (b7aHtml) {
    const sectorTable = b7aHtml.match(/<table[^>]*id="[^"]*stable2"[\s\S]*?<\/table>/i);
    if (sectorTable) {
      const trs = sectorTable[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      let idx = 0;
      for (const tr of trs) {
        if (!tr.includes('<td')) continue;
        const colorM = tr.match(/background-color:\s*(#[0-9A-Fa-f]{3,6})/);
        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
        if (tds.length >= 4) {
          const sector = tds[1];
          const amountTenThousand = parseNum(tds[2]) ?? 0;
          const weightPct = parseNum(tds[3]) ?? 0;
          if (sector && weightPct > 0) {
            sectors.push({
              sector,
              amountTenThousand,
              weightPct,
              color: SECTOR_PALETTE[idx % SECTOR_PALETTE.length] || colorM?.[1] || '#64748B',
            });
            idx++;
          }
        }
      }
      if (sectors.length > 0) sectorsDate = b7aSectorsDate;
    }

    const repeaterMatches = [
      ...(b7aHtml.match(/<table[^>]*id="Repeater1"[\s\S]*?<\/table>/gi) || []),
      ...(b7aHtml.match(/<table[^>]*id="Repeater2"[\s\S]*?<\/table>/gi) || []),
    ];

    let rank = 1;
    for (const rTable of repeaterMatches) {
      const trs = rTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      for (const tr of trs) {
        if (!tr.includes('<td')) continue;
        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
        if (tds.length >= 3) {
          const name = tds[0];
          const sharesThousand = parseNum(tds[1]);
          const weightPct = parseNum(tds[2]);
          const changePct = tds[3] ? parseNum(tds[3]) : null;
          if (name && weightPct !== null && weightPct > 0) {
            items.push({
              rank: rank++,
              code: resolveConstituentCode(name, tickerByName, stockCodeMap),
              name,
              sharesThousand,
              weightPct,
              changePct,
            });
          }
        }
      }
    }
  }

  if (sectors.length === 0 && b7Html) {
    const sectorTable = b7Html.match(/<table[^>]*id="[^"]*stable2"[\s\S]*?<\/table>/i);
    if (sectorTable) {
      const trs = sectorTable[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      let idx = 0;
      for (const tr of trs) {
        if (!tr.includes('<td')) continue;
        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
        if (tds.length >= 4) {
          const sector = tds[1];
          const amountTenThousand = parseNum(tds[2]) ?? 0;
          const weightPct = parseNum(tds[3]) ?? 0;
          if (sector && weightPct > 0) {
            sectors.push({
              sector,
              amountTenThousand,
              weightPct,
              color: SECTOR_PALETTE[idx % SECTOR_PALETTE.length],
            });
            idx++;
          }
        }
      }
      if (sectors.length > 0) sectorsDate = b7SectorsDate;
    }
  }

  const finalHoldings = items.length > 0 ? items : fallbackHoldings;
  finalHoldings.sort((a, b) => b.weightPct - a.weightPct);
  finalHoldings.forEach((h, i) => {
    h.rank = i + 1;
  });

  const holdingsDate = items.length > 0
    ? (b7aHoldingsDate || b7HoldingsDate)
    : (b7HoldingsDate || b7aHoldingsDate);

  return {
    dividendFrequency,
    expenseRatioPct,
    managerName,
    scaleMillionTwd,
    mdjDivs,
    splitFactor,
    holdingsDate,
    sectorsDate: sectorsDate || holdingsDate,
    sectors: sectors.sort((a, b) => b.weightPct - a.weightPct),
    items: finalHoldings,
  };
}

function buildPriceAndMovingAverages(
  yahooResult: any,
  quote: EtfQuote
): PricePoint[] {
  const rawPoints: Array<{ date: string; close: number; isIntraday: boolean }> = [];
  const timestamps: number[] = yahooResult?.timestamp || [];
  const closes: Array<number | null> = yahooResult?.indicators?.quote?.[0]?.close || [];

  const dedupByDate = new Map<string, number>();
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c === null || c === undefined || !Number.isFinite(c) || c <= 0) continue;
    const dateStr = formatDateTaipeiFromUnix(timestamps[i]);
    dedupByDate.set(dateStr, Number(c.toFixed(2)));
  }

  for (const [date, close] of dedupByDate.entries()) {
    rawPoints.push({ date, close, isIntraday: false });
  }
  rawPoints.sort((a, b) => a.date.localeCompare(b.date));

  if (quote.price > 0) {
    const last = rawPoints[rawPoints.length - 1];
    if (!last || quote.quoteDate > last.date) {
      rawPoints.push({
        date: quote.quoteDate,
        close: Number(quote.price.toFixed(2)),
        isIntraday: quote.isIntraday,
      });
    } else if (quote.quoteDate === last.date && quote.isIntraday) {
      last.close = Number(quote.price.toFixed(2));
      last.isIntraday = true;
    }
  }

  const result: PricePoint[] = [];
  let sum120 = 0;
  let sum240 = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const val = rawPoints[i].close;
    sum120 += val;
    sum240 += val;
    if (i >= 120) sum120 -= rawPoints[i - 120].close;
    if (i >= 240) sum240 -= rawPoints[i - 240].close;

    result.push({
      date: rawPoints[i].date,
      close: val,
      ma120: i >= 119 ? Number((sum120 / 120).toFixed(2)) : null,
      ma240: i >= 239 ? Number((sum240 / 240).toFixed(2)) : null,
      isIntraday: rawPoints[i].isIntraday,
    });
  }

  return result;
}

function addOneYearMinusOneDay(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y - 1, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function buildDividendAndYieldAnalytics(
  yahooResult: any,
  twseDivRows: Array<{ exDate: string; payDate: string | null; amount: number }>,
  mdjDivs: Array<{ exDate: string; payDate: string | null; amount: number; annualizedRate: number | null }>,
  priceSeries: PricePoint[]
) {
  const periodMap = new Map<string, DividendPeriod>();
  const taipeiToday = getTaipeiNowParts().dateStr;

  const mdjByMonth = new Map<string, typeof mdjDivs[number]>();
  for (const m of mdjDivs) {
    mdjByMonth.set(m.exDate.slice(0, 7), m);
  }

  const yahooDivsObj = yahooResult?.events?.dividends || {};
  const yahooDivList = Object.values(yahooDivsObj) as Array<{ amount: number; date: number }>;
  for (const d of yahooDivList) {
    if (!d?.date || !d?.amount || d.amount <= 0) continue;
    const exDate = formatDateTaipeiFromUnix(d.date);
    const mdjMatch = mdjByMonth.get(exDate.slice(0, 7));
    periodMap.set(exDate, {
      exDate,
      payDate: mdjMatch?.payDate ?? null,
      amount: Number(d.amount.toFixed(4)),
      annualizedRate: mdjMatch?.annualizedRate ?? null,
      isUpcoming: exDate > taipeiToday,
      source: 'yahoo',
    });
  }

  for (const t of twseDivRows) {
    const existingSameMonth = Array.from(periodMap.values()).find(
      (p) => p.exDate.slice(0, 7) === t.exDate.slice(0, 7)
    );
    if (!existingSameMonth) {
      periodMap.set(t.exDate, {
        exDate: t.exDate,
        payDate: t.payDate,
        amount: Number(t.amount.toFixed(4)),
        annualizedRate: null,
        isUpcoming: t.exDate > taipeiToday,
        source: 'twse',
      });
    } else if (!existingSameMonth.payDate && t.payDate) {
      existingSameMonth.payDate = t.payDate;
    }
  }

  if (periodMap.size === 0) {
    for (const m of mdjDivs) {
      periodMap.set(m.exDate, {
        exDate: m.exDate,
        payDate: m.payDate,
        amount: m.amount,
        annualizedRate: m.annualizedRate,
        isUpcoming: m.exDate > taipeiToday,
        source: 'moneydj',
      });
    }
  }

  const periods = Array.from(periodMap.values()).sort((a, b) => a.exDate.localeCompare(b.exDate));
  const realizedPeriods = periods.filter((p) => p.exDate <= taipeiToday);

  const monthLastPoint = new Map<string, PricePoint>();
  for (const pt of priceSeries) {
    monthLastPoint.set(pt.date.slice(0, 7), pt);
  }
  const monthEnds = Array.from(monthLastPoint.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const firstPriceDate = priceSeries[0]?.date || taipeiToday;

  const rolling12mYield: RollingYieldPoint[] = [];
  for (const [month, pt] of monthEnds) {
    const windowStart = addOneYearMinusOneDay(pt.date);
    if (windowStart < firstPriceDate && realizedPeriods.length > 0 && pt.date.slice(0, 4) === firstPriceDate.slice(0, 4)) {
      continue;
    }
    const trailing12mDividend = realizedPeriods
      .filter((d) => d.exDate >= windowStart && d.exDate <= pt.date)
      .reduce((acc, cur) => acc + cur.amount, 0);

    if (pt.close > 0 && trailing12mDividend > 0) {
      rolling12mYield.push({
        month,
        lastTradingDate: pt.date,
        lastPrice: pt.close,
        trailing12mDividend: Number(trailing12mDividend.toFixed(4)),
        yieldPct: Number(((trailing12mDividend / pt.close) * 100).toFixed(2)),
        isIntraday: pt.isIntraday,
      });
    }
  }

  const yearLastPoint = new Map<string, PricePoint>();
  for (const pt of priceSeries) {
    yearLastPoint.set(pt.date.slice(0, 4), pt);
  }
  const annual12mYield: AnnualYieldPoint[] = [];
  const currentYear = taipeiToday.slice(0, 4);
  for (const [year, pt] of Array.from(yearLastPoint.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const yearDivSum = realizedPeriods
      .filter((d) => d.exDate.startsWith(year))
      .reduce((acc, cur) => acc + cur.amount, 0);
    if (pt.close > 0 && yearDivSum > 0) {
      annual12mYield.push({
        year,
        lastTradingDate: pt.date,
        lastPrice: pt.close,
        total12mDividend: Number(yearDivSum.toFixed(4)),
        yieldPct: Number(((yearDivSum / pt.close) * 100).toFixed(2)),
        isPartialYear: year === currentYear,
      });
    }
  }

  const latestPoint = priceSeries[priceSeries.length - 1];
  const latestTtmWindowStart = latestPoint ? addOneYearMinusOneDay(latestPoint.date) : addOneYearMinusOneDay(taipeiToday);
  const latestTtmDividend = Number(
    realizedPeriods
      .filter((d) => d.exDate >= latestTtmWindowStart && d.exDate <= (latestPoint?.date || taipeiToday))
      .reduce((acc, cur) => acc + cur.amount, 0)
      .toFixed(4)
  );
  const latestTtmYieldPct =
    latestPoint && latestPoint.close > 0 && latestTtmDividend > 0
      ? Number(((latestTtmDividend / latestPoint.close) * 100).toFixed(2))
      : null;

  return {
    periods,
    rolling12mYield,
    annual12mYield,
    latestTtmDividend,
    latestTtmYieldPct,
  };
}

export async function getEtfDetail(
  rawCode: string,
  forceRefresh = false,
  preloadedQuote?: EtfQuote
): Promise<EtfDetailResponse | null> {
  const code = rawCode.trim().toUpperCase();
  const now = Date.now();
  const cached = detailCache.get(code);

  if (!forceRefresh && cached && cached.expiresAt > now) {
    const [freshQuote] = preloadedQuote ? [preloadedQuote] : await fetchTwseQuotes([code], false);
    if (freshQuote) {
      const updatedSeries = [...cached.value.priceSeries];
      const last = updatedSeries[updatedSeries.length - 1];
      if (last && freshQuote.price > 0) {
        if (freshQuote.quoteDate > last.date) {
          updatedSeries.push({
            date: freshQuote.quoteDate,
            close: Number(freshQuote.price.toFixed(2)),
            ma120: last.ma120,
            ma240: last.ma240,
            isIntraday: freshQuote.isIntraday,
          });
        } else if (freshQuote.quoteDate === last.date && freshQuote.isIntraday) {
          updatedSeries[updatedSeries.length - 1] = {
            ...last,
            close: Number(freshQuote.price.toFixed(2)),
            isIntraday: true,
          };
        }
      }
      const latestTtmDividend = cached.value.dividends.latestTtmDividend;
      const latestTtmYieldPct =
        freshQuote.price > 0 && latestTtmDividend > 0
          ? Number(((latestTtmDividend / freshQuote.price) * 100).toFixed(2))
          : cached.value.dividends.latestTtmYieldPct;
      return {
        ...cached.value,
        quote: freshQuote,
        priceSeries: updatedSeries,
        dividends: {
          ...cached.value.dividends,
          latestTtmYieldPct,
        },
      };
    }
    return cached.value;
  }

  const [quotes, twseDiv, mdj] = await Promise.all([
    preloadedQuote ? Promise.resolve([preloadedQuote]) : fetchTwseQuotes([code], forceRefresh),
    fetchTwseEtfDiv(code),
    fetchMoneyDjBasic(code),
  ]);

  const quote = quotes[0];
  if (!quote) return null;

  const yahooResult = await fetchYahooChart(code, quote.exchange);
  const priceSeries = buildPriceAndMovingAverages(yahooResult, quote);
  const dividends = buildDividendAndYieldAnalytics(yahooResult, twseDiv.rows, mdj.mdjDivs, priceSeries);

  let parValue: number | null = null;
  let parValueSource = '未揭露發行面額';
  const knownFallback = OFFICIAL_PAR_VALUE_FALLBACK[code];

  if (twseDiv.parsedParValue !== null) {
    parValue = Number((twseDiv.parsedParValue / (mdj.splitFactor || 1)).toFixed(3));
    parValueSource =
      mdj.splitFactor > 1
        ? `TWSE 公開說明書載明 ${twseDiv.parsedParValue} 元（經 1:${mdj.splitFactor} 分割調整為 ${parValue} 元）`
        : `TWSE 公開說明書載明每單位發行價格 ${parValue} 元`;
  } else if (knownFallback) {
    parValue = knownFallback.par;
    parValueSource = knownFallback.note;
  }

  const currentNav = quote.estimatedNav ?? quote.prevNav ?? null;
  const distributableBufferPerUnit =
    currentNav !== null && parValue !== null ? Number(Math.max(0, currentNav - parValue).toFixed(4)) : null;

  const totalDistributablePoolTwd =
    distributableBufferPerUnit !== null && quote.issuedUnits !== null
      ? Math.round(distributableBufferPerUnit * quote.issuedUnits)
      : null;

  const totalFundScaleTwd =
    currentNav !== null && quote.issuedUnits !== null
      ? Math.round(currentNav * quote.issuedUnits)
      : mdj.scaleMillionTwd !== null
        ? Math.round(mdj.scaleMillionTwd * 1_000_000)
        : null;

  const estimatedCoverageYears =
    distributableBufferPerUnit !== null && dividends.latestTtmDividend > 0
      ? Number((distributableBufferPerUnit / dividends.latestTtmDividend).toFixed(1))
      : null;

  const taipeiToday = getTaipeiNowParts().dateStr;
  const pendingRow = twseDiv.rows.find((r) => r.exDate >= taipeiToday);

  const distributable: DistributableInfo = {
    currentNav,
    prevNav: quote.prevNav,
    parValue,
    parValueSource,
    distributableBufferPerUnit,
    issuedUnits: quote.issuedUnits,
    totalDistributablePoolTwd,
    totalFundScaleTwd,
    trailing12mDividend: dividends.latestTtmDividend,
    estimatedCoverageYears,
    dividendFrequency: mdj.dividendFrequency,
    expenseRatioPct: mdj.expenseRatioPct,
    managerName: mdj.managerName,
    pendingAnnouncement: pendingRow
      ? {
          exDate: pendingRow.exDate,
          payDate: pendingRow.payDate || '待公告',
          amount: pendingRow.amount,
        }
      : null,
    prospectusRule: twseDiv.prospectusRule,
    navDate: quote.navDate,
    navTime: quote.navTime,
  };

  const detail: EtfDetailResponse = {
    quote,
    priceSeries,
    dividends,
    distributable,
    holdings: {
      dataDate: mdj.holdingsDate,
      sectorsDate: mdj.sectorsDate,
      sectors: mdj.sectors,
      items: mdj.items,
    },
  };

  detailCache.set(code, { value: detail, expiresAt: now + 5 * 60_000 });
  return detail;
}

async function fetchHoldingsSnapshot(rawCode: string, forceRefresh = false): Promise<EtfHoldingsSnapshot> {
  const code = rawCode.trim().toUpperCase();
  const now = Date.now();

  if (!forceRefresh) {
    const cachedDetail = detailCache.get(code);
    if (cachedDetail && cachedDetail.expiresAt > now) {
      return {
        code,
        name: cachedDetail.value.quote.name,
        dataDate: cachedDetail.value.holdings.dataDate,
        items: cachedDetail.value.holdings.items,
      };
    }
    const cachedSnap = holdingsSnapshotCache.get(code);
    if (cachedSnap && cachedSnap.expiresAt > now) {
      return cachedSnap.value;
    }
  }

  const [navMap, b7Html, b7aHtml, stockCodeMap] = await Promise.all([
    getAllEtfNavMap(forceRefresh),
    fetchWithTimeout(`https://www.moneydj.com/ETF/X/Basic/Basic0007.xdjhtm?etfid=${code}.TW`)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
    fetchWithTimeout(`https://www.moneydj.com/ETF/X/Basic/Basic0007A.xdjhtm?etfid=${code}.TW`)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
    getTaiwanStockCodeMap(),
  ]);

  const tickerByName = new Map<string, string>();
  const fallbackHoldings: HoldingItem[] = [];
  if (b7Html) {
    const tableMatch =
      b7Html.match(/<table[^>]*id="[^"]*stable3"[\s\S]*?<\/table>/i) ||
      b7Html.match(/<table[\s\S]*?持有股數[\s\S]*?<\/table>/i);
    if (tableMatch) {
      const trs = tableMatch[0].match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      let rank = 1;
      for (const tr of trs) {
        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
        if (tds.length >= 3) {
          const rawLabel = tds[0];
          const codeM = rawLabel.match(/\(([0-9A-Za-z]+)\.TW[O]?\)/);
          const cleanName = rawLabel.replace(/\([^)]+\)/g, '').trim();
          const stockCode = (codeM ? codeM[1] : null) ?? resolveConstituentCode(cleanName, tickerByName, stockCodeMap);
          const weightPct = parseNum(tds[1]) ?? 0;
          const sharesRaw = parseNum(tds[2]);
          if (cleanName && stockCode) {
            tickerByName.set(cleanName, stockCode);
            tickerByName.set(normalizeStockName(cleanName), stockCode);
          }
          if (cleanName && weightPct > 0) {
            fallbackHoldings.push({
              rank: rank++,
              code: stockCode,
              name: cleanName,
              sharesThousand: sharesRaw !== null ? Number((sharesRaw / 1000).toFixed(2)) : null,
              weightPct,
              changePct: null,
            });
          }
        }
      }
    }
  }

  const b7HoldingsDate = parseMoneyDjSectionDate(b7Html, 'sdate3');
  const b7aHoldingsDate = parseMoneyDjSectionDate(b7aHtml, 'sdate3');
  const items: HoldingItem[] = [];
  if (b7aHtml) {
    const repeaterMatches = [
      ...(b7aHtml.match(/<table[^>]*id="Repeater1"[\s\S]*?<\/table>/gi) || []),
      ...(b7aHtml.match(/<table[^>]*id="Repeater2"[\s\S]*?<\/table>/gi) || []),
    ];

    let rank = 1;
    for (const rTable of repeaterMatches) {
      const trs = rTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
      for (const tr of trs) {
        if (!tr.includes('<td')) continue;
        const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1]));
        if (tds.length >= 3) {
          const name = tds[0];
          const sharesThousand = parseNum(tds[1]);
          const weightPct = parseNum(tds[2]);
          const changePct = tds[3] ? parseNum(tds[3]) : null;
          if (name && weightPct !== null && weightPct > 0) {
            items.push({
              rank: rank++,
              code: resolveConstituentCode(name, tickerByName, stockCodeMap),
              name,
              sharesThousand,
              weightPct,
              changePct,
            });
          }
        }
      }
    }
  }

  const finalItems = items.length > 0 ? items : fallbackHoldings;
  finalItems.sort((a, b) => b.weightPct - a.weightPct);
  finalItems.forEach((h, i) => {
    h.rank = i + 1;
  });

  const dataDate = items.length > 0
    ? (b7aHoldingsDate || b7HoldingsDate)
    : (b7HoldingsDate || b7aHoldingsDate);

  const navItem = navMap.get(code);
  const snapshot: EtfHoldingsSnapshot = {
    code,
    name: cleanEtfName(String(navItem?.b || code)),
    dataDate,
    items: finalItems,
  };

  holdingsSnapshotCache.set(code, { value: snapshot, expiresAt: now + 10 * 60_000 });
  return snapshot;
}

export async function getWatchlistDividendSummaries(
  codes: string[],
  forceRefresh = false,
  preloadedQuotes?: Map<string, EtfQuote>
): Promise<WatchlistDividendSummaryResponse> {
  const uniqueCodes = Array.from(
    new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  );
  const fetchedAt = getTaipeiNowParts().formattedFull;
  if (uniqueCodes.length === 0) {
    return { items: [], fetchedAt };
  }

  const quoteByCode = new Map<string, EtfQuote>(preloadedQuotes);
  const missingQuotes = uniqueCodes.filter((c) => !quoteByCode.has(c));
  if (missingQuotes.length > 0) {
    const fetchedQuotes = await fetchTwseQuotes(missingQuotes, forceRefresh);
    for (const q of fetchedQuotes) {
      quoteByCode.set(q.code, q);
    }
  }

  const today = getTaipeiNowParts().dateStr;
  const ttmWindowStart = addOneYearMinusOneDay(today);
  const items: EtfDividendSummaryItem[] = [];
  const concurrency = 5;

  for (let i = 0; i < uniqueCodes.length; i += concurrency) {
    const batch = uniqueCodes.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (code): Promise<EtfDividendSummaryItem | null> => {
        const q = quoteByCode.get(code);
        try {
          const detail = await getEtfDetail(code, forceRefresh, q);
          if (!detail) return null;
          const payoutCount12m = detail.dividends.periods.filter(
            (p) => p.exDate >= ttmWindowStart && p.exDate <= today && p.amount > 0
          ).length;
          return {
            code: detail.quote.code,
            name: detail.quote.name,
            exchange: detail.quote.exchange,
            price: detail.quote.price,
            quoteDate: detail.quote.quoteDate,
            quoteTime: detail.quote.quoteTime,
            isIntraday: detail.quote.isIntraday,
            marketStatusLabel: detail.quote.marketStatusLabel,
            trailing12mDividend: detail.dividends.latestTtmDividend,
            latestTtmYieldPct: detail.dividends.latestTtmYieldPct,
            dividendFrequency: detail.distributable.dividendFrequency,
            payoutCount12m,
            hasData: true,
          };
        } catch {
          if (!q) return null;
          return {
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
          };
        }
      })
    );
    for (const r of batchResults) {
      if (r) items.push(r);
    }
  }

  return { items, fetchedAt };
}

export async function compareHoldings(codes: string[], forceRefresh = false): Promise<HoldingsCompareResponse> {
  const uniqueCodes = Array.from(new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))).slice(0, 8);
  const etfs = await Promise.all(uniqueCodes.map((c) => fetchHoldingsSnapshot(c, forceRefresh)));
  return computeHoldingsCompare(etfs, uniqueCodes);
}
