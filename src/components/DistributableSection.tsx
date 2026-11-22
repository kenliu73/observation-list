import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { DistributableInfo, EtfQuote } from '../types/etf';

interface DistributableSectionProps {
  quote: EtfQuote;
  distributable: DistributableInfo;
}

function formatBillions(twd: number | null): string {
  if (twd === null) return '—';
  const yi = twd / 100_000_000;
  if (yi >= 100) return `${yi.toLocaleString('zh-TW', { maximumFractionDigits: 1 })} 億元`;
  return `${yi.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} 億元`;
}

export function DistributableSection({ quote, distributable }: DistributableSectionProps) {
  const [showRule, setShowRule] = useState(false);

  const nav = distributable.currentNav;
  const par = distributable.parValue;
  const buffer = distributable.distributableBufferPerUnit;

  const parRatio = nav && par && nav > 0 ? Math.min(100, (par / nav) * 100) : 0;
  const bufferRatio = nav && buffer !== null && nav > 0 ? Math.max(0, 100 - parRatio) : 0;

  return (
    <section
      id="section-distributable"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 scroll-mt-20 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            即時可配息淨值空間與平準金儲備分析
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            資料來源：臺灣證券交易所即時預估淨值（iNAV）與 ETF 公開說明書可分配收益規範
            {distributable.navDate
              ? ` · 淨值時間 ${distributable.navDate} ${distributable.navTime || ''}`
              : ''}
          </p>
        </div>
        {distributable.dividendFrequency && (
          <div className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
            配息頻率：
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {distributable.dividendFrequency}
            </span>
            {distributable.expenseRatioPct !== null && (
              <>
                {' · '}總費用率{' '}
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {distributable.expenseRatioPct.toFixed(2)}%
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">
            每單位尚可用於配息淨值空間
          </span>
          <span className="font-mono text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1 block">
            {buffer !== null ? `${buffer.toFixed(2)} 元` : '—'}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
            即時預估淨值 − 發行面額（含平準金與資本利得緩衝）
          </span>
        </div>

        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">
            全基金預估可配息總資產池
          </span>
          <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">
            {formatBillions(distributable.totalDistributablePoolTwd)}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
            總基金規模約 {formatBillions(distributable.totalFundScaleTwd)}
          </span>
        </div>

        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">
            即時預估淨值 / 市價折溢價
          </span>
          <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">
            {nav !== null ? `${nav.toFixed(2)} 元` : '—'}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
            折溢價：
            <span
              className={`font-mono font-semibold ${
                (quote.premiumDiscountPct ?? 0) > 0
                  ? 'text-red-600 dark:text-red-400'
                  : (quote.premiumDiscountPct ?? 0) < 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {quote.premiumDiscountPct !== null
                ? `${quote.premiumDiscountPct > 0 ? '+' : ''}${quote.premiumDiscountPct.toFixed(2)}%`
                : '—'}
            </span>
          </span>
        </div>

        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-950/50">
          <span className="text-xs text-slate-500 dark:text-slate-400 block">
            依近 12 月配息推估支撐年限
          </span>
          <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 block">
            {distributable.estimatedCoverageYears !== null
              ? `${distributable.estimatedCoverageYears.toFixed(1)} 年`
              : '—'}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-1 block">
            {distributable.pendingAnnouncement
              ? `已公告 ${distributable.pendingAnnouncement.exDate} 配發 ${distributable.pendingAnnouncement.amount.toFixed(2)} 元`
              : `近 12 月配息 ${distributable.trailing12mDividend.toFixed(2)} 元`}
          </span>
        </div>
      </div>

      <div className="mt-5 p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            每單位淨值結構拆解（基本面額 vs 可分配淨值緩衝）
          </span>
          <span className="text-slate-500 dark:text-slate-400">{distributable.parValueSource}</span>
        </div>

        {nav !== null && par !== null ? (
          <>
            <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden flex">
              <div
                style={{ width: `${parRatio}%` }}
                className="bg-slate-400 dark:bg-slate-600 h-full transition-all"
                title={`基本面額 ${par} 元`}
              />
              <div
                style={{ width: `${bufferRatio}%` }}
                className="bg-blue-600 dark:bg-blue-500 h-full transition-all"
                title={`可分配淨值緩衝空間 ${(buffer ?? 0).toFixed(2)} 元`}
              />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-slate-400 dark:bg-slate-600 rounded-xs inline-block" />
                  基本面額：<strong className="font-mono text-slate-900 dark:text-slate-100">{par.toFixed(2)} 元</strong> ({parRatio.toFixed(1)}%)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 bg-blue-600 dark:bg-blue-500 rounded-xs inline-block" />
                  尚可用於配息淨值空間：<strong className="font-mono text-blue-700 dark:text-blue-400">{(buffer ?? 0).toFixed(2)} 元</strong> ({bufferRatio.toFixed(1)}%)
                </span>
              </div>
              {distributable.issuedUnits !== null && (
                <span className="font-mono text-slate-500 dark:text-slate-400">
                  在外流通單位數：{(distributable.issuedUnits / 1000).toLocaleString('zh-TW')} 千單位
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            此 ETF 尚未揭露發行面額，無法進行淨值與面額拆解比較；目前即時預估淨值為{' '}
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {nav !== null ? `${nav.toFixed(2)} 元` : '—'}
            </span>
            。
          </p>
        )}
      </div>

      {distributable.prospectusRule && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowRule((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
          >
            {showRule ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>檢視 TWSE 公開說明書可分配收益條款原文</span>
          </button>
          {showRule && (
            <p className="mt-2 p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg">
              {distributable.prospectusRule}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
