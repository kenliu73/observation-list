import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { EtfDirectoryItem } from '../types/etf';

interface WatchlistModalProps {
  isOpen: boolean;
  onClose: () => void;
  directory: EtfDirectoryItem[];
  watchlist: string[];
  onSaveWatchlist: (next: string[]) => void;
  defaultWatchlist: string[];
}

export function WatchlistModal({
  isOpen,
  onClose,
  directory,
  watchlist,
  onSaveWatchlist,
  defaultWatchlist,
}: WatchlistModalProps) {
  const [query, setQuery] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [draft, setDraft] = useState<string[]>(watchlist);

  const [lastOpen, setLastOpen] = useState(false);
  if (isOpen && !lastOpen) {
    setDraft(watchlist);
    setLastOpen(true);
  } else if (!isOpen && lastOpen) {
    setLastOpen(false);
  }

  const directoryByCode = useMemo(() => {
    const map = new Map<string, EtfDirectoryItem>();
    for (const item of directory) {
      map.set(item.code, item);
    }
    return map;
  }, [directory]);

  const filteredDirectory = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directory.slice(0, 60);
    return directory
      .filter(
        (item) =>
          item.code.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.issuer.toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [directory, query]);

  if (!isOpen) return null;

  const toggleCode = (code: string) => {
    const upper = code.trim().toUpperCase();
    if (!upper) return;
    setDraft((prev) => {
      if (prev.includes(upper)) {
        if (prev.length <= 1) return prev;
        return prev.filter((c) => c !== upper);
      }
      return [...prev, upper];
    });
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    setDraft((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customCode.trim().toUpperCase();
    if (!cleaned) return;
    if (!draft.includes(cleaned)) {
      setDraft((prev) => [...prev, cleaned]);
    }
    setCustomCode('');
  };

  const handleSave = () => {
    onSaveWatchlist(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="watchlist-modal-title"
    >
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2
              id="watchlist-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              設定與調整 ETF 觀察清單
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              可搜尋全台上市櫃 ETF（共 {directory.length} 檔），調整顯示順序或直接輸入代號加入
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="關閉視窗"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 flex-1 min-h-0 overflow-hidden">
          <div className="p-4 flex flex-col min-h-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋代號或名稱（例如 0050、高股息、美債）"
                className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <form onSubmit={handleAddCustom} className="mt-2.5 flex items-center gap-2">
              <input
                type="text"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                placeholder="或手動輸入 ETF 代號（如 00915）"
                className="flex-1 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-600"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>加入代號</span>
              </button>
            </form>

            <div className="mt-3 flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 pr-1 max-h-[340px]">
              {filteredDirectory.map((item) => {
                const selected = draft.includes(item.code);
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => toggleCode(item.code)}
                    className={`w-full py-2.5 px-2.5 flex items-center justify-between gap-3 text-left rounded-lg transition-colors cursor-pointer ${
                      selected
                        ? 'bg-blue-50/70 dark:bg-blue-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {item.code}
                        </span>
                        <span className="text-sm text-slate-700 dark:text-slate-300 truncate">
                          {item.name}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {item.issuer}
                        {item.estimatedNav ? ` · 預估淨值 ${item.estimatedNav.toFixed(2)}` : ''}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium shrink-0 ${
                        selected
                          ? 'text-blue-700 dark:text-blue-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {selected ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>已選取</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>加入</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-4 flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-950/50">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                目前已選清單（{draft.length} 檔，點擊箭頭可排序）
              </span>
              <button
                type="button"
                onClick={() => setDraft(defaultWatchlist)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>恢復預設</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[380px]">
              {draft.map((code, idx) => {
                const info = directoryByCode.get(code);
                return (
                  <div
                    key={code}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 mr-2">
                        {code}
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400 truncate">
                        {info?.name || '自訂代號'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        aria-label={`上移 ${code}`}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === draft.length - 1}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        aria-label={`下移 ${code}`}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCode(code)}
                        disabled={draft.length <= 1}
                        className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 cursor-pointer"
                        aria-label={`移除 ${code}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            套用觀察清單
          </button>
        </div>
      </div>
    </div>
  );
}
