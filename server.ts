import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  compareHoldings,
  fetchTwseQuotes,
  getEtfDetail,
  getEtfDirectory,
  getTaipeiNowParts,
  getWatchlistDividendSummaries,
} from './server/etfService.ts';

const PORT = process.env.APPLET_ID ? 3000 : Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api', (_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.get('/api/etfs/directory', async (_req, res) => {
    try {
      const list = await getEtfDirectory();
      res.json({ items: list });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/etfs/quotes', async (req, res) => {
    try {
      const rawCodes = String(req.query.codes || '0050,0056,00878,00919,00929');
      const forceRefresh = req.query.refresh === '1';
      const codes = rawCodes.split(',').map((s) => s.trim()).filter(Boolean);
      const quotes = await fetchTwseQuotes(codes, forceRefresh);
      res.json({
        quotes,
        fetchedAt: getTaipeiNowParts().formattedFull,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/etfs/holdings-compare', async (req, res) => {
    try {
      const rawCodes = String(req.query.codes || '');
      const forceRefresh = req.query.refresh === '1';
      const codes = rawCodes.split(',').map((s) => s.trim()).filter(Boolean);
      if (codes.length < 2) {
        res.status(400).json({ error: '請至少選擇 2 檔 ETF 進行相同持股對比' });
        return;
      }
      const data = await compareHoldings(codes, forceRefresh);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/etfs/dividend-summary', async (req, res) => {
    try {
      const rawCodes = String(req.query.codes || '0050,0056,00878,00919,00929');
      const forceRefresh = req.query.refresh === '1';
      const codes = rawCodes.split(',').map((s) => s.trim()).filter(Boolean);
      const summary = await getWatchlistDividendSummaries(codes, forceRefresh);
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/etfs/:code/detail', async (req, res) => {
    try {
      const code = req.params.code;
      const forceRefresh = req.query.refresh === '1';
      const detail = await getEtfDetail(code, forceRefresh);
      if (!detail) {
        res.status(404).json({ error: `找不到 ETF 代號 ${code} 的即時報價或資料` });
        return;
      }
      res.json(detail);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TW ETF Monitor server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
