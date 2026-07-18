import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { config, discordEnabled, checkConfig } from './config.js';
import { apiRouter } from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const app = express();
app.disable('x-powered-by');
// Trust the reverse proxy (Cloudflare / cPanel Passenger) so req.ip and the
// rate limiter use the real client IP from X-Forwarded-For.
app.set('trust proxy', config.trustProxy);

// Helmet with a CSP that allows our self-hosted assets + inline styles/scripts.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  }),
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use('/api', apiRouter);

// Static site (landing, forms, admin panels).
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// Health check.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// SPA-ish fallback to the landing page for unknown non-API GETs.
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  next();
});

async function start() {
  for (const w of checkConfig()) console.warn('⚠️  ' + w);

  app.listen(config.port, () => {
    console.log(`\n🔧 The Repair Zone is live:`);
    console.log(`   Site      → ${config.publicBaseUrl}`);
    console.log(`   Admin     → ${config.publicBaseUrl}/admin`);
    console.log(`   Borrowing → ${config.publicBaseUrl}/admin/borrowing`);
  });

  if (discordEnabled) {
    try {
      const { startBot } = await import('./discord/bot.js');
      await startBot();
    } catch (err) {
      console.error('[discord] Bot failed to start (site still running):', err.message);
    }
  }
}

start();
