import { ArrowDownRight, ArrowUpRight, Minus, Plus, SlidersHorizontal, X } from 'lucide-react';
import type { EtfQuote } from '../types/etf';

interface WatchlistSidebarProps {
  watchlist: string[];
  quotesMap: Record<string, EtfQuote>;
  selectedCode: string;
  onSelect: (code: string) => void;
  onRemove: (code: string) => void;
  onOpenManage: () => void;
  isLoadingQuotes: boolean;
}

export function WatchlistSidebar({
  watchlist,
  quotesMap,
  selectedCode,
  onSelect,
  onRemove,
  onOpenManage,
  isLoadingQuotes,
}: WatchlistSidebarProps) {
  return (
    <aside className="w-full lg:w-[280px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden self-start lg:sticky lg:top-20 transition-colors">
      <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">觀察清單</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            共 {watchlist.length} 檔 ETF
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenManage}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>設定清單</span>
        </button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-[520px] lg:max-h-[calc(100vh-210px)] overflow-y-auto">
        {watchlist.map((code) => {
          const quote = quotesMap[code];
          const isSelected = selectedCode === code;
          const isUp = (quote?.change ?? 0) > 0;
          const isDown = (quote?.change ?? 0) < 0;

          return (
            <div
              key={code}
              className={`group relative flex items-center justify-between gap-2 px-4 py-3 transition-colors ${
                isSelected
                  ? 'bg-blue-50/70 dark:bg-blue-950/40'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(code)}
                className="flex-1 min-w-0 text-left cursor-pointer focus-visible:outline-none"
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-mono text-sm font-semibold ${
                      isSelected
                        ? 'text-blue-700 dark:text-blue-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {code}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {quote?.name || '讀取中...'}
                  </span>
                </div>

                {quote ? (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {quote.price.toFixed(2)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-0.5 font-mono text-xs font-medium ${
                        isUp
                          ? 'text-red-600 dark:text-red-400'
                          : isDown
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isUp ? (
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      ) : isDown ? (
                        <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <Minus className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {isUp ? '+' : ''}
                        {quote.change.toFixed(2)} ({isUp ? '+' : ''}
                        {quote.changePct.toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                ) : (
                  <div className="mt-1.5 h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                )}
              </button>

              {watchlist.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(code);
                  }}
                  title={`從清單移除 ${code}`}
                  aria-label={`從清單移除 ${code}`}
                  className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-md opacity-70 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
        <button
          type="button"
          onClick={onOpenManage}
          disabled={isLoadingQuotes}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新增或調整觀察 ETF</span>
        </button>
      </div>
    </aside>
  );
}
