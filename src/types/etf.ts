export interface EtfDirectoryItem {
  code: string;
  name: string;
  fullName: string;
  fundType: string;
  issuer: string;
  listingDate: string;
  estimatedNav: number | null;
  prevNav: number | null;
  issuedUnits: number | null;
}

export interface EtfQuote {
  code: string;
  name: string;
  exchange: 'tse' | 'otc';
  price: number;
  prevClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  change: number;
  changePct: number;
  volumeLots: number;
  estimatedNav: number | null;
  prevNav: number | null;
  premiumDiscountPct: number | null;
  issuedUnits: number | null;
  unitDiff: number | null;
  quoteDate: string;
  quoteTime: string;
  navDate: string | null;
  navTime: string | null;
  isIntraday: boolean;
  marketStatusLabel: string;
  fetchedAt: string;
}

export interface PricePoint {
  date: string;
  close: number;
  ma120: number | null;
  ma240: number | null;
  isIntraday: boolean;
}

export interface DividendPeriod {
  exDate: string;
  payDate: string | null;
  amount: number;
  annualizedRate: number | null;
  isUpcoming: boolean;
  source: 'yahoo' | 'twse' | 'moneydj';
}

export interface RollingYieldPoint {
  month: string;
  lastTradingDate: string;
  lastPrice: number;
  trailing12mDividend: number;
  yieldPct: number;
  isIntraday: boolean;
}

export interface AnnualYieldPoint {
  year: string;
  lastTradingDate: string;
  lastPrice: number;
  total12mDividend: number;
  yieldPct: number;
  isPartialYear: boolean;
}

export interface DistributableInfo {
  currentNav: number | null;
  prevNav: number | null;
  parValue: number | null;
  parValueSource: string;
  distributableBufferPerUnit: number | null;
  issuedUnits: number | null;
  totalDistributablePoolTwd: number | null;
  totalFundScaleTwd: number | null;
  trailing12mDividend: number;
  estimatedCoverageYears: number | null;
  dividendFrequency: string | null;
  expenseRatioPct: number | null;
  managerName: string | null;
  pendingAnnouncement: {
    exDate: string;
    payDate: string;
    amount: number;
  } | null;
  prospectusRule: string | null;
  navDate: string | null;
  navTime: string | null;
}

export interface SectorItem {
  sector: string;
  amountTenThousand: number;
  weightPct: number;
  color: string;
}

export interface HoldingItem {
  rank: number;
  code: string | null;
  name: string;
  sharesThousand: number | null;
  weightPct: number;
  changePct: number | null;
}

export interface EtfDetailResponse {
  quote: EtfQuote;
  priceSeries: PricePoint[];
  dividends: {
    periods: DividendPeriod[];
    rolling12mYield: RollingYieldPoint[];
    annual12mYield: AnnualYieldPoint[];
    latestTtmDividend: number;
    latestTtmYieldPct: number | null;
  };
  distributable: DistributableInfo;
  holdings: {
    dataDate: string | null;
    sectors: SectorItem[];
    items: HoldingItem[];
  };
}

export interface EtfHoldingsSnapshot {
  code: string;
  name: string;
  dataDate: string | null;
  items: HoldingItem[];
}

export interface OverlappingHoldingRow {
  key: string;
  name: string;
  code: string | null;
  heldByCount: number;
  weightsByEtf: Record<string, number | null>;
  maxWeightPct: number;
  avgWeightPct: number;
}

export interface EtfPairwiseOverlap {
  codeA: string;
  codeB: string;
  sharedCount: number;
  overlapWeightPct: number;
}

export interface HoldingsCompareResponse {
  etfs: EtfHoldingsSnapshot[];
  rows: OverlappingHoldingRow[];
  pairwise: EtfPairwiseOverlap[];
}

export interface EtfDividendSummaryItem {
  code: string;
  name: string;
  exchange: 'tse' | 'otc';
  price: number;
  quoteDate: string;
  quoteTime: string;
  isIntraday: boolean;
  marketStatusLabel: string;
  trailing12mDividend: number;
  latestTtmYieldPct: number | null;
  dividendFrequency: string | null;
  payoutCount12m: number;
  hasData: boolean;
}

export interface WatchlistDividendSummaryResponse {
  items: EtfDividendSummaryItem[];
  fetchedAt: string;
}

