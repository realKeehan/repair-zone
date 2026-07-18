import 'dotenv/config';

/**
 * Centralised, validated configuration.
 * Everything Discord-related is optional: the website + admin panels run
 * fine without a bot token. Discord features simply switch off if unconfigured.
 */
export const config = {
  port: Number(process.env.PORT) || 3000,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
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
