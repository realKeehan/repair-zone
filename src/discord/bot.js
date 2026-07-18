import {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  FileUploadBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { config } from '../config.js';
import * as db from '../db.js';
import * as notify from './notify.js';

/* Persistent component ids (stable across restarts). */
const IDS = {
  openButton: 'rz:request:open',
  modal: 'rz:request:modal',
  f_type: 'type',
  f_desc: 'desc',
  f_phone: 'phone',
  f_booth: 'booth',
  f_photos: 'photos',
};

/** The panel content (embed + "Request a Repair" button). Reused for the forum post. */
export function buildRequestPanel() {
  const embed = new EmbedBuilder()
    .setTitle('🔧 The Repair Zone — Request a Repair')
    .setColor(0xf97316)
    .setDescription(
      'Broken gear? Need a 3D print? We fix and make things for free at Open Sauce.\n\n' +
        'Tap the button below to open a short form (attach photos, or your 3D print files). ' +
        "We'll create a post for your request, ping you, and a volunteer will take it from there.\n\n" +
        '_All services are free and as-is. By submitting you agree to the Repair Zone Terms & Conditions._',
    )
    .setFooter({ text: 'The Repair Zone · Open Sauce' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.openButton).setLabel('Request a Repair').setStyle(ButtonStyle.Success).setEmoji('🔧'),
  );
  return { embeds: [embed], components: [row] };
}

/** Modal using Components-v2 Label wrappers (discord.js ≥14.27). Max 5 labels. */
function buildRequestModal() {
  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId(IDS.f_type)
    .setRequired(true)
    .addOptions(db.REPAIR_TYPES.map((t) => ({ label: t.label, value: t.value, emoji: t.emoji })));

  const desc = new TextInputBuilder()
    .setCustomId(IDS.f_desc)
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('What is the item and what do you need? Smells/sparks/error messages, print dimensions, etc.')
    .setMaxLength(1000)
    .setRequired(true);

  const phone = new TextInputBuilder()
    .setCustomId(IDS.f_phone)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 555-123-4567')
    .setMaxLength(40)
    .setRequired(false);

  const booth = new TextInputBuilder()
    .setCustomId(IDS.f_booth)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Booth # or where we can find you at the con')
    .setMaxLength(80)
    .setRequired(true);

  const photos = new FileUploadBuilder().setCustomId(IDS.f_photos).setMinValues(0).setMaxValues(5).setRequired(false);

  return new ModalBuilder()
    .setCustomId(IDS.modal)
    .setTitle('Repair / Build Request')
    .addLabelComponents(
      new LabelBuilder().setLabel('What do you need?').setStringSelectMenuComponent(typeSelect),
      new LabelBuilder().setLabel('Describe the request').setTextInputComponent(desc),
      new LabelBuilder().setLabel('Phone number (optional)').setDescription('So we can reach you when it\'s ready — we can also ping you here on Discord').setTextInputComponent(phone),
      new LabelBuilder().setLabel('Booth ID / location').setTextInputComponent(booth),
      new LabelBuilder().setLabel('Photos or 3D files (optional)').setDescription('Attach up to 5 files — photos of the item, or your 3D print files (STL, 3MF, STEP, OBJ…)').setFileUploadComponent(photos),
    );
}

/** Create the request panel as a pinned FORUM POST in the configured forum channel. */
async function postPanelToForum(interaction) {
  const forum = await interaction.client.channels.fetch(config.discord.forumChannelId).catch(() => null);
  if (!forum || forum.type !== ChannelType.GuildForum) {
    return interaction.reply({
      content: '⚠️ DISCORD_FORUM_CHANNEL_ID is not set to a **forum channel**. Set it and try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
  const panel = buildRequestPanel();
  const infoTag = (forum.availableTags || []).find((t) => /info|start|read/i.test(t.name));
  const post = await forum.threads.create({
    name: '📌 Request a Repair — start here',
    autoArchiveDuration: 10080,
    appliedTags: infoTag ? [infoTag.id] : undefined,
    message: panel,
  });
  await post.pin().catch(() => {});
  await post.setLocked(true).catch(() => {}); // keep the panel post tidy; button still works
  return interaction.reply({ content: `✅ Posted the request panel: <#${post.id}> (pinned in the forum).`, flags: MessageFlags.Ephemeral });
}

/* ── slash command handlers ──────────────────────────────── */

async function handleSlash(interaction) {
  const { commandName } = interaction;

  if (commandName === 'panel') return postPanelToForum(interaction);

  if (commandName === 'queue') {
    const open = db.listRepairs().filter((r) => !['picked_up', 'unable'].includes(r.status));
    if (!open.length) return interaction.reply({ content: '🎉 The queue is empty — nice work.', flags: MessageFlags.Ephemeral });
    const lines = open.slice(0, 20).map((r) => {
      const t = db.repairTypeMeta(r.type);
      return `${t.emoji} **#${r.id}** ${notify.statusLabel(r.status)} · ${r.item} — ${r.name}${r.assignee ? ` (${fmtAssignee(r.assignee)})` : ''}`;
    });
    return interaction.reply({ content: `**Open requests (${open.length})**\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
  }

  if (commandName === 'claim') {
    const id = interaction.options.getInteger('id', true);
    const r = db.getRepair(id);
    if (!r) return interaction.reply({ content: `No request #${id}.`, flags: MessageFlags.Ephemeral });
    const updated = db.updateRepair(id, { assignee: interaction.user.id, status: r.status === 'open' ? 'claimed' : r.status });
    notify.onRepairUpdated(updated).catch(() => {});
    return interaction.reply({ content: `🙌 You claimed request **#${id}** — ${r.item}.`, flags: MessageFlags.Ephemeral });
  }

  if (commandName === 'status') {
    const id = interaction.options.getInteger('id', true);
    const value = interaction.options.getString('to', true);
    const r = db.getRepair(id);
    if (!r) return interaction.reply({ content: `No request #${id}.`, flags: MessageFlags.Ephemeral });
    const updated = db.updateRepair(id, { status: value });
    notify.onRepairUpdated(updated).catch(() => {});
    return interaction.reply({ content: `✅ Request **#${id}** → ${notify.statusLabel(value)}.`, flags: MessageFlags.Ephemeral });
  }

  if (commandName === 'tools') {
    const tools = db.listTools();
    const fmt = (t) => `${t.status === 'available' ? '🟢' : t.status === 'out' ? '🔴' : '🛠️'} ${t.name}${t.status === 'out' && t.borrowerName ? ` — ${t.borrowerName}` : ''}`;
    const avail = tools.filter((t) => t.status === 'available');
    const out = tools.filter((t) => t.status !== 'available');
    const body =
      `**Available (${avail.length})**\n${avail.map(fmt).join('\n') || '—'}\n\n` +
      `**Out / unavailable (${out.length})**\n${out.map(fmt).join('\n') || '—'}`;
    return interaction.reply({ content: body.slice(0, 1900), flags: MessageFlags.Ephemeral });
  }
}

function fmtAssignee(a) {
  return /^\d+$/.test(String(a)) ? `<@${a}>` : a;
}

/* ── component (button + modal) handlers ─────────────────── */

async function handleButton(interaction) {
  if (interaction.customId === IDS.openButton) {
    return interaction.showModal(buildRequestModal());
  }
}

async function handleModal(interaction) {
  if (interaction.customId !== IDS.modal) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const typeValue = interaction.fields.getStringSelectValues(IDS.f_type)?.[0] || 'repair';
  const description = interaction.fields.getTextInputValue(IDS.f_desc)?.trim() || '';
  const phone = interaction.fields.getTextInputValue(IDS.f_phone)?.trim() || '';
  const booth = interaction.fields.getTextInputValue(IDS.f_booth)?.trim() || '';

  let fileUrls = [];
  try {
    const uploaded = interaction.fields.getUploadedFiles(IDS.f_photos);
    if (uploaded) fileUrls = [...uploaded.values()].map((a) => a.url).filter(Boolean);
  } catch {
    /* no file component / none uploaded */
  }

  const requesterName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  // Derive a short item title from the description's first line.
  const firstLine = description.split('\n')[0].trim();
  const item = (firstLine.length > 60 ? firstLine.slice(0, 57) + '…' : firstLine) || db.repairTypeMeta(typeValue).label;

  const repair = db.createRepair({
    source: 'discord',
    type: typeValue,
    name: requesterName,
    phone,
    boothId: booth,
    item,
    issue: description,
    contact: `Discord: ${interaction.user.tag}`,
    agreedTerms: true,
    discord: { userId: interaction.user.id, guildId: interaction.guildId },
  });

  try {
    const post = await notify.createForumPostForRepair(repair, { mentionUserId: interaction.user.id, files: fileUrls });
    await notify.sendLog(`🔧 New ${db.repairTypeMeta(typeValue).label} request **#${repair.id}** — ${item} (${requesterName}) via Discord`);
    const link = post ? `\n➡️ <#${post.id}>` : '';
    const photoNote = fileUrls.length ? ` I attached your ${fileUrls.length} file(s).` : ' You can drop photos or 3D files in the thread.';
    await interaction.editReply({ content: `✅ Thanks, **${requesterName}**! Request **#${repair.id}** is logged.${link}${photoNote}` });
  } catch (err) {
    console.error('[discord] modal submit / forum post failed:', err);
    await interaction.editReply({
      content: `✅ Your request **#${repair.id}** was saved, but I couldn't create the forum post (check the bot's permissions on the forum channel). A volunteer will still see it in the queue.`,
    });
  }
}

/* ── bootstrap ───────────────────────────────────────────── */

export async function startBot() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[discord] Logged in as ${c.user.tag}`);
    notify.setClient(client);
    await notify.ensureForumTags();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) return await handleSlash(interaction);
      if (interaction.isButton()) return await handleButton(interaction);
      if (interaction.isModalSubmit()) return await handleModal(interaction);
    } catch (err) {
      console.error('[discord] interaction error:', err);
      const msg = { content: '⚠️ Something went wrong handling that. Please try again or find a volunteer.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred || interaction.replied) interaction.editReply(msg).catch(() => {});
      else interaction.reply(msg).catch(() => {});
    }
  });

  await client.login(config.discord.botToken);
  return client;
}
