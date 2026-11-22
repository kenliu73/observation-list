import { ArrowUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { EtfDividendSummaryItem, EtfQuote } from '../types/etf';
import { fetchWatchlistDividendSummaries } from '../utils/api';

interface WatchlistIncomeGoalSectionProps {
  watchlist: string[];
  selectedCode: string;
  quotesMap: Record<string, EtfQuote>;
  onSelectCode: (code: string) => void;
  refreshNonce: number;
}

type LotMode = 'ceil' | 'exact';
type SortKey = 'watchlist' | 'yield' | 'cost10k' | 'ttmDiv';

interface ComputedGoal {
  lotsText: string;
  amountTwd: number;
  amountWanText: string;
}

function formatWan(twd: number): string {
  const wan = twd / 10_000;
  if (wan >= 1000) {
    return `約 ${wan.toLocaleString('zh-TW', { maximumFractionDigits: 0 })} 萬`;
  }
  return `約 ${wan.toLocaleString('zh-TW', { maximumFractionDigits: 1 })} 萬`;
}

function computeMonthlyTarget(
  monthlyTwd: number,
  trailing12mDividend: number,
  price: number,
  lotMode: LotMode
): ComputedGoal | null {
  if (trailing12mDividend <= 0 || price <= 0) return null;
  const annualTarget = monthlyTwd * 12;
  const exactLots = annualTarget / (trailing12mDividend * 1000);
  if (!Number.isFinite(exactLots) || exactLots <= 0) return null;

  if (lotMode === 'ceil') {
    const lots = Math.ceil(exactLots);
    const amountTwd = Math.round(lots * 1000 * price);
    return {
      lotsText: `${lots.toLocaleString('zh-TW')} 張`,
      amountTwd,
      amountWanText: formatWan(amountTwd),
    };
  }

  const amountTwd = Math.round((annualTarget / trailing12mDividend) * price);
  return {
    lotsText: `${exactLots.toLocaleString('zh-TW', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} 張`,
    amountTwd,
    amountWanText: formatWan(amountTwd),
  };
}

export function WatchlistIncomeGoalSection({
  watchlist,
  selectedCode,
  quotesMap,
  onSelectCode,
  refreshNonce,
}: WatchlistIncomeGoalSectionProps) {
  const [summaries, setSummaries] = useState<EtfDividendSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lotMode, setLotMode] = useState<LotMode>('ceil');
  const [sortKey, setSortKey] = useState<SortKey>('watchlist');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    if (watchlist.length === 0) {
      setSummaries([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMsg(null);

    fetchWatchlistDividendSummaries(watchlist, refreshNonce > 0)
      .then((res) => {
        if (!cancelled) {
          setSummaries(res.items);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg((err as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [watchlist, refreshNonce]);

  const rows = useMemo(() => {
    const summaryByCode = new Map(summaries.map((s) => [s.code, s]));
    const watchlistIdx = new Map(watchlist.map((c, idx) => [c, idx]));

    const merged = watchlist
      .map((code) => {
        const s = summaryByCode.get(code);
        const liveQ = quotesMap[code];
        const price = liveQ?.price ?? s?.price ?? 0;
        const ttmDiv = s?.trailing12mDividend ?? 0;
        const yieldPct =
          price > 0 && ttmDiv > 0
            ? Number(((ttmDiv / price) * 100).toFixed(2))
            : s?.latestTtmYieldPct ?? null;

        const goal10k = computeMonthlyTarget(10_000, ttmDiv, price, lotMode);
        const goal20k = computeMonthlyTarget(20_000, ttmDiv, price, lotMode);
        const goal30k = computeMonthlyTarget(30_000, ttmDiv, price, lotMode);

        return {
          code,
          name: liveQ?.name || s?.name || code,
          price,
          isIntraday: liveQ?.isIntraday ?? s?.isIntraday ?? false,
          marketStatusLabel: liveQ?.marketStatusLabel || s?.marketStatusLabel || '',
          quoteDate: liveQ?.quoteDate || s?.quoteDate || '',
          ttmDiv,
          yieldPct,
          dividendFrequency: s?.dividendFrequency ?? null,
          payoutCount12m: s?.payoutCount12m ?? 0,
          hasData: s?.hasData ?? false,
          goal10k,
          goal20k,
          goal30k,
          orderIdx: watchlistIdx.get(code) ?? 999,
        };
      })
      .filter((r) => r.price > 0 || r.hasData || !isLoading);

    return [...merged].sort((a, b) => {
      if (sortKey === 'watchlist') {
        return a.orderIdx - b.orderIdx;
      }
      if (sortKey === 'yield') {
        const va = a.yieldPct ?? -1;
        const vb = b.yieldPct ?? -1;
        return sortAsc ? va - vb : vb - va;
      }
      if (sortKey === 'ttmDiv') {
        return sortAsc ? a.ttmDiv - b.ttmDiv : b.ttmDiv - a.ttmDiv;
      }
      const ca = a.goal10k?.amountTwd ?? Number.POSITIVE_INFINITY;
      const cb = b.goal10k?.amountTwd ?? Number.POSITIVE_INFINITY;
      return sortAsc ? ca - cb : cb - ca;
    });
  }, [watchlist, summaries, quotesMap, lotMode, sortKey, sortAsc, isLoading]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (key !== 'watchlist') setSortAsc((v) => !v);
      return;
    }
    setSortKey(key);
    setSortAsc(key === 'cost10k' || key === 'watchlist');
  };

  return (
    <section
      id="section-income-goal"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 scroll-mt-20 transition-colors"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            觀察清單月領 1 萬 / 2 萬 / 3 萬張數與投入金額試算
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            依各檔 ETF 近 12 個月累計配息換算月均領息，並以最新成交價（盤中即時報價或當日收盤價）計算所需張數與投入本金
          </p>
        </div>

        <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setLotMode('ceil')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              lotMode === 'ceil'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            整張計算（進位）
          </button>
          <button
            type="button"
            onClick={() => setLotMode('exact')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              lotMode === 'exact'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            精確試算（含零股）
          </button>
        </div>
      </div>

      {errorMsg ? (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      ) : isLoading && summaries.length === 0 ? (
        <div className="mt-4 space-y-2 animate-pulse">
          {watchlist.map((c) => (
            <div
              key={c}
              className="h-12 bg-slate-100 dark:bg-slate-800/70 rounded-lg"
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 text-left font-medium min-w-[140px]">
                    <button
                      type="button"
                      onClick={() => handleSort('watchlist')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap"
                    >
                      <span>觀察 ETF</span>
                      {sortKey !== 'watchlist' && <ArrowUpDown className="w-3 h-3 opacity-60" />}
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">
                    最新報價
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('ttmDiv')}
                      className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <span>近 12M 配息</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('yield')}
                      className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <span>年殖利率</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap min-w-[132px]">
                    <button
                      type="button"
                      onClick={() => handleSort('cost10k')}
                      className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <span>月領 1 萬元</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap min-w-[132px]">
                    月領 2 萬元
                  </th>
                  <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap min-w-[132px]">
                    月領 3 萬元
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-10 text-center text-slate-500 dark:text-slate-400"
                    >
                      尚未載入觀察清單 ETF 配息資料
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isActive = row.code === selectedCode;
                    return (
                      <tr
                        key={row.code}
                        onClick={() => onSelectCode(row.code)}
                        className={`cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-blue-50/70 dark:bg-blue-950/35'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-baseline gap-2">
                            <span
                              className={`font-mono font-semibold text-sm ${
                                isActive
                                  ? 'text-blue-700 dark:text-blue-400'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {row.code}
                            </span>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {row.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {row.dividendFrequency || (row.payoutCount12m > 0 ? `近12月配息 ${row.payoutCount12m} 次` : '未揭露頻率')}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {row.price > 0 ? row.price.toFixed(2) : '—'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                            {row.marketStatusLabel || row.quoteDate || '—'}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="font-mono font-semibold text-teal-700 dark:text-teal-400">
                            {row.ttmDiv > 0 ? `${row.ttmDiv.toFixed(2)} 元` : '無配息'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                            {row.ttmDiv > 0
                              ? `月均 ${((row.ttmDiv * 1000) / 12).toLocaleString('zh-TW', {
                                  maximumFractionDigits: 0,
                                })} 元/張`
                              : '—'}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {row.yieldPct !== null ? `${row.yieldPct.toFixed(2)}%` : '—'}
                        </td>

                        {[row.goal10k, row.goal20k, row.goal30k].map((goal, idx) => (
                          <td key={idx} className="py-3 px-3 text-right whitespace-nowrap">
                            {goal ? (
                              <>
                                <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                                  {goal.lotsText}
                                </div>
                                <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                                  {goal.amountTwd.toLocaleString('zh-TW')} 元
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                  {goal.amountWanText}
                                </div>
                              </>
                            ) : (
                              <span className="font-mono text-slate-400 dark:text-slate-500">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        試算公式：所需張數 ＝（目標月領金額 × 12 個月）÷（近 12 個月每股累計配息 × 1,000 股）；對應投入金額 ＝ 試算張數 × 1,000 股 × 最新成交價（未含手續費、證交稅及二代健保補充保費，亦不代表未來保證配息金額）。點擊任一列可切換上方個股詳細圖表。
      </p>
    </section>
  );
}
