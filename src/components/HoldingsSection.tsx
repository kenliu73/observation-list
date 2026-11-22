import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { HoldingItem, SectorItem } from '../types/etf';

interface HoldingsSectionProps {
  code: string;
  dataDate: string | null;
  sectors: SectorItem[];
  items: HoldingItem[];
}

export function HoldingsSection({ code, dataDate, sectors, items }: HoldingsSectionProps) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            依最新申報權重比例排序 · 共揭露 {items.length} 檔主要成分股
            {dataDate ? ` · 持股基準日 ${dataDate}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/30 dark:bg-slate-950/30">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
            各產業分佈圓餅圖
          </h3>

          {sectors.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              此 ETF（如債券型或期貨型 ETF）未提供股票產業分類明細
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-6">
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
                  <span className="font-mono text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
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
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                        {sec.weightPct.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              成分股權重持倉明細
            </h3>
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="篩選成分股名稱或代號"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 text-left font-medium w-12">順位</th>
                  <th className="py-2.5 px-3 text-left font-medium">成分股名稱</th>
                  <th className="py-2.5 px-3 text-right font-medium">持有股數 (千股)</th>
                  <th className="py-2.5 px-3 text-right font-medium w-36">權重比例</th>
                  <th className="py-2.5 px-3 text-right font-medium">期間增減</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500 dark:text-slate-400">
                      {items.length === 0
                        ? '目前查無成分股明細（部分海外或債券型 ETF 僅揭露前十大或未揭露）'
                        : '查無符合篩選條件的成分股'}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((h) => (
                    <tr key={`${h.rank}-${h.name}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">
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
                      <td className="py-2.5 px-3 font-mono text-right text-slate-700 dark:text-slate-300">
                        {h.sharesThousand !== null
                          ? h.sharesThousand.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center justify-end gap-2 w-full">
                          <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-blue-600 dark:bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(100, h.weightPct)}%` }}
                            />
                          </div>
                          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 w-12 text-right">
                            {h.weightPct.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-3 font-mono text-right ${
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
