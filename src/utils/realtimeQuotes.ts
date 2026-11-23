import type { EtfQuote } from '../types/etf';

function getTaipeiPartsFromDate(date: Date): {
  dateStr: string;
  timeStr: string;
  hhmm: number;
  isWeekday: boolean;
  formattedFull: string;
} {
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
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
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

function toFiniteNum(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val.replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function fetchRealtimeCnyesQuotes(
  codes: string[],
  timeoutMs = 7000
): Promise<Map<string, EtfQuote>> {
  const uniqueCodes = Array.from(
    new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  );
  const result = new Map<string, EtfQuote>();
  if (uniqueCodes.length === 0) return result;

  const chunkSize = 25;
  const nowParts = getTaipeiPartsFromDate(new Date());
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    chunks.push(uniqueCodes.slice(i, i + chunkSize));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const symbols = chunk.map((c) => `TWS:${c}:STOCK`).join(',');
      const url = `https://ws.api.cnyes.com/ws/api/v1/quote/quotes/${encodeURIComponent(symbols)}?_=${Date.now()}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
        const rows = Array.isArray(json?.data) ? json.data : [];

        for (const d of rows) {
          const code = String(d['200010'] || '').trim().toUpperCase();
          if (!code) continue;

          const price = toFiniteNum(d['6']);
          const prevClose = toFiniteNum(d['21']) ?? 0;
          if ((price === null || price <= 0) && prevClose <= 0) continue;

          const finalPrice = price !== null && price > 0 ? price : prevClose;
          const rawChange = toFiniteNum(d['11']);
          const change =
            rawChange !== null
              ? Number(rawChange.toFixed(4))
              : prevClose > 0
                ? Number((finalPrice - prevClose).toFixed(4))
                : 0;
          const rawPct = toFiniteNum(d['56']);
          const changePct =
            rawPct !== null
              ? Number(rawPct.toFixed(2))
              : prevClose > 0
                ? Number(((change / prevClose) * 100).toFixed(2))
                : 0;

          const tsUnix = toFiniteNum(d['200007']);
          const quoteParts = tsUnix
            ? getTaipeiPartsFromDate(new Date(tsUnix * 1000))
            : nowParts;

          const isToday = quoteParts.dateStr === nowParts.dateStr;
          const isIntraday =
            isToday && nowParts.isWeekday && nowParts.hhmm >= 900 && nowParts.hhmm < 1330;
          const marketStatusLabel = isIntraday
            ? '盤中即時報價'
            : isToday && nowParts.hhmm >= 1330
              ? '當日已收盤'
              : '最近交易日收盤';

          const volLots =
            toFiniteNum(d['200013']) ?? toFiniteNum(d['800001']) ?? 0;

          result.set(code, {
            code,
            name: String(d['200009'] || code).trim(),
            exchange: 'tse',
            price: finalPrice,
            prevClose,
            open: toFiniteNum(d['19']),
            high: toFiniteNum(d['12']),
            low: toFiniteNum(d['13']),
            change,
            changePct,
            volumeLots: Math.round(volLots),
            estimatedNav: null,
            prevNav: null,
            premiumDiscountPct: null,
            issuedUnits: null,
            unitDiff: null,
            quoteDate: quoteParts.dateStr,
            quoteTime: quoteParts.timeStr,
            navDate: null,
            navTime: null,
            isIntraday,
            marketStatusLabel,
            fetchedAt: nowParts.formattedFull,
          });
        }
      } catch {
        // Ignore transient network errors and let caller fallback to TWSE / snapshot
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return result;
}
