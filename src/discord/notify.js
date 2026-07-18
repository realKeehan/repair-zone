import { EmbedBuilder, ChannelType } from 'discord.js';
import { config, discordEnabled } from '../config.js';
import * as db from '../db.js';

/**
 * Bridge between the web/API layer and Discord. Holds a reference to the live
 * bot client once it's ready. Every function here degrades gracefully: if the
 * bot isn't configured or connected, notifications simply no-op (the site keeps
 * working). Logs can also be delivered via a plain webhook with no bot at all.
 */

let client = null;
let ready = false;

export function setClient(c) {
  client = c;
  ready = true;
}

const STATUS_META = {
  open: { label: '🟠 Open', color: 0xf97316 },
  claimed: { label: '🟣 Claimed', color: 0x8b5cf6 },
  in_progress: { label: '🔵 In progress', color: 0x3b82f6 },
  done: { label: '🟢 Repaired', color: 0x22c55e },
  unable: { label: '🔴 Unable to repair', color: 0xef4444 },
  picked_up: { label: '⚪ Picked up', color: 0x9ca3af },
};

export function statusLabel(status) {
  return STATUS_META[status]?.label || status;
}

export function buildRepairEmbed(repair) {
  const meta = STATUS_META[repair.status] || STATUS_META.open;
  const embed = new EmbedBuilder()
    .setTitle(`Repair #${repair.id} — ${repair.item}`)
    .setColor(meta.color)
    .addFields(
      { name: 'Requester', value: repair.name || '—', inline: true },
      { name: 'Booth / Location', value: repair.boothId || '—', inline: true },
      { name: 'Status', value: meta.label, inline: true },
      { name: 'The issue', value: (repair.issue || '—').slice(0, 1024) },
    )
    .setFooter({ text: `The Repair Zone · via ${repair.source === 'discord' ? 'Discord' : 'website'}` })
    .setTimestamp(new Date(repair.createdAt));

  const contactBits = [];
  if (repair.phone) contactBits.push(`📞 ${repair.phone}`);
  if (repair.contact) contactBits.push(`✉️ ${repair.contact}`);
  if (contactBits.length) embed.addFields({ name: 'Contact', value: contactBits.join(' · '), inline: false });
  if (repair.notes) embed.addFields({ name: 'Notes', value: repair.notes.slice(0, 1024) });
  return embed;
}

/**
 * Create a forum thread for a repair request and record the thread id back on
 * the repair. Used by both the website submission path and the Discord modal.
 * `mentionUserId` — if provided, the requester is pinged in the starter message.
 */
export async function createForumThreadForRepair(repair, mentionUserId = null) {
  if (!ready || !client || !config.discord.forumChannelId) return null;
  const channel = await client.channels.fetch(config.discord.forumChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildForum) {
    console.warn('[discord] DISCORD_FORUM_CHANNEL_ID is not a forum channel; skipping thread creation.');
    return null;
  }

  const title = `#${repair.id} · ${repair.item} — ${repair.name}`.slice(0, 96);
  const mention = mentionUserId ? `<@${mentionUserId}> ` : '';
  const content =
    `${mention}Thanks — your repair request is logged! A Repair Zone volunteer will pick it up shortly.\n` +
    `📎 **Reply in this thread with photos or files** of the item and the problem — it really helps us diagnose.`;

  // Optionally match a forum tag whose name looks like "open".
  const openTag = channel.availableTags?.find((t) => /open|new|request/i.test(t.name));
  const thread = await channel.threads.create({
    name: title,
    autoArchiveDuration: 1440,
    message: { content, embeds: [buildRepairEmbed(repair)] },
    appliedTags: openTag ? [openTag.id] : undefined,
  });

  db.updateRepair(repair.id, {
    discord: { threadId: thread.id, guildId: channel.guildId, userId: mentionUserId || repair.discord?.userId || null },
  });
  return thread;
}

/** Send a short log line to the staff log channel or webhook (whichever is set). */
export async function sendLog(text, embed = null) {
  const payload = {};
  if (text) payload.content = text;
  if (embed) payload.embeds = [embed];

  // Prefer a bot channel if available; fall back to a webhook.
  if (ready && client && config.discord.logChannelId) {
    const ch = await client.channels.fetch(config.discord.logChannelId).catch(() => null);
    if (ch && ch.isTextBased()) {
      await ch.send(payload).catch((e) => console.error('[discord] log channel send failed:', e.message));
      return;
    }
  }
  if (config.discord.webhookUrl) {
    await fetch(config.discord.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(embed ? { content: text || undefined, embeds: [embed.toJSON?.() || embed] } : { content: text }),
    }).catch((e) => console.error('[discord] webhook send failed:', e.message));
  }
}

/* ── event hooks called from the API layer ───────────────── */

export async function onRepairCreated(repair) {
  if (!discordEnabled) return;
  // Website submissions have no Discord user to ping.
  await createForumThreadForRepair(repair, repair.discord?.userId || null);
  await sendLog(`🔧 New repair request **#${repair.id}** — ${repair.item} (${repair.name})`);
}

export async function onRepairUpdated(repair) {
  if (!ready || !client) return;
  const threadId = repair.discord?.threadId;
  if (!threadId) return;
  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (!thread) return;

  await thread
    .send({ content: `**Status → ${statusLabel(repair.status)}**${repair.assignee ? ` · handled by <@${repair.assignee}>` : ''}` })
    .catch(() => {});

  // Archive/lock the thread once the item is done and gone.
  if (repair.status === 'picked_up' && thread.setArchived) {
    await thread.setArchived(true).catch(() => {});
  }
}

export async function onRentalCreated(rental, tool) {
  if (!discordEnabled) return;
  const embed = new EmbedBuilder()
    .setTitle(`🧰 Tool checked out — ${rental.toolName}`)
    .setColor(0x0ea5e9)
    .addFields(
      { name: 'Borrower', value: rental.name, inline: true },
      { name: 'Booth', value: rental.boothId || '—', inline: true },
      { name: 'Phone', value: rental.phone || '—', inline: true },
    )
    .setFooter({ text: `Rental #${rental.id} · return by end of day` })
    .setTimestamp(new Date(rental.timeOut));
  await sendLog(null, embed);
}
