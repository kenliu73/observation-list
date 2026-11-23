import { RotateCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EtfQuote, HoldingItem, SectorItem } from '../types/etf';
import { fetchConstituentQuotes } from '../utils/api';

interface HoldingsSectionProps {
  code: string;
  dataDate: string | null;
  sectorsDate?: string | null;
  sectors: SectorItem[];
  items: HoldingItem[];
  refreshNonce?: number;
}

const TW_CODE_REGEX = /^(?:\d{4,6}[A-Z]?|00\d{2,4}[A-Z]?)$/;

export function HoldingsSection({
  code,
  dataDate,
  sectorsDate,
  sectors,
  items,
  refreshNonce = 0,
}: HoldingsSectionProps) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [constituentQuotes, setConstituentQuotes] = useState<Record<string, EtfQuote>>({});
  const [quotesFetchedAt, setQuotesFetchedAt] = useState('');
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [quoteError, setQuoteError] = useState(false);

  const constituentCodes = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((h) => h.code?.trim().toUpperCase())
            .filter((c): c is string => Boolean(c && TW_CODE_REGEX.test(c)))
        )
      ),
    [items]
  );

  const codesKey = constituentCodes.join(',');

  const loadQuotes = useCallback(
    async (forceRefresh = false) => {
      if (!codesKey) {
        setConstituentQuotes({});
        setQuotesFetchedAt('');
        setQuoteError(false);
        return;
      }
      const targetCodes = codesKey.split(',');
      setIsLoadingQuotes(true);
      setQuoteError(false);
      try {
        const res = await fetchConstituentQuotes(targetCodes, forceRefresh);
        setConstituentQuotes(res.quotes);
        if (res.fetchedAt) setQuotesFetchedAt(res.fetchedAt);
      } catch {
        setQuoteError(true);
      } finally {
        setIsLoadingQuotes(false);
      }
    },
    [codesKey]
  );

  useEffect(() => {
    setConstituentQuotes({});
    setQuotesFetchedAt('');
  }, [code, codesKey]);

  useEffect(() => {
    loadQuotes(refreshNonce > 0);
  }, [code, loadQuotes, refreshNonce]);

  useEffect(() => {
    if (!codesKey) return;
    const timer = setInterval(() => {
      loadQuotes(false);
    }, 60_000);
    return () => clearInterval(timer);
  }, [codesKey, loadQuotes]);

  const quoteSummary = useMemo(() => {
    for (const c of constituentCodes) {
      const q = constituentQuotes[c];
      if (q) return q;
    }
    return null;
  }, [constituentCodes, constituentQuotes]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        (h.code && h.code.toLowerCase().includes(q))
    );
  }, [items, searchTerm]);

  const totalSectorPct = useMemo(
    () => sectors.reduce((acc, s) => acc + s.weightPct, 0),
    [sectors]
  );

  const pieSegments = useMemo(() => {
    const radius = 78;
    const circumference = 2 * Math.PI * radius;
    const denom = totalSectorPct > 0 ? totalSectorPct : 100;
    let cumulative = 0;

    return sectors.map((sec) => {
      const fraction = sec.weightPct / denom;
      const strokeLength = fraction * circumference;
      const offset = -cumulative * circumference;
      cumulative += fraction;
      return {
        ...sec,
        radius,
        circumference,
        strokeLength,
        offset,
      };
    });
  }, [sectors, totalSectorPct]);

  const activeSectorObj = useMemo(
    () => sectors.find((s) => s.sector === hoveredSector) || sectors[0] || null,
    [sectors, hoveredSector]
  );

  const effectiveSectorsDate = sectorsDate || dataDate;

  return (
    <section
      id="section-holdings"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 scroll-mt-20 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            成分股持倉明細與產業分佈圓餅圖
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            依投信最新申報權重比例排序 · 共揭露 {items.length} 檔主要成分股
            {dataDate ? ` · 持倉基準日 ${dataDate}` : ''}
            {effectiveSectorsDate && effectiveSectorsDate !== dataDate
              ? ` · 產業基準日 ${effectiveSectorsDate}`
              : ''}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-4 border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/30 dark:bg-slate-950/30">
          <div className="flex items-baseline justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              各產業分佈圓餅圖
            </h3>
            {effectiveSectorsDate && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                基準日 {effectiveSectorsDate}
              </span>
            )}
          </div>

          {sectors.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              此 ETF（如債券型或期貨型 ETF）未提供股票產業分類明細
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row xl:flex-col items-center gap-6">
              <div className="relative w-[200px] h-[200px] shrink-0">
                <svg
                  width={200}
                  height={200}
                  viewBox="0 0 200 200"
                  className="-rotate-90"
                  role="img"
                  aria-label={`${code} 產業分佈圓餅圖`}
                >
                  <circle
                    cx={100}
                    cy={100}
                    r={78}
                    fill="none"
                    className="stroke-slate-100 dark:stroke-slate-800"
                    strokeWidth={28}
                  />
                  {pieSegments.map((seg) => {
                    const isHovered = hoveredSector === seg.sector;
                    return (
                      <circle
                        key={seg.sector}
                        cx={100}
                        cy={100}
                        r={seg.radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={isHovered ? 34 : 28}
                        strokeDasharray={`${seg.strokeLength} ${seg.circumference}`}
                        strokeDashoffset={seg.offset}
                        className="transition-all duration-150 cursor-pointer"
                        onMouseEnter={() => setHoveredSector(seg.sector)}
                        onMouseLeave={() => setHoveredSector(null)}
                      />
                    );
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[110px]">
                    {activeSectorObj?.sector || '產業分佈'}
                  </span>
                  <span className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                    {activeSectorObj ? `${activeSectorObj.weightPct.toFixed(2)}%` : '100%'}
                  </span>
                </div>
              </div>

              <div className="flex-1 w-full space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                {sectors.map((sec) => {
                  const isActive = hoveredSector === sec.sector;
                  return (
                    <div
                      key={sec.sector}
                      onMouseEnter={() => setHoveredSector(sec.sector)}
                      onMouseLeave={() => setHoveredSector(null)}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-slate-100 dark:bg-slate-800'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: sec.color }}
                        />
                        <span className="text-slate-700 dark:text-slate-300 truncate">
                          {sec.sector}
                        </span>
                      </div>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 shrink-0 tabular-nums">
                        {sec.weightPct.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-8 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                成分股權重持倉明細
              </h3>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed tabular-nums">
                {dataDate
                  ? `持倉與權重資料日期：${dataDate}（MoneyDJ／投信最新公開申報明細，非盤中即時變動權重）`
                  : '持倉與權重資料：依 MoneyDJ／投信最新公開申報明細（網頁未標註明確基準日，非盤中即時變動權重）'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed tabular-nums">
                {constituentCodes.length === 0
                  ? '此 ETF 成分資產非台股掛牌標的，不提供台股即時報價'
                  : isLoadingQuotes && !quoteSummary
                    ? `正在載入 ${constituentCodes.length} 檔成分股即時報價…`
                    : quoteSummary
                      ? `成分股現價基準：${quoteSummary.marketStatusLabel}（${quoteSummary.quoteDate} ${quoteSummary.quoteTime}）· 更新時間 ${quotesFetchedAt || quoteSummary.fetchedAt} · 盤中每 60 秒自動更新`
                      : quoteError
                        ? '成分股即時報價暫時無法取得，請稍後點擊重新整理'
                        : `已對應 ${constituentCodes.length} 檔台股代號，等待載入報價`}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative w-full sm:w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="篩選成分股名稱或代號"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
              {constituentCodes.length > 0 && (
                <button
                  type="button"
                  onClick={() => loadQuotes(true)}
                  disabled={isLoadingQuotes}
                  title="重新抓取成分股即時報價"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isLoadingQuotes ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">更新報價</span>
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[460px] overflow-auto">
            <table className="w-full text-xs min-w-[660px]">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 text-left font-medium w-11">順位</th>
                  <th className="py-2.5 px-3 text-left font-medium">成分股名稱</th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">即時報價</th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">漲跌 / 幅度</th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">持有股數 (千股)</th>
                  <th className="py-2.5 px-3 text-right font-medium w-32 whitespace-nowrap">權重比例</th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">期間增減</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500 dark:text-slate-400">
                      {items.length === 0
                        ? '目前查無成分股明細（部分海外或債券型 ETF 僅揭露前十大或未揭露）'
                        : '查無符合篩選條件的成分股'}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((h) => {
                    const cleanCode = h.code?.trim().toUpperCase() || '';
                    const stockQuote = cleanCode ? constituentQuotes[cleanCode] : undefined;
                    const isStockUp = (stockQuote?.change ?? 0) > 0;
                    const isStockDown = (stockQuote?.change ?? 0) < 0;
                    const sign = isStockUp ? '+' : '';

                    return (
                      <tr
                        key={`${h.rank}-${h.name}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {h.rank}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                          <span>{h.name}</span>
                          {h.code && (
                            <span className="font-mono text-slate-500 dark:text-slate-400 ml-1.5">
                              {h.code}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-right font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {stockQuote ? (
                            stockQuote.price.toLocaleString('zh-TW', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          ) : cleanCode && TW_CODE_REGEX.test(cleanCode) && isLoadingQuotes ? (
                            <span className="inline-block w-14 h-3.5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse align-middle" />
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 font-normal">—</span>
                          )}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-mono tabular-nums text-right whitespace-nowrap ${
                            !stockQuote
                              ? 'text-slate-400 dark:text-slate-500'
                              : isStockUp
                                ? 'text-red-600 dark:text-red-400'
                                : isStockDown
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {stockQuote ? (
                            <div className="leading-tight">
                              <span className="font-semibold block">
                                {sign}
                                {stockQuote.changePct.toFixed(2)}%
                              </span>
                              <span className="text-[11px] opacity-85 block">
                                {sign}
                                {stockQuote.change.toFixed(2)}
                              </span>
                            </div>
                          ) : cleanCode && TW_CODE_REGEX.test(cleanCode) && isLoadingQuotes ? (
                            <span className="inline-block w-12 h-3.5 bg-slate-100 dark:bg-slate-800 rounded animate-pulse align-middle" />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-right text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {h.sharesThousand !== null
                            ? h.sharesThousand.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2 w-full">
                            <div className="w-14 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                                style={{ width: `${Math.min(100, h.weightPct)}%` }}
                              />
                            </div>
                            <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 w-12 text-right">
                              {h.weightPct.toFixed(2)}%
                            </span>
                          </div>
                        </td>
                        <td
                          className={`py-2.5 px-3 font-mono tabular-nums text-right whitespace-nowrap ${
                            (h.changePct ?? 0) > 0
                              ? 'text-red-600 dark:text-red-400'
                              : (h.changePct ?? 0) < 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {h.changePct !== null
                            ? `${h.changePct > 0 ? '+' : ''}${h.changePct.toFixed(2)}%`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
