import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnnualYieldPoint, DividendPeriod, RollingYieldPoint } from '../types/etf';

interface DividendYieldSectionProps {
  code: string;
  periods: DividendPeriod[];
  rolling12mYield: RollingYieldPoint[];
  annual12mYield: AnnualYieldPoint[];
  latestTtmDividend: number;
  latestTtmYieldPct: number | null;
}

type YieldMode = 'rolling' | 'annual';

export function DividendYieldSection({
  code,
  periods,
  rolling12mYield,
  annual12mYield,
  latestTtmDividend,
  latestTtmYieldPct,
}: DividendYieldSectionProps) {
  const [yieldMode, setYieldMode] = useState<YieldMode>('rolling');
  const [hoverPeriodIdx, setHoverPeriodIdx] = useState<number | null>(null);
  const [hoverYieldIdx, setHoverYieldIdx] = useState<number | null>(null);

  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const [leftW, setLeftW] = useState(420);
  const [rightW, setRightW] = useState(420);

  useEffect(() => {
    const observe = (el: HTMLDivElement | null, setter: (w: number) => void) => {
      if (!el) return () => {};
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          if (e.contentRect.width > 0) setter(Math.floor(e.contentRect.width));
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    };
    const c1 = observe(leftRef.current, setLeftW);
    const c2 = observe(rightRef.current, setRightW);
    return () => {
      c1();
      c2();
    };
  }, []);

  const chartH = 240;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 30;

  const periodMax = useMemo(() => {
    const maxVal = periods.reduce((m, p) => Math.max(m, p.amount), 0);
    return maxVal > 0 ? maxVal * 1.15 : 1;
  }, [periods]);

  const activePeriod =
    hoverPeriodIdx !== null && periods[hoverPeriodIdx]
      ? periods[hoverPeriodIdx]
      : periods[periods.length - 1] || null;

  const yieldPoints = useMemo(() => {
    if (yieldMode === 'rolling') {
      return rolling12mYield.map((r) => ({
        label: r.month,
        date: r.lastTradingDate,
        price: r.lastPrice,
        dividend12m: r.trailing12mDividend,
        yieldPct: r.yieldPct,
        note: r.isIntraday ? '盤中即時價計算' : '月底收盤價計算',
      }));
    }
    return annual12mYield.map((a) => ({
      label: a.year,
      date: a.lastTradingDate,
      price: a.lastPrice,
      dividend12m: a.total12mDividend,
      yieldPct: a.yieldPct,
      note: a.isPartialYear ? '年度累計至今' : '年度最後交易日收盤價',
    }));
  }, [yieldMode, rolling12mYield, annual12mYield]);

  const yieldMax = useMemo(() => {
    const maxVal = yieldPoints.reduce((m, y) => Math.max(m, y.yieldPct), 0);
    return maxVal > 0 ? maxVal * 1.15 : 10;
  }, [yieldPoints]);

  const activeYield =
    hoverYieldIdx !== null && yieldPoints[hoverYieldIdx]
      ? yieldPoints[hoverYieldIdx]
      : yieldPoints[yieldPoints.length - 1] || null;

  const recentPeriodsDesc = useMemo(() => [...periods].reverse().slice(0, 12), [periods]);

  return (
    <section
      id="section-dividend"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 scroll-mt-20 transition-colors"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            歷年各期配息與 12 個月累計年度殖利率
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            依近 12 個月累計配息 ÷ 該 12 個月區間最後一日股價計算年度股息殖利率
          </p>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400">近 12 個月累計配息：</span>
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
              {latestTtmDividend.toFixed(2)} 元
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400">最新年度殖利率：</span>
            <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400">
              {latestTtmYieldPct !== null ? `${latestTtmYieldPct.toFixed(2)}%` : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/30 dark:bg-slate-950/30">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              歷年各期配息金額曲線圖
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              共 {periods.length} 期紀錄
            </span>
          </div>

          {activePeriod ? (
            <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
              <span>
                除息日：<strong className="font-mono text-slate-900 dark:text-slate-100">{activePeriod.exDate}</strong>
              </span>
              <span>
                配息金額：
                <strong className="font-mono text-teal-700 dark:text-teal-400">
                  {activePeriod.amount.toFixed(2)} 元
                </strong>
              </span>
              {activePeriod.payDate && (
                <span>
                  發放日：<strong className="font-mono text-slate-900 dark:text-slate-100">{activePeriod.payDate}</strong>
                </span>
              )}
            </div>
          ) : (
            <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">尚無配息紀錄</div>
          )}

          <div ref={leftRef} className="w-full overflow-hidden">
            {periods.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                此 ETF 尚無歷史配息資料
              </div>
            ) : (
              <svg
                width={leftW}
                height={chartH}
                viewBox={`0 0 ${leftW} ${chartH}`}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const plotW = Math.max(100, leftW - padL - padR);
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - padL) / plotW));
                  setHoverPeriodIdx(Math.round(ratio * (periods.length - 1)));
                }}
                onMouseLeave={() => setHoverPeriodIdx(null)}
                className="block select-none cursor-crosshair"
              >
                {(() => {
                  const plotW = Math.max(100, leftW - padL - padR);
                  const plotH = chartH - padT - padB;
                  const toX = (i: number) =>
                    periods.length <= 1 ? padL + plotW / 2 : padL + (i / (periods.length - 1)) * plotW;
                  const toY = (v: number) => padT + ((periodMax - v) / periodMax) * plotH;
                  const pathD = periods
                    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.amount).toFixed(1)}`)
                    .join(' ');
                  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => periodMax * r);
                  const labelStep = Math.max(1, Math.floor(periods.length / 4));

                  return (
                    <>
                      {ticks.map((t, i) => (
                        <g key={i}>
                          <line
                            x1={padL}
                            y1={toY(t)}
                            x2={padL + plotW}
                            y2={toY(t)}
                            className="stroke-slate-200 dark:stroke-slate-800"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={padL - 6}
                            y={toY(t) + 4}
                            textAnchor="end"
                            className="fill-slate-500 dark:fill-slate-400 font-mono text-[11px]"
                          >
                            {t.toFixed(2)}
                          </text>
                        </g>
                      ))}

                      <path d={pathD} fill="none" className="stroke-teal-600 dark:stroke-teal-400" strokeWidth={2} />

                      {periods.map((p, i) => {
                        const showLabel = i === 0 || i === periods.length - 1 || i % labelStep === 0;
                        return (
                          <g key={p.exDate}>
                            <circle
                              cx={toX(i)}
                              cy={toY(p.amount)}
                              r={hoverPeriodIdx === i ? 5 : 3}
                              className="fill-teal-600 dark:fill-teal-400 stroke-white dark:stroke-slate-900"
                              strokeWidth={1.5}
                            />
                            {showLabel && (
                              <text
                                x={toX(i)}
                                y={chartH - 8}
                                textAnchor="middle"
                                className="fill-slate-500 dark:fill-slate-400 font-mono text-[10px]"
                              >
                                {p.exDate.slice(2, 7)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            )}
          </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/30 dark:bg-slate-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              12 個月累計年度殖利率曲線圖
            </h3>
            <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setYieldMode('rolling')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  yieldMode === 'rolling'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                滾動 12 個月
              </button>
              <button
                type="button"
                onClick={() => setYieldMode('annual')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  yieldMode === 'annual'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                歷年年度結算
              </button>
            </div>
          </div>

          {activeYield ? (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
              <span>
                基準日：<strong className="font-mono text-slate-900 dark:text-slate-100">{activeYield.date}</strong>
              </span>
              <span>
                12M 累計股息：
                <strong className="font-mono text-slate-900 dark:text-slate-100">
                  {activeYield.dividend12m.toFixed(2)} 元
                </strong>
              </span>
              <span>
                末日股價：
                <strong className="font-mono text-slate-900 dark:text-slate-100">
                  {activeYield.price.toFixed(2)} 元
                </strong>
              </span>
              <span>
                年度殖利率：
                <strong className="font-mono text-blue-700 dark:text-blue-400">
                  {activeYield.yieldPct.toFixed(2)}%
                </strong>
              </span>
            </div>
          ) : (
            <div className="mb-3 text-xs text-slate-500 dark:text-slate-400">資料累積未滿 12 個月</div>
          )}

          <div ref={rightRef} className="w-full overflow-hidden">
            {yieldPoints.length === 0 ? (
              <div className="h-[240px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                尚無完整 12 個月區間殖利率資料
              </div>
            ) : (
              <svg
                width={rightW}
                height={chartH}
                viewBox={`0 0 ${rightW} ${chartH}`}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const plotW = Math.max(100, rightW - padL - padR);
                  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left - padL) / plotW));
                  setHoverYieldIdx(Math.round(ratio * (yieldPoints.length - 1)));
                }}
                onMouseLeave={() => setHoverYieldIdx(null)}
                className="block select-none cursor-crosshair"
              >
                <defs>
                  <linearGradient id={`yield-grad-${code}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                {(() => {
                  const plotW = Math.max(100, rightW - padL - padR);
                  const plotH = chartH - padT - padB;
                  const toX = (i: number) =>
                    yieldPoints.length <= 1
                      ? padL + plotW / 2
                      : padL + (i / (yieldPoints.length - 1)) * plotW;
                  const toY = (v: number) => padT + ((yieldMax - v) / yieldMax) * plotH;
                  const pathD = yieldPoints
                    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.yieldPct).toFixed(1)}`)
                    .join(' ');
                  const areaD =
                    yieldPoints.length >= 2
                      ? `${pathD} L${toX(yieldPoints.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
                      : '';
                  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => yieldMax * r);
                  const labelStep = Math.max(1, Math.floor(yieldPoints.length / 4));

                  return (
                    <>
                      {ticks.map((t, i) => (
                        <g key={i}>
                          <line
                            x1={padL}
                            y1={toY(t)}
                            x2={padL + plotW}
                            y2={toY(t)}
                            className="stroke-slate-200 dark:stroke-slate-800"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={padL - 6}
                            y={toY(t) + 4}
                            textAnchor="end"
                            className="fill-slate-500 dark:fill-slate-400 font-mono text-[11px]"
                          >
                            {t.toFixed(1)}%
                          </text>
                        </g>
                      ))}

                      {areaD && <path d={areaD} fill={`url(#yield-grad-${code})`} />}
                      <path
                        d={pathD}
                        fill="none"
                        className="stroke-blue-700 dark:stroke-blue-400"
                        strokeWidth={2}
                      />

                      {yieldPoints.map((pt, i) => {
                        const showLabel =
                          i === 0 || i === yieldPoints.length - 1 || i % labelStep === 0;
                        return (
                          <g key={pt.label}>
                            {(yieldPoints.length <= 18 || hoverYieldIdx === i || i === yieldPoints.length - 1) && (
                              <circle
                                cx={toX(i)}
                                cy={toY(pt.yieldPct)}
                                r={hoverYieldIdx === i ? 5 : 3}
                                className="fill-blue-700 dark:fill-blue-400 stroke-white dark:stroke-slate-900"
                                strokeWidth={1.5}
                              />
                            )}
                            {showLabel && (
                              <text
                                x={toX(i)}
                                y={chartH - 8}
                                textAnchor="middle"
                                className="fill-slate-500 dark:fill-slate-400 font-mono text-[10px]"
                              >
                                {pt.label.length > 4 ? pt.label.slice(2) : pt.label}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            各年度 12 個月累計殖利率計算明細（每年最後交易日股價）
          </h4>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 text-left font-medium">年度</th>
                  <th className="py-2.5 px-3 text-left font-medium">末日日期</th>
                  <th className="py-2.5 px-3 text-right font-medium">12M 累計配息</th>
                  <th className="py-2.5 px-3 text-right font-medium">末日股價</th>
                  <th className="py-2.5 px-3 text-right font-medium">年度殖利率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {annual12mYield.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">
                      尚無年度配息明細
                    </td>
                  </tr>
                ) : (
                  [...annual12mYield].reverse().map((row) => (
                    <tr key={row.year} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {row.year}
                        {row.isPartialYear ? ' (累計)' : ''}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {row.lastTradingDate}
                      </td>
                      <td className="py-2 px-3 font-mono text-right text-slate-900 dark:text-slate-100">
                        {row.total12mDividend.toFixed(2)} 元
                      </td>
                      <td className="py-2 px-3 font-mono text-right text-slate-700 dark:text-slate-300">
                        {row.lastPrice.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 font-mono text-right font-semibold text-blue-700 dark:text-blue-400">
                        {row.yieldPct.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            近期各期除息紀錄（最近 12 期）
          </h4>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 text-left font-medium">除息日</th>
                  <th className="py-2.5 px-3 text-left font-medium">發放日</th>
                  <th className="py-2.5 px-3 text-right font-medium">每單位配息</th>
                  <th className="py-2.5 px-3 text-right font-medium">當期年化率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {recentPeriodsDesc.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 dark:text-slate-400">
                      尚無配息紀錄
                    </td>
                  </tr>
                ) : (
                  recentPeriodsDesc.map((p) => (
                    <tr key={p.exDate} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                        {p.exDate}
                        {p.isUpcoming ? ' (預定)' : ''}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {p.payDate || '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-right font-semibold text-teal-700 dark:text-teal-400">
                        {p.amount.toFixed(2)} 元
                      </td>
                      <td className="py-2 px-3 font-mono text-right text-slate-600 dark:text-slate-400">
                        {p.annualizedRate !== null ? `${p.annualizedRate.toFixed(2)}%` : '—'}
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
