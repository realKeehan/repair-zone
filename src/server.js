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
// The waiver page (/waiver) embeds a Tally form, so tally.so is allowed as a
// frame source and script source (their embed.js handles dynamic iframe height).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://tally.so'],
        // Allow inline event handlers (e.g. the header's onclick="toggleTheme()").
        // Helmet's default CSP sets script-src-attr to 'none', which blocks ALL
        // inline on* handlers even when script-src allows 'unsafe-inline' — that
        // silently breaks the theme toggle and every other onclick on the site.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", 'https://tally.so'],
      },
    },
  }),
);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use('/api', apiRouter);

// Small runtime config exposed to the browser (no secrets — just public IDs
// like the Tally waiver form). Served as JS so pages can read window.RZ_CONFIG.
// Registered before express.static so it wins over any same-named file.
app.get('/js/site-config.js', (req, res) => {
  const publicConfig = {
    tally: { waiverFormId: config.tally.waiverFormId },
  };
  res.type('application/javascript');
  res.set('Cache-Control', 'no-cache');
  res.send(`window.RZ_CONFIG=${JSON.stringify(publicConfig)};`);
});

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
