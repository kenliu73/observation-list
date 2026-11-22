import fs from 'fs/promises';
import path from 'path';
import {
  fetchTwseQuotes,
  getEtfDetail,
  getEtfDirectory,
  getTaipeiNowParts,
} from '../server/etfService.ts';
import type { EtfDividendSummaryItem, EtfQuote } from '../src/types/etf.ts';

const POPULAR_DETAIL_CODES = [
  '0050',
  '0056',
  '00878',
  '00919',
  '00929',
  '006208',
  '00713',
  '00940',
  '00939',
  '00918',
  '00915',
  '00922',
  '00923',
  '00934',
  '00936',
  '00850',
  '00881',
  '00891',
  '00892',
  '00900',
  '00904',
  '00905',
  '00912',
  '00921',
  '00927',
  '00930',
  '00932',
  '00935',
  '00943',
  '00944',
  '00946',
  '0051',
  '0052',
  '0053',
  '0055',
  '00690',
  '00692',
  '00701',
  '00728',
  '00731',
  '00733',
  '00679B',
  '00687B',
  '00720B',
  '00751B',
  '00933B',
  '00937B',
];

async function run() {
  const outRoot = path.resolve(process.cwd(), 'dist', 'data');
  const detailsDir = path.join(outRoot, 'details');
  await fs.mkdir(detailsDir, { recursive: true });

  console.log('[static-data] Fetching Taiwan ETF directory...');
  const directory = await getEtfDirectory();
  const generatedAt = getTaipeiNowParts().formattedFull;

  await fs.writeFile(
    path.join(outRoot, 'directory.json'),
    JSON.stringify({ items: directory, generatedAt })
  );
  console.log(`[static-data] Directory saved: ${directory.length} ETFs`);

  const allCodes = Array.from(
    new Set([
      ...POPULAR_DETAIL_CODES,
      ...directory.map((d) => d.code.trim().toUpperCase()),
    ])
  ).filter(Boolean);

  console.log(`[static-data] Fetching TWSE/TPEx quotes for ${allCodes.length} ETFs...`);
  const quotes = await fetchTwseQuotes(allCodes, true);
  const quoteByCode = new Map<string, EtfQuote>();
  for (const q of quotes) {
    quoteByCode.set(q.code, q);
  }

  await fs.writeFile(
    path.join(outRoot, 'quotes.json'),
    JSON.stringify({ quotes, fetchedAt: generatedAt })
  );
  console.log(`[static-data] Quotes saved: ${quotes.length} ETFs`);

  const targetDetails = POPULAR_DETAIL_CODES.filter((c) => quoteByCode.has(c));
  const availableDetailCodes: string[] = [];
  const dividendSummaries: EtfDividendSummaryItem[] = [];
  const today = getTaipeiNowParts().dateStr;
  const oneYearAgoDt = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const ttmWindowStart = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(oneYearAgoDt);
  const concurrency = 5;

  console.log(`[static-data] Building detail snapshots for ${targetDetails.length} popular ETFs...`);
  for (let i = 0; i < targetDetails.length; i += concurrency) {
    const batch = targetDetails.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (code) => {
        try {
          const detail = await getEtfDetail(code, true, quoteByCode.get(code));
          if (!detail) return null;
          await fs.writeFile(
            path.join(detailsDir, `${code}.json`),
            JSON.stringify(detail)
          );
          const payoutCount12m = detail.dividends.periods.filter(
            (p) => p.exDate >= ttmWindowStart && p.exDate <= today && p.amount > 0
          ).length;
          dividendSummaries.push({
            code: detail.quote.code,
            name: detail.quote.name,
            exchange: detail.quote.exchange,
            price: detail.quote.price,
            quoteDate: detail.quote.quoteDate,
            quoteTime: detail.quote.quoteTime,
            isIntraday: detail.quote.isIntraday,
            marketStatusLabel: detail.quote.marketStatusLabel,
            trailing12mDividend: detail.dividends.latestTtmDividend,
            latestTtmYieldPct: detail.dividends.latestTtmYieldPct,
            dividendFrequency: detail.distributable.dividendFrequency,
            payoutCount12m,
            hasData: true,
          });
          return code;
        } catch (err) {
          console.warn(`[static-data] Failed ${code}:`, (err as Error).message);
          return null;
        }
      })
    );
    for (const ok of results) {
      if (ok) availableDetailCodes.push(ok);
    }
  }

  await fs.writeFile(
    path.join(outRoot, 'dividend-summaries.json'),
    JSON.stringify({ items: dividendSummaries, fetchedAt: generatedAt })
  );

  await fs.writeFile(
    path.join(outRoot, 'manifest.json'),
    JSON.stringify({
      generatedAt,
      directoryCount: directory.length,
      quoteCount: quotes.length,
      availableDetailCodes,
    })
  );
  console.log(
    `[static-data] Complete! ${availableDetailCodes.length}/${targetDetails.length} detail snapshots generated at ${generatedAt}`
  );
}

run().catch((err) => {
  console.error('[static-data] Fatal error:', err);
  process.exit(1);
});
