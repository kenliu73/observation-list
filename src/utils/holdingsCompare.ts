import type {
  EtfHoldingsSnapshot,
  EtfPairwiseOverlap,
  HoldingsCompareResponse,
  OverlappingHoldingRow,
} from '../types/etf';

export function normalizeHoldingKey(name: string): string {
  return name.replace(/[\s\u3000]+/g, '').trim();
}

export function computeHoldingsCompare(
  etfs: EtfHoldingsSnapshot[],
  orderedCodes?: string[]
): HoldingsCompareResponse {
  const uniqueCodes = orderedCodes && orderedCodes.length > 0
    ? orderedCodes
    : etfs.map((e) => e.code);

  const knownCodeByKey = new Map<string, string>();
  for (const etf of etfs) {
    for (const h of etf.items) {
      const key = normalizeHoldingKey(h.name);
      if (h.code && !knownCodeByKey.has(key)) {
        knownCodeByKey.set(key, h.code);
      }
    }
  }

  const rowMap = new Map<string, OverlappingHoldingRow>();
  for (const etf of etfs) {
    for (const h of etf.items) {
      const key = normalizeHoldingKey(h.name);
      let row = rowMap.get(key);
      if (!row) {
        row = {
          key,
          name: h.name,
          code: h.code || knownCodeByKey.get(key) || null,
          heldByCount: 0,
          weightsByEtf: Object.fromEntries(uniqueCodes.map((c) => [c, null])),
          maxWeightPct: 0,
          avgWeightPct: 0,
        };
        rowMap.set(key, row);
      }
      if (!row.code && (h.code || knownCodeByKey.has(key))) {
        row.code = h.code || knownCodeByKey.get(key) || null;
      }
      if (row.weightsByEtf[etf.code] === null) {
        row.heldByCount += 1;
      }
      row.weightsByEtf[etf.code] = h.weightPct;
    }
  }

  const rows = Array.from(rowMap.values()).map((r) => {
    const activeWeights = Object.values(r.weightsByEtf).filter(
      (v): v is number => v !== null
    );
    const maxWeightPct = activeWeights.length > 0 ? Math.max(...activeWeights) : 0;
    const avgWeightPct =
      activeWeights.length > 0
        ? Number(
            (activeWeights.reduce((a, b) => a + b, 0) / activeWeights.length).toFixed(2)
          )
        : 0;
    return {
      ...r,
      maxWeightPct,
      avgWeightPct,
    };
  });

  rows.sort((a, b) => {
    if (b.heldByCount !== a.heldByCount) return b.heldByCount - a.heldByCount;
    return b.avgWeightPct - a.avgWeightPct;
  });

  const pairwise: EtfPairwiseOverlap[] = [];
  for (let i = 0; i < etfs.length; i++) {
    for (let j = i + 1; j < etfs.length; j++) {
      const etfA = etfs[i];
      const etfB = etfs[j];
      const mapB = new Map<string, number>();
      for (const h of etfB.items) {
        mapB.set(normalizeHoldingKey(h.name), h.weightPct);
      }
      let sharedCount = 0;
      let overlapWeightPct = 0;
      for (const h of etfA.items) {
        const wB = mapB.get(normalizeHoldingKey(h.name));
        if (wB !== undefined) {
          sharedCount += 1;
          overlapWeightPct += Math.min(h.weightPct, wB);
        }
      }
      pairwise.push({
        codeA: etfA.code,
        codeB: etfB.code,
        sharedCount,
        overlapWeightPct: Number(overlapWeightPct.toFixed(2)),
      });
    }
  }

  return { etfs, rows, pairwise };
}
