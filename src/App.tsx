import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  Moon,
  RotateCw,
  Sun,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DistributableSection } from './components/DistributableSection';
import { DividendYieldSection } from './components/DividendYieldSection';
import { HoldingsSection } from './components/HoldingsSection';
import { OverlapHoldingsSection } from './components/OverlapHoldingsSection';
import { PriceMovingAvgChart } from './components/PriceMovingAvgChart';
import { TopBar } from './components/TopBar';
import { WatchlistIncomeGoalSection } from './components/WatchlistIncomeGoalSection';
import { WatchlistModal } from './components/WatchlistModal';
import { WatchlistSidebar } from './components/WatchlistSidebar';
import type { EtfDetailResponse, EtfDirectoryItem, EtfQuote } from './types/etf';
import {
  fetchEtfDetail,
  fetchEtfDirectory,
  fetchEtfQuotes,
  isStaticDataMode,
} from './utils/api';

const DEFAULT_WATCHLIST = ['0050', '0056', '00878', '00919', '00929'];
const STORAGE_KEY = 'tw-etf-watchlist-v1';
const THEME_STORAGE_KEY = 'tw-etf-theme-v1';

type ThemeMode = 'light' | 'dark';

function getInitialTheme(): ThemeMode {
  if (typeof document !== 'undefined') {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }
  return 'light';
}

function loadInitialWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((c) => String(c).trim().toUpperCase()).filter(Boolean);
      }
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_WATCHLIST;
}

export default function App() {
  const [watchlist, setWatchlist] = useState<string[]>(loadInitialWatchlist);
  const [selectedCode, setSelectedCode] = useState<string>(() => loadInitialWatchlist()[0] || '0050');
  const [directory, setDirectory] = useState<EtfDirectoryItem[]>([]);
  const [quotesMap, setQuotesMap] = useState<Record<string, EtfQuote>>({});
  const [lastFetchedAt, setLastFetchedAt] = useState<string>('');
  const [detail, setDetail] = useState<EtfDetailResponse | null>(null);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [staticMode, setStaticMode] = useState<boolean>(isStaticDataMode);

  // Sync theme class on <html> and persist preference
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  // Persist watchlist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(watchlist));
    } catch {
      // Ignore storage errors
    }
  }, [watchlist]);

  // Fetch TWSE ETF directory once
  useEffect(() => {
    fetchEtfDirectory()
      .then((items) => {
        if (Array.isArray(items)) {
          setDirectory(items);
        }
        if (isStaticDataMode()) setStaticMode(true);
      })
      .catch(() => {
        // Directory is non-blocking
      });
  }, []);

  const fetchQuotes = useCallback(async (codes: string[], forceRefresh = false) => {
    if (codes.length === 0) return;
    setIsLoadingQuotes(true);
    try {
      const data = await fetchEtfQuotes(codes, forceRefresh);
      const nextMap: Record<string, EtfQuote> = {};
      for (const q of data.quotes || []) {
        nextMap[q.code] = q;
      }
      setQuotesMap((prev) => ({ ...prev, ...nextMap }));
      if (data.fetchedAt) setLastFetchedAt(data.fetchedAt);
      if (data.isStatic) setStaticMode(true);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoadingQuotes(false);
    }
  }, []);

  const fetchDetail = useCallback(async (code: string, forceRefresh = false) => {
    if (!code) return;
    setIsLoadingDetail(true);
    setErrorMsg(null);
    try {
      const { detail: data, isStatic } = await fetchEtfDetail(code, forceRefresh);
      setDetail(data);
      setQuotesMap((prev) => ({ ...prev, [data.quote.code]: data.quote }));
      setLastFetchedAt(data.quote.fetchedAt);
      if (isStatic) setStaticMode(true);
    } catch (err) {
      setDetail((prev) => (prev?.quote.code === code ? prev : null));
      setErrorMsg((err as Error).message);
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes(watchlist);
  }, [watchlist, fetchQuotes]);

  useEffect(() => {
    fetchDetail(selectedCode);
  }, [selectedCode, fetchDetail]);

  // Auto-refresh live quotes every 60s (both backend API and direct GitHub Pages browser mode)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchQuotes(watchlist);
    }, 60_000);
    return () => clearInterval(timer);
  }, [watchlist, fetchQuotes]);

  const handleManualRefresh = () => {
    setRefreshNonce((n) => n + 1);
    fetchQuotes(watchlist, true);
    fetchDetail(selectedCode, true);
  };

  const handleRemoveFromWatchlist = (code: string) => {
    if (watchlist.length <= 1) return;
    const next = watchlist.filter((c) => c !== code);
    setWatchlist(next);
    if (selectedCode === code) {
      setSelectedCode(next[0]);
    }
  };

  const handleSaveWatchlist = (next: string[]) => {
    if (next.length === 0) return;
    setWatchlist(next);
    if (!next.includes(selectedCode)) {
      setSelectedCode(next[0]);
    }
  };

  const activeQuote = quotesMap[selectedCode] || detail?.quote || null;
  const liveDetail = useMemo(() => {
    if (!detail) return null;
    if (!activeQuote || activeQuote.code !== detail.quote.code) return detail;

    const updatedSeries = [...detail.priceSeries];
    const last = updatedSeries[updatedSeries.length - 1];
    if (last && activeQuote.price > 0) {
      if (activeQuote.quoteDate > last.date) {
        updatedSeries.push({
          date: activeQuote.quoteDate,
          close: Number(activeQuote.price.toFixed(2)),
          ma120: last.ma120,
          ma240: last.ma240,
          isIntraday: activeQuote.isIntraday,
        });
      } else if (activeQuote.quoteDate === last.date) {
        updatedSeries[updatedSeries.length - 1] = {
          ...last,
          close: Number(activeQuote.price.toFixed(2)),
          isIntraday: activeQuote.isIntraday,
        };
      }
    }

    const ttmDiv = detail.dividends.latestTtmDividend;
    const liveYield =
      activeQuote.price > 0 && ttmDiv > 0
        ? Number(((ttmDiv / activeQuote.price) * 100).toFixed(2))
        : detail.dividends.latestTtmYieldPct;

    return {
      ...detail,
      quote: activeQuote,
      priceSeries: updatedSeries,
      dividends: {
        ...detail.dividends,
        latestTtmYieldPct: liveYield,
      },
    };
  }, [detail, activeQuote]);

  const isUp = (activeQuote?.change ?? 0) > 0;
  const isDown = (activeQuote?.change ?? 0) < 0;

  return (
    <div
      id="top"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200"
    >
      <TopBar
        isRefreshing={isLoadingQuotes || isLoadingDetail}
        onRefresh={handleManualRefresh}
      />

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
        <WatchlistSidebar
          watchlist={watchlist}
          quotesMap={quotesMap}
          selectedCode={selectedCode}
          onSelect={setSelectedCode}
          onRemove={handleRemoveFromWatchlist}
          onOpenManage={() => setIsModalOpen(true)}
          isLoadingQuotes={isLoadingQuotes}
        />

        <div className="flex-1 min-w-0 space-y-6">
          {/* Workspace utility bar: refresh cadence note + Day/Night theme switch */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {staticMode
                ? '盤中每 60 秒自動更新即時報價（線圖與成分股為 GitHub 快照）'
                : '盤中每 60 秒自動更新 TWSE / 即時報價'}
              {lastFetchedAt ? ` · 最近抓取 ${lastFetchedAt}` : ''}
            </p>

            <div
              role="group"
              aria-label="顯示模式切換"
              className="inline-flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1"
            >
              <button
                type="button"
                onClick={() => setTheme('light')}
                aria-pressed={theme === 'light'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>日間模式</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                aria-pressed={theme === 'dark'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>夜間模式</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/70 rounded-xl flex items-center justify-between gap-4 text-sm text-red-800 dark:text-red-200">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={handleManualRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-800 dark:text-red-200 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950 rounded-lg cursor-pointer shrink-0"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>重新抓取</span>
              </button>
            </div>
          )}

          {/* Selected ETF Real-Time TWSE Quote Header */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
            {activeQuote ? (
              <>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        <span className="font-mono mr-2">{activeQuote.code}</span>
                        <span>{activeQuote.name}</span>
                      </h1>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 tabular-nums">
                      {activeQuote.exchange === 'otc' ? '櫃買中心 (TPEx)' : '臺灣證券交易所 (TWSE)'}
                      {' · '}
                      {activeQuote.marketStatusLabel}
                      {' · '}
                      交易所撮合時間 {activeQuote.quoteDate} {activeQuote.quoteTime}
                      {' · '}
                      報價抓取時間 {lastFetchedAt || activeQuote.fetchedAt}
                    </p>
                  </div>

                  <div className="flex items-baseline gap-4 shrink-0">
                    <span className="font-mono text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
                      {activeQuote.price.toFixed(2)}
                    </span>
                    <div
                      className={`inline-flex items-center gap-1 font-mono text-sm sm:text-base font-semibold ${
                        isUp
                          ? 'text-red-600 dark:text-red-400'
                          : isDown
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {isUp ? (
                        <ArrowUpRight className="w-4 h-4 shrink-0" />
                      ) : isDown ? (
                        <ArrowDownRight className="w-4 h-4 shrink-0" />
                      ) : (
                        <Minus className="w-4 h-4 shrink-0" />
                      )}
                      <span>
                        {isUp ? '+' : ''}
                        {activeQuote.change.toFixed(2)} ({isUp ? '+' : ''}
                        {activeQuote.changePct.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">開盤價</span>
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
                      {activeQuote.open !== null ? activeQuote.open.toFixed(2) : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">最高 / 最低</span>
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
                      {activeQuote.high !== null && activeQuote.low !== null
                        ? `${activeQuote.high.toFixed(2)} / ${activeQuote.low.toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">昨日收盤價</span>
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
                      {activeQuote.prevClose.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">成交量（張）</span>
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
                      {activeQuote.volumeLots.toLocaleString('zh-TW')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">即時預估淨值</span>
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">
                      {activeQuote.estimatedNav !== null
                        ? `${activeQuote.estimatedNav.toFixed(2)}`
                        : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block">近 12 月殖利率</span>
                    <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400 mt-0.5 block">
                      {liveDetail?.dividends.latestTtmYieldPct !== null &&
                      liveDetail?.dividends.latestTtmYieldPct !== undefined
                        ? `${liveDetail.dividends.latestTtmYieldPct.toFixed(2)}%`
                        : '—'}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3 animate-pulse">
                <div className="h-8 w-64 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-4 w-96 bg-slate-100 dark:bg-slate-800 rounded" />
                <div className="h-12 w-full bg-slate-100 dark:bg-slate-800 rounded mt-4" />
              </div>
            )}
          </section>

          {isLoadingDetail && (!liveDetail || liveDetail.quote.code !== selectedCode) ? (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 h-[420px] animate-pulse">
                <div className="h-6 w-48 bg-slate-100 dark:bg-slate-800 rounded mb-4" />
                <div className="h-[320px] bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 h-[320px] animate-pulse">
                <div className="h-6 w-56 bg-slate-100 dark:bg-slate-800 rounded mb-4" />
                <div className="h-[220px] bg-slate-100 dark:bg-slate-800 rounded" />
              </div>
            </div>
          ) : liveDetail ? (
            <>
              <PriceMovingAvgChart quote={liveDetail.quote} priceSeries={liveDetail.priceSeries} />

              <DividendYieldSection
                code={liveDetail.quote.code}
                periods={liveDetail.dividends.periods}
                rolling12mYield={liveDetail.dividends.rolling12mYield}
                annual12mYield={liveDetail.dividends.annual12mYield}
                latestTtmDividend={liveDetail.dividends.latestTtmDividend}
                latestTtmYieldPct={liveDetail.dividends.latestTtmYieldPct}
              />

              <DistributableSection
                quote={liveDetail.quote}
                distributable={liveDetail.distributable}
              />

              <HoldingsSection
                code={liveDetail.quote.code}
                dataDate={liveDetail.holdings.dataDate}
                sectors={liveDetail.holdings.sectors}
                items={liveDetail.holdings.items}
              />
            </>
          ) : null}

          <WatchlistIncomeGoalSection
            watchlist={watchlist}
            selectedCode={selectedCode}
            quotesMap={quotesMap}
            onSelectCode={setSelectedCode}
            refreshNonce={refreshNonce}
          />

          <OverlapHoldingsSection
            watchlist={watchlist}
            selectedCode={selectedCode}
            quotesMap={quotesMap}
            refreshNonce={refreshNonce}
          />
        </div>
      </main>

      <WatchlistModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        directory={directory}
        watchlist={watchlist}
        onSaveWatchlist={handleSaveWatchlist}
        defaultWatchlist={DEFAULT_WATCHLIST}
      />
    </div>
  );
}
