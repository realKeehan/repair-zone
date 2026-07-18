import 'dotenv/config';

/**
 * Centralised, validated configuration.
 * Everything Discord-related is optional: the website + admin panels run
 * fine without a bot token. Discord features simply switch off if unconfigured.
 */
/**
 * Express `trust proxy` value. Behind Cloudflare + cPanel/Passenger the real
 * client IP arrives in X-Forwarded-For; trusting the proxy makes rate-limiting
 * and logging see the right IP. `1` trusts one hop (the typical cPanel setup).
 */
function parseTrustProxy(v) {
  if (v === undefined || v === '') return 1;
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  // No default on purpose: if ADMIN_TOKEN is unset (and ADMIN_AUTH isn't
  // "external"), requireAdmin fails closed with a 503 rather than accepting a
  // guessable password. Set a strong ADMIN_TOKEN to open the admin panel.
  adminToken: process.env.ADMIN_TOKEN || '',
  // When 'external' (or 'htaccess'/'proxy'), the app does NOT check its own
  // admin token — access to /admin and /api/admin is assumed to be gated
  // upstream (e.g. Apache Basic Auth via .htaccess on cPanel). See docs/DEPLOYMENT.md.
  adminAuthExternal: ['external', 'htaccess', 'proxy'].includes((process.env.ADMIN_AUTH || '').toLowerCase()),

  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
    forumChannelId: process.env.DISCORD_FORUM_CHANNEL_ID || '',
    logChannelId: process.env.DISCORD_LOG_CHANNEL_ID || '',
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  },
};

/** True when there is enough config to boot the Discord bot. */
export const discordEnabled = Boolean(config.discord.botToken && config.discord.clientId);

/** Warn loudly about weak/missing security config at startup. */
export function checkConfig() {
  const warnings = [];
  if (config.adminAuthExternal) {
    warnings.push('ADMIN_AUTH=external — the app is NOT checking an admin token. Make sure .htaccess/proxy Basic Auth protects /admin AND /api/admin, or the admin panels are open.');
  } else if (!config.adminToken || config.adminToken === 'change-me-to-a-long-random-string') {
    warnings.push('ADMIN_TOKEN is unset or the placeholder and ADMIN_AUTH is not "external" — the admin API is locked (503). Set a strong ADMIN_TOKEN, or set ADMIN_AUTH=external and protect /admin with .htaccess.');
  }
  if (!discordEnabled) {
    warnings.push('Discord bot is disabled (DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID not set). The site still works.');
  } else if (!config.discord.forumChannelId) {
    warnings.push('DISCORD_FORUM_CHANNEL_ID is not set — repair requests will not be posted as forum threads.');
  }
  return warnings;
}
