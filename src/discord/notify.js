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
  const type = db.repairTypeMeta(repair.type);
  const embed = new EmbedBuilder()
    .setTitle(`Repair #${repair.id} — ${repair.item}`)
    .setColor(meta.color)
    .addFields(
      { name: 'Requester', value: repair.name || '—', inline: true },
      { name: 'Booth / Location', value: repair.boothId || '—', inline: true },
      { name: 'Type', value: `${type.emoji} ${type.label}`, inline: true },
      { name: 'Status', value: meta.label, inline: true },
      { name: 'The request', value: (repair.issue || '—').slice(0, 1024) },
    )
    .setFooter({ text: `The Repair Zone · via ${repair.source === 'discord' ? 'Discord' : 'website'}` })
    .setTimestamp(new Date(repair.createdAt));

  // Forum channels are public, so contact details (phone / email / Discord tag)
  // are deliberately left out of the post — they live only on the admin ticket.
  if (repair.notes) embed.addFields({ name: 'Notes', value: repair.notes.slice(0, 1024) });
  return embed;
}

async function fetchForum() {
  if (!ready || !client || !config.discord.forumChannelId) return null;
  const channel = await client.channels.fetch(config.discord.forumChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildForum) {
    console.warn('[discord] DISCORD_FORUM_CHANNEL_ID is not a forum channel; skipping forum post.');
    return null;
  }
  return channel;
}

/**
 * Make sure the forum has a tag for each request type (e.g. "3D Print").
 * Best-effort and non-destructive: only adds missing tags, never removes.
 * Needs Manage Channels; if that's missing we just skip (posts still work).
 */
export async function ensureForumTags() {
  const forum = await fetchForum();
  if (!forum) return;
  try {
    const existing = forum.availableTags || [];
    const have = new Set(existing.map((t) => t.name.toLowerCase()));
    const missing = db.REPAIR_TYPES.filter((t) => !have.has(t.tag.toLowerCase()));
    if (!missing.length || existing.length + missing.length > 20) return;
    const next = [
      ...existing.map((t) => ({ id: t.id, name: t.name, moderated: t.moderated, emoji: t.emoji })),
      ...missing.map((t) => ({ name: t.tag, moderated: false, emoji: t.emoji })),
    ];
    await forum.setAvailableTags(next);
    console.log(`[discord] Ensured forum tags: added ${missing.map((t) => t.tag).join(', ')}`);
  } catch (err) {
    console.warn('[discord] Could not auto-create forum tags (need Manage Channels?):', err.message);
  }
}

function tagIdForType(forum, type) {
  const meta = db.repairTypeMeta(type);
  const tag = (forum.availableTags || []).find((t) => t.name.toLowerCase() === meta.tag.toLowerCase());
  return tag ? [tag.id] : undefined;
}

/**
 * Create a FORUM POST for a repair request and record the post id on the repair.
 * Used by both the website submission path and the Discord modal.
 *  - mentionUserId: if set, the requester is pinged in the starter message.
 *  - files: array of attachments/URLs (photos the user uploaded) to attach.
 */
export async function createForumPostForRepair(repair, { mentionUserId = null, files = [] } = {}) {
  const forum = await fetchForum();
  if (!forum) return null;

  const type = db.repairTypeMeta(repair.type);
  const title = `${type.emoji} #${repair.id} · ${repair.item} — ${repair.name}`.slice(0, 96);
  const mention = mentionUserId ? `<@${mentionUserId}> ` : '';
  const askPhotos = files.length ? '' : '\n📎 **Reply here with photos, or your 3D print files** — it really helps us diagnose or print.';
  const content =
    `${mention}Thanks — your repair request is logged! A Repair Zone volunteer will pick it up shortly.` + askPhotos;

  let post;
  try {
    post = await forum.threads.create({
      name: title,
      autoArchiveDuration: 1440,
      appliedTags: tagIdForType(forum, repair.type),
      message: { content, embeds: [buildRepairEmbed(repair)], files: files.length ? files : undefined },
    });
  } catch (err) {
    // Retry once without files (e.g. an upload URL expired) so the post still lands.
    if (files.length) {
      console.warn('[discord] Forum post with files failed, retrying without:', err.message);
      post = await forum.threads.create({
        name: title,
        autoArchiveDuration: 1440,
        appliedTags: tagIdForType(forum, repair.type),
        message: { content: content + '\n_(couldn\'t attach uploaded files — please re-post them here)_', embeds: [buildRepairEmbed(repair)] },
      });
    } else {
      throw err;
    }
  }

  db.updateRepair(repair.id, {
    discord: { threadId: post.id, guildId: forum.guildId, userId: mentionUserId || repair.discord?.userId || null },
  });
  return post;
}

/** Send a short log line to the staff log channel or webhook (whichever is set). */
export async function sendLog(text, embed = null) {
  const payload = {};
  if (text) payload.content = text;
  if (embed) payload.embeds = [embed];

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
  // Website submissions have no Discord user to ping and no in-modal uploads.
  await createForumPostForRepair(repair, { mentionUserId: repair.discord?.userId || null });
  await sendLog(`🔧 New repair request **#${repair.id}** — ${repair.item} (${repair.name})`);
}

export async function onRepairUpdated(repair) {
  if (!ready || !client) return;
  const threadId = repair.discord?.threadId;
  if (!threadId) return;
  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (!thread) return;

  await thread
    .send({ content: `**Status → ${statusLabel(repair.status)}**${repair.assignee ? ` · handled by ${/^\d+$/.test(String(repair.assignee)) ? `<@${repair.assignee}>` : repair.assignee}` : ''}` })
    .catch(() => {});

  if (repair.status === 'picked_up' && thread.setArchived) {
    await thread.setArchived(true).catch(() => {});
  }
}

export async function onRentalCreated(rental) {
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
