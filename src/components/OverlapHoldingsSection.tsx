import { ArrowUpDown, Check, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { EtfQuote, HoldingsCompareResponse } from '../types/etf';
import { fetchHoldingsCompare } from '../utils/api';

interface OverlapHoldingsSectionProps {
  watchlist: string[];
  selectedCode: string;
  quotesMap: Record<string, EtfQuote>;
  refreshNonce: number;
}

type FilterMode = 'shared' | 'all_match' | 'union';

export function OverlapHoldingsSection({
  watchlist,
  selectedCode,
  quotesMap,
  refreshNonce,
}: OverlapHoldingsSectionProps) {
  const [compareCodes, setCompareCodes] = useState<string[]>(() =>
    watchlist.slice(0, 5)
  );
  const [data, setData] = useState<HoldingsCompareResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('shared');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('heldByCount');
  const [sortDesc, setSortDesc] = useState(true);

  // Keep compareCodes valid relative to watchlist & always include selectedCode when watchlist changes
  useEffect(() => {
    setCompareCodes((prev) => {
      const valid = prev.filter((c) => watchlist.includes(c));
      if (valid.length >= 2) {
        if (!valid.includes(selectedCode) && watchlist.includes(selectedCode)) {
          return [selectedCode, ...valid.slice(0, 4)];
        }
        return valid;
      }
      return watchlist.slice(0, Math.min(5, watchlist.length));
    });
  }, [watchlist, selectedCode]);

  const [skippedCodes, setSkippedCodes] = useState<string[]>([]);

  useEffect(() => {
    if (compareCodes.length < 2) {
      setData(null);
      setSkippedCodes([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setErrorMsg(null);

    fetchHoldingsCompare(compareCodes, refreshNonce > 0)
      .then((result) => {
        if (!cancelled) {
          setData(result.data);
          setSkippedCodes(result.skippedCodes);
        }
      })
      .catch((err) => {
        if (!cancelled) setErrorMsg((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [compareCodes, refreshNonce]);

  const toggleCompareCode = (code: string) => {
    setCompareCodes((prev) => {
      if (prev.includes(code)) {
        if (prev.length <= 2) return prev;
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= 6) return prev;
      return [...prev, code];
    });
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDesc((v) => !v);
    } else {
      setSortBy(col);
      setSortDesc(true);
    }
  };

  const filteredRows = useMemo(() => {
    if (!data) return [];
    const q = searchTerm.trim().toLowerCase();
    const totalEtfs = data.etfs.length;

    const filtered = data.rows.filter((row) => {
      if (filterMode === 'shared' && row.heldByCount < 2) return false;
      if (filterMode === 'all_match' && row.heldByCount < totalEtfs) return false;
      if (q) {
        const matchName = row.name.toLowerCase().includes(q);
        const matchCode = row.code ? row.code.toLowerCase().includes(q) : false;
        if (!matchName && !matchCode) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      let va = 0;
      let vb = 0;
      if (sortBy === 'heldByCount') {
        va = a.heldByCount;
        vb = b.heldByCount;
        if (va === vb) {
          va = a.avgWeightPct;
          vb = b.avgWeightPct;
        }
      } else if (sortBy === 'avgWeightPct') {
        va = a.avgWeightPct;
        vb = b.avgWeightPct;
      } else {
        va = a.weightsByEtf[sortBy] ?? -1;
        vb = b.weightsByEtf[sortBy] ?? -1;
      }
      return sortDesc ? vb - va : va - vb;
    });
  }, [data, filterMode, searchTerm, sortBy, sortDesc]);

  const stats = useMemo(() => {
    if (!data) return { totalUnion: 0, sharedCount: 0, allMatchCount: 0 };
    const totalEtfs = data.etfs.length;
    return {
      totalUnion: data.rows.length,
      sharedCount: data.rows.filter((r) => r.heldByCount >= 2).length,
      allMatchCount: data.rows.filter((r) => r.heldByCount >= totalEtfs).length,
    };
  }, [data]);

  const focusedPairwise = useMemo(() => {
    if (!data) return [];
    const hasSelected = data.etfs.some((e) => e.code === selectedCode);
    if (!hasSelected) return data.pairwise;
    return data.pairwise.filter((p) => p.codeA === selectedCode || p.codeB === selectedCode);
  }, [data, selectedCode]);

  return (
    <section
      id="section-overlap"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 scroll-mt-20 transition-colors"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            跨 ETF 相同持股對比與權重分析
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            勾選 2 至 6 檔觀察清單中的 ETF，即時比對重複持有的成分股、各檔權重佔比與投資組合重疊度
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {watchlist.map((code) => {
            const active = compareCodes.includes(code);
            const name = quotesMap[code]?.name;
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleCompareCode(code)}
                title={name || code}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-blue-700 dark:bg-blue-600 text-white border-blue-700 dark:border-blue-600'
                    : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                <span className="font-mono">{code}</span>
                {name && (
                  <span className="hidden sm:inline opacity-85 truncate max-w-[84px]">
                    {name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {watchlist.length < 2 ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          請在左側觀察清單至少加入 2 檔 ETF 以進行相同持股與權重對比
        </div>
      ) : errorMsg ? (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-lg text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      ) : isLoading && !data ? (
        <div className="mt-5 space-y-3 animate-pulse">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg" />
            <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg" />
            <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg" />
          </div>
          <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-lg" />
        </div>
      ) : data ? (
        <>
          {/* Summary Stats + Pairwise Overlap */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                共同重複持股數（≥ 2 檔持有）
              </span>
              <span className="font-mono text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1 block">
                {stats.sharedCount} 檔
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                總聯集成分股共 {stats.totalUnion} 檔
              </span>
            </div>

            <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                全部所選 ETF 皆持有
              </span>
              <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">
                {stats.allMatchCount} 檔
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
                同時出現在 {data.etfs.length} 檔 ETF 持倉中
              </span>
            </div>

            <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                與 {selectedCode} 權重重疊度（Σ min 權重）
              </span>
              <div className="mt-1.5 space-y-1 max-h-14 overflow-y-auto pr-1">
                {focusedPairwise.length === 0 ? (
                  <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
                ) : (
                  focusedPairwise.map((p) => {
                    const other = p.codeA === selectedCode ? p.codeB : p.codeA;
                    return (
                      <div
                        key={`${p.codeA}-${p.codeB}`}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          vs {other} ({p.sharedCount} 檔)
                        </span>
                        <span className="font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {p.overlapWeightPct.toFixed(2)}%
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start">
              <button
                type="button"
                onClick={() => setFilterMode('shared')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filterMode === 'shared'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                共同持股 ({stats.sharedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('all_match')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filterMode === 'all_match'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                全部皆持有 ({stats.allMatchCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('union')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  filterMode === 'union'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                全部聯集 ({stats.totalUnion})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜尋相同成分股名稱或代號"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {/* Overlap Matrix Table */}
          <div className="mt-3 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="max-h-[460px] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3 text-left font-medium min-w-[140px]">成分股</th>
                    <th className="py-2.5 px-3 text-center font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('heldByCount')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        <span>重疊檔數</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    {data.etfs.map((etf) => (
                      <th
                        key={etf.code}
                        className="py-2.5 px-3 text-right font-medium whitespace-nowrap min-w-[104px]"
                      >
                        <button
                          type="button"
                          onClick={() => handleSort(etf.code)}
                          className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                        >
                          <span className="font-mono font-semibold">{etf.code}</span>
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                    ))}
                    <th className="py-2.5 px-3 text-right font-medium whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleSort('avgWeightPct')}
                        className="inline-flex items-center justify-end gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        <span>平均權重</span>
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={data.etfs.length + 3}
                        className="py-10 text-center text-slate-500 dark:text-slate-400"
                      >
                        {filterMode === 'all_match'
                          ? '所選 ETF 目前沒有同時全部重疊的成分股，可切換至「共同持股」檢視兩兩重疊標的'
                          : '查無符合條件的相同持股資料'}
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={row.key}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          <span>{row.name}</span>
                          {row.code && (
                            <span className="font-mono text-slate-500 dark:text-slate-400 ml-1.5">
                              {row.code}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          <span
                            className={`font-semibold ${
                              row.heldByCount === data.etfs.length
                                ? 'text-blue-700 dark:text-blue-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {row.heldByCount} / {data.etfs.length}
                          </span>
                        </td>
                        {data.etfs.map((etf) => {
                          const w = row.weightsByEtf[etf.code];
                          return (
                            <td key={etf.code} className="py-2.5 px-3 text-right">
                              {w !== null && w !== undefined ? (
                                <div className="inline-flex items-center justify-end gap-2 w-full">
                                  <div className="w-10 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden hidden md:block">
                                    <div
                                      className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                                      style={{ width: `${Math.min(100, (w / Math.max(10, row.maxWeightPct)) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                                    {w.toFixed(2)}%
                                  </span>
                                </div>
                              ) : (
                                <span className="font-mono text-slate-300 dark:text-slate-600">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 font-mono text-right text-slate-600 dark:text-slate-300">
                          {row.avgWeightPct.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            各 ETF 持股申報基準日：
            {data.etfs
              .map((e) => `${e.code} (${e.dataDate || '最新申報'})`)
              .join(' · ')}
            {skippedCodes.length > 0
              ? `（未收錄完整持股快照：${skippedCodes.join('、')}）`
              : ''}
          </p>
        </>
      ) : null}
    </section>
  );
}
