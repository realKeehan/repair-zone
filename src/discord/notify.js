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

/**
 * Heart-react ticket convention, mirrored from the original Repair Zone system:
 *   💛 actively being worked on   💚 closed – success
 *   🩶 closed – partially resolved 💗 closed – unresolved
 * Each forum post carries a SINGLE heart reflecting the ticket's state. An
 * unclaimed/"active" ticket (status "open") has no heart, matching the manual
 * convention where you claim a reaction-less ticket by adding 💛.
 */
const STATUS_HEART = {
  claimed: '💛',
  in_progress: '💛',
  done: '💚',
  picked_up: '💚',
  unable: '💗',
  // 'open' → no reaction; 🩶 (partially resolved) has no matching status today.
};
const ALL_HEARTS = ['💛', '💚', '🩶', '💗'];

export function statusHeart(status) {
  return STATUS_HEART[status] || null;
}

/**
 * Make the forum post's heart reaction match the ticket status: remove any heart
 * the bot previously left that isn't current, then add the right one. Best-effort
 * (needs Add Reactions on the forum) — never blocks a status update if it fails.
 */
async function syncStatusHeart(starter, status) {
  try {
    if (!starter) return;
    const meId = starter.client.user.id;
    const target = STATUS_HEART[status] || null;

    for (const heart of ALL_HEARTS) {
      if (heart === target) continue;
      const reaction = starter.reactions.cache.find((r) => r.emoji.name === heart);
      if (reaction) await reaction.users.remove(meId).catch(() => {});
    }
    if (target) await starter.react(target).catch(() => {});
  } catch (err) {
    console.warn('[discord] Could not sync ticket heart:', err.message);
  }
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
    )
    .setFooter({ text: `The Repair Zone · via ${repair.source === 'discord' ? 'Discord' : 'website'}` })
    .setTimestamp(new Date(repair.createdAt));

  // Show who's handling it once a volunteer has claimed the ticket.
  if (repair.assignee) {
    const who = /^\d+$/.test(String(repair.assignee)) ? `<@${repair.assignee}>` : repair.assignee;
    embed.addFields({ name: 'Handled by', value: who, inline: true });
  }
  embed.addFields({ name: 'The request', value: (repair.issue || '—').slice(0, 1024) });

  // Forum channels are public, so contact details (phone / email / Discord tag)
  // AND internal staff notes are deliberately kept off the post — they live only
  // on the admin ticket.
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
  const replyPrompt = files.length ? '' : '\n💬 **Reply here with any other relevant info as needed** — photos, 3D print files, deadlines, or anything else that helps.';
  const content =
    `${mention}Thanks — your repair request is logged! A Repair Zone volunteer will pick it up shortly.` + replyPrompt;

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

  // Update the original post in place instead of posting a status message:
  // edit its embed (status colour/label + handler) and set the heart reaction.
  const starter = thread.fetchStarterMessage ? await thread.fetchStarterMessage().catch(() => null) : null;
  if (starter) {
    await starter.edit({ embeds: [buildRepairEmbed(repair)] }).catch((e) => console.warn('[discord] Could not update post embed:', e.message));
    // Reflect the status as the ticket's heart reaction (💛 / 💚 / 💗).
    await syncStatusHeart(starter, repair.status);
  }

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
