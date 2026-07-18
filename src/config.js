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
  adminToken: process.env.ADMIN_TOKEN || '',

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
  if (!config.adminToken || config.adminToken === 'change-me-to-a-long-random-string') {
    warnings.push('ADMIN_TOKEN is unset or default — the admin panels are effectively open. Set a strong token in .env.');
  }
  if (!discordEnabled) {
    warnings.push('Discord bot is disabled (DISCORD_BOT_TOKEN / DISCORD_CLIENT_ID not set). The site still works.');
  } else if (!config.discord.forumChannelId) {
    warnings.push('DISCORD_FORUM_CHANNEL_ID is not set — repair requests will not be posted as forum threads.');
  }
  return warnings;
}
