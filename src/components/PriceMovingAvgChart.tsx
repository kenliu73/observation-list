import { useEffect, useMemo, useRef, useState } from 'react';
import type { EtfQuote, PricePoint } from '../types/etf';

interface PriceMovingAvgChartProps {
  quote: EtfQuote;
  priceSeries: PricePoint[];
}

type RangeKey = '3M' | '6M' | '1Y' | '3Y' | '5Y';

const RANGE_DAYS: Record<RangeKey, number> = {
  '3M': 65,
  '6M': 130,
  '1Y': 250,
  '3Y': 750,
  '5Y': 1300,
};

export function PriceMovingAvgChart({ quote, priceSeries }: PriceMovingAvgChartProps) {
  const [range, setRange] = useState<RangeKey>('1Y');
  const [showMa120, setShowMa120] = useState(true);
  const [showMa240, setShowMa240] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(820);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visibleSeries = useMemo(() => {
    const count = RANGE_DAYS[range];
    if (priceSeries.length <= count) return priceSeries;
    return priceSeries.slice(priceSeries.length - count);
  }, [priceSeries, range]);

  const latestPoint = visibleSeries[visibleSeries.length - 1];
  const activePoint = hoverIdx !== null && visibleSeries[hoverIdx] ? visibleSeries[hoverIdx] : latestPoint;

  const height = 340;
  const padLeft = 56;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const plotW = Math.max(200, width - padLeft - padRight);
  const plotH = height - padTop - padBottom;

  const { minY, maxY, yTicks } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const pt of visibleSeries) {
      if (pt.close < min) min = pt.close;
      if (pt.close > max) max = pt.close;
      if (showMa120 && pt.ma120 !== null) {
        if (pt.ma120 < min) min = pt.ma120;
        if (pt.ma120 > max) max = pt.ma120;
      }
      if (showMa240 && pt.ma240 !== null) {
        if (pt.ma240 < min) min = pt.ma240;
        if (pt.ma240 > max) max = pt.ma240;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min = (latestPoint?.close ?? 10) * 0.95;
      max = (latestPoint?.close ?? 10) * 1.05;
    }
    const span = max - min;
    const paddedMin = Math.max(0, min - span * 0.08);
    const paddedMax = max + span * 0.08;
    const ticks: number[] = [];
    const step = (paddedMax - paddedMin) / 4;
    for (let i = 0; i <= 4; i++) {
      ticks.push(paddedMin + step * i);
    }
    return { minY: paddedMin, maxY: paddedMax, yTicks: ticks };
  }, [visibleSeries, showMa120, showMa240, latestPoint]);

  const toX = (i: number) => {
    if (visibleSeries.length <= 1) return padLeft;
    return padLeft + (i / (visibleSeries.length - 1)) * plotW;
  };
  const toY = (val: number) => {
    if (maxY === minY) return padTop + plotH / 2;
    return padTop + ((maxY - val) / (maxY - minY)) * plotH;
  };

  const pricePath = useMemo(() => {
    return visibleSeries
      .map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(pt.close).toFixed(1)}`)
      .join(' ');
  }, [visibleSeries, width, minY, maxY]);

  const priceAreaPath = useMemo(() => {
    if (visibleSeries.length < 2) return '';
    const lastX = toX(visibleSeries.length - 1).toFixed(1);
    const firstX = toX(0).toFixed(1);
    const bottomY = (padTop + plotH).toFixed(1);
    return `${pricePath} L${lastX},${bottomY} L${firstX},${bottomY} Z`;
  }, [pricePath, visibleSeries, width, plotH]);

  const buildMaPath = (key: 'ma120' | 'ma240') => {
    let d = '';
    let started = false;
    for (let i = 0; i < visibleSeries.length; i++) {
      const val = visibleSeries[i][key];
      if (val === null) {
        started = false;
        continue;
      }
      d += `${!started ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(val).toFixed(1)} `;
      started = true;
    }
    return d.trim();
  };

  const ma120Path = useMemo(() => (showMa120 ? buildMaPath('ma120') : ''), [visibleSeries, showMa120, width, minY, maxY]);
  const ma240Path = useMemo(() => (showMa240 ? buildMaPath('ma240') : ''), [visibleSeries, showMa240, width, minY, maxY]);

  const xTicks = useMemo(() => {
    if (visibleSeries.length < 2) return [];
    const indices = [0, Math.floor(visibleSeries.length * 0.25), Math.floor(visibleSeries.length * 0.5), Math.floor(visibleSeries.length * 0.75), visibleSeries.length - 1];
    return Array.from(new Set(indices)).map((idx) => ({
      idx,
      label: visibleSeries[idx].date.slice(2),
    }));
  }, [visibleSeries]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (visibleSeries.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left - padLeft;
    const ratio = Math.max(0, Math.min(1, relX / plotW));
    const idx = Math.round(ratio * (visibleSeries.length - 1));
    setHoverIdx(idx);
  };

  const activeMa120Diff =
    activePoint && activePoint.ma120
      ? ((activePoint.close - activePoint.ma120) / activePoint.ma120) * 100
      : null;
  const activeMa240Diff =
    activePoint && activePoint.ma240
      ? ((activePoint.close - activePoint.ma240) / activePoint.ma240) * 100
      : null;

  return (
    <section
      id="section-price"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 scroll-mt-20 transition-colors"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            股價走勢與年線 / 半年線
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            過去交易日以收盤價繪製 ·{' '}
            {latestPoint?.isIntraday
              ? `今日尚未收盤，末端節點採用 ${quote.quoteTime} 即時報價`
              : `最新收盤日 ${latestPoint?.date || quote.quoteDate}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showMa120}
                onChange={(e) => setShowMa120(e.target.checked)}
                className="accent-amber-600 rounded"
              />
              <span className="w-3 h-0.5 bg-amber-600 dark:bg-amber-400 inline-block" />
              <span className="text-slate-700 dark:text-slate-300 font-medium">半年線 (120MA)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showMa240}
                onChange={(e) => setShowMa240(e.target.checked)}
                className="accent-violet-600 rounded"
              />
              <span className="w-3 h-0.5 bg-violet-600 dark:bg-violet-400 inline-block" />
              <span className="text-slate-700 dark:text-slate-300 font-medium">年線 (240MA)</span>
            </label>
          </div>

          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['3M', '6M', '1Y', '3Y', '5Y'] as RangeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRange(key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  range === key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activePoint && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 pb-3 text-xs">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">
              {activePoint.isIntraday ? '日期（盤中即時）' : '日期（收盤價）'}
            </span>
            <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
              {activePoint.date}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">
              {activePoint.isIntraday ? '當時即時價' : '收盤價'}
            </span>
            <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400 mt-0.5 block">
              {activePoint.close.toFixed(2)} 元
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">半年線 (120MA)</span>
            <span className="font-mono text-sm font-semibold text-amber-700 dark:text-amber-400 mt-0.5 block">
              {activePoint.ma120 !== null ? (
                <>
                  {activePoint.ma120.toFixed(2)}
                  {activeMa120Diff !== null && (
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
                      ({activeMa120Diff >= 0 ? '+' : ''}
                      {activeMa120Diff.toFixed(2)}%)
                    </span>
                  )}
                </>
              ) : (
                '資料累積中'
              )}
            </span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">年線 (240MA)</span>
            <span className="font-mono text-sm font-semibold text-violet-700 dark:text-violet-400 mt-0.5 block">
              {activePoint.ma240 !== null ? (
                <>
                  {activePoint.ma240.toFixed(2)}
                  {activeMa240Diff !== null && (
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
                      ({activeMa240Diff >= 0 ? '+' : ''}
                      {activeMa240Diff.toFixed(2)}%)
                    </span>
                  )}
                </>
              ) : (
                '資料累積中'
              )}
            </span>
          </div>
        </div>
      )}

      <div ref={containerRef} className="w-full overflow-hidden">
        {visibleSeries.length === 0 ? (
          <div className="h-[340px] flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            目前查無歷史股價走勢資料
          </div>
        ) : (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            className="block select-none cursor-crosshair"
            role="img"
            aria-label={`${quote.code} 股價與年線半年線走勢圖`}
          >
            <defs>
              <linearGradient id={`price-grad-${quote.code}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {yTicks.map((tick, i) => {
              const y = toY(tick);
              return (
                <g key={i}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + plotW}
                    y2={y}
                    className="stroke-slate-200 dark:stroke-slate-800"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="fill-slate-500 dark:fill-slate-400 font-mono text-[11px]"
                  >
                    {tick.toFixed(tick >= 100 ? 1 : 2)}
                  </text>
                </g>
              );
            })}

            {xTicks.map((t) => (
              <text
                key={t.idx}
                x={toX(t.idx)}
                y={height - 10}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 font-mono text-[11px]"
              >
                {t.label}
              </text>
            ))}

            {priceAreaPath && (
              <path d={priceAreaPath} fill={`url(#price-grad-${quote.code})`} />
            )}
            <path
              d={pricePath}
              fill="none"
              className="stroke-blue-700 dark:stroke-blue-400"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {ma120Path && (
              <path
                d={ma120Path}
                fill="none"
                className="stroke-amber-600 dark:stroke-amber-400"
                strokeWidth={1.75}
                strokeLinejoin="round"
              />
            )}
            {ma240Path && (
              <path
                d={ma240Path}
                fill="none"
                className="stroke-violet-600 dark:stroke-violet-400"
                strokeWidth={1.75}
                strokeDasharray="5 3"
                strokeLinejoin="round"
              />
            )}

            {latestPoint?.isIntraday && (
              <circle
                cx={toX(visibleSeries.length - 1)}
                cy={toY(latestPoint.close)}
                r={4.5}
                fill="#DC2626"
                className="stroke-white dark:stroke-slate-900"
                strokeWidth={2}
              />
            )}

            {hoverIdx !== null && visibleSeries[hoverIdx] && (
              <g>
                <line
                  x1={toX(hoverIdx)}
                  y1={padTop}
                  x2={toX(hoverIdx)}
                  y2={padTop + plotH}
                  className="stroke-slate-400 dark:stroke-slate-600"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={toX(hoverIdx)}
                  cy={toY(visibleSeries[hoverIdx].close)}
                  r={4}
                  className="fill-blue-700 dark:fill-blue-400 stroke-white dark:stroke-slate-900"
                  strokeWidth={2}
                />
                {showMa120 && visibleSeries[hoverIdx].ma120 !== null && (
                  <circle
                    cx={toX(hoverIdx)}
                    cy={toY(visibleSeries[hoverIdx].ma120!)}
                    r={3.5}
                    className="fill-amber-600 dark:fill-amber-400 stroke-white dark:stroke-slate-900"
                    strokeWidth={1.5}
                  />
                )}
                {showMa240 && visibleSeries[hoverIdx].ma240 !== null && (
                  <circle
                    cx={toX(hoverIdx)}
                    cy={toY(visibleSeries[hoverIdx].ma240!)}
                    r={3.5}
                    className="fill-violet-600 dark:fill-violet-400 stroke-white dark:stroke-slate-900"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            )}
          </svg>
        )}
      </div>
    </section>
  );
}
