import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { REPAIR_STATUSES } from '../db.js';

const STATUS_CHOICES = [
  { name: '🟠 Open', value: 'open' },
  { name: '🟣 Claimed', value: 'claimed' },
  { name: '🔵 In progress', value: 'in_progress' },
  { name: '🟢 Repaired', value: 'done' },
  { name: '🔴 Unable to repair', value: 'unable' },
  { name: '⚪ Picked up', value: 'picked_up' },
].filter((c) => REPAIR_STATUSES.includes(c.value));

/** All slash commands, as JSON ready for registration. */
export const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the "Request a Repair" button panel in this channel (staff only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the open repair queue.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim a repair request so others know you have it.')
    .addIntegerOption((o) => o.setName('id').setDescription('Repair request number').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Update the status of a repair request.')
    .addIntegerOption((o) => o.setName('id').setDescription('Repair request number').setRequired(true))
    .addStringOption((o) =>
      o.setName('to').setDescription('New status').setRequired(true).addChoices(...STATUS_CHOICES),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('tools')
    .setDescription('List tool inventory and current availability.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((c) => c.toJSON());
