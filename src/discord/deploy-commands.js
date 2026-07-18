import { REST, Routes } from 'discord.js';
import { config, discordEnabled } from '../config.js';
import { commands } from './commands.js';

/**
 * Registers slash commands with Discord. Run once after changing commands:
 *   npm run deploy-commands
 *
 * Guild-scoped registration (when DISCORD_GUILD_ID is set) updates instantly,
 * which is what you want for a single event server. Without a guild id it
 * registers globally (can take up to an hour to propagate).
 */
async function main() {
  if (!discordEnabled) {
    console.error('Discord is not configured. Set DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID in .env first.');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(config.discord.botToken);
  try {
    if (config.discord.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body: commands });
      console.log(`✅ Registered ${commands.length} guild commands to server ${config.discord.guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commands });
      console.log(`✅ Registered ${commands.length} global commands (may take up to 1 hour to appear).`);
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exit(1);
  }
}

main();
