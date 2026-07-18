import {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
  f_name: 'name',
  f_phone: 'phone',
  f_item: 'item',
  f_issue: 'issue',
  f_info: 'info',
};

/** The panel message that lives in a channel with the "Request a Repair" button. */
export function buildRequestPanel() {
  const embed = new EmbedBuilder()
    .setTitle('🔧 The Repair Zone — Request a Repair')
    .setColor(0xf97316)
    .setDescription(
      'Broken gear? We fix things for free at Open Sauce.\n\n' +
        'Tap the button below to open a short form. We\'ll create a private thread for your request, ' +
        'ping you, and a volunteer will take it from there.\n\n' +
        '_All services are provided free of charge, as-is. By submitting you agree to the Repair Zone Terms & Conditions._',
    )
    .setFooter({ text: 'The Repair Zone · Open Sauce' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(IDS.openButton).setLabel('Request a Repair').setStyle(ButtonStyle.Success).setEmoji('🔧'),
  );
  return { embeds: [embed], components: [row] };
}

function buildRequestModal() {
  const modal = new ModalBuilder().setCustomId(IDS.modal).setTitle('Repair Request');

  const name = new TextInputBuilder()
    .setCustomId(IDS.f_name)
    .setLabel('Your name')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true);

  const phone = new TextInputBuilder()
    .setCustomId(IDS.f_phone)
    .setLabel('Phone number (so we can reach you)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 555-123-4567')
    .setMaxLength(40)
    .setRequired(true);

  const item = new TextInputBuilder()
    .setCustomId(IDS.f_item)
    .setLabel('What needs fixing?')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. Laptop, drone, 3D print, jacket zipper…')
    .setMaxLength(150)
    .setRequired(true);

  const issue = new TextInputBuilder()
    .setCustomId(IDS.f_issue)
    .setLabel('Describe the problem')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('What is wrong, what have you tried, any smells/sparks/error messages?')
    .setMaxLength(1000)
    .setRequired(true);

  const info = new TextInputBuilder()
    .setCustomId(IDS.f_info)
    .setLabel('Booth ID / location + other info (optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(phone),
    new ActionRowBuilder().addComponents(item),
    new ActionRowBuilder().addComponents(issue),
    new ActionRowBuilder().addComponents(info),
  );
  return modal;
}

/* ── slash command handlers ──────────────────────────────── */

async function handleSlash(interaction) {
  const { commandName } = interaction;

  if (commandName === 'panel') {
    await interaction.channel.send(buildRequestPanel());
    return interaction.reply({ content: '✅ Request panel posted in this channel.', flags: MessageFlags.Ephemeral });
  }

  if (commandName === 'queue') {
    const open = db.listRepairs().filter((r) => !['picked_up', 'unable'].includes(r.status));
    if (!open.length) return interaction.reply({ content: '🎉 The queue is empty — nice work.', flags: MessageFlags.Ephemeral });
    const lines = open.slice(0, 20).map((r) => `**#${r.id}** ${notify.statusLabel(r.status)} · ${r.item} — ${r.name}${r.assignee ? ` (<@${r.assignee}>)` : ''}`);
    return interaction.reply({ content: `**Open repairs (${open.length})**\n${lines.join('\n')}`, flags: MessageFlags.Ephemeral });
  }

  if (commandName === 'claim') {
    const id = interaction.options.getInteger('id', true);
    const r = db.getRepair(id);
    if (!r) return interaction.reply({ content: `No repair #${id}.`, flags: MessageFlags.Ephemeral });
    const updated = db.updateRepair(id, { assignee: interaction.user.id, status: r.status === 'open' ? 'claimed' : r.status });
    notify.onRepairUpdated(updated).catch(() => {});
    return interaction.reply({ content: `🙌 You claimed repair **#${id}** — ${r.item}.`, flags: MessageFlags.Ephemeral });
  }

  if (commandName === 'status') {
    const id = interaction.options.getInteger('id', true);
    const value = interaction.options.getString('to', true);
    const r = db.getRepair(id);
    if (!r) return interaction.reply({ content: `No repair #${id}.`, flags: MessageFlags.Ephemeral });
    const updated = db.updateRepair(id, { status: value });
    notify.onRepairUpdated(updated).catch(() => {});
    return interaction.reply({ content: `✅ Repair **#${id}** → ${notify.statusLabel(value)}.`, flags: MessageFlags.Ephemeral });
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

/* ── component (button + modal) handlers ─────────────────── */

async function handleButton(interaction) {
  if (interaction.customId === IDS.openButton) {
    return interaction.showModal(buildRequestModal());
  }
}

async function handleModal(interaction) {
  if (interaction.customId !== IDS.modal) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const get = (id) => interaction.fields.getTextInputValue(id)?.trim() || '';
  const repair = db.createRepair({
    source: 'discord',
    name: get(IDS.f_name),
    phone: get(IDS.f_phone),
    item: get(IDS.f_item),
    issue: get(IDS.f_issue),
    boothId: '',
    notes: get(IDS.f_info),
    contact: `Discord: ${interaction.user.tag}`,
    agreedTerms: true,
    discord: { userId: interaction.user.id, guildId: interaction.guildId },
  });

  try {
    const thread = await notify.createForumThreadForRepair(repair, interaction.user.id);
    await notify.sendLog(`🔧 New repair request **#${repair.id}** — ${repair.item} (${repair.name}) via Discord`);
    const link = thread ? `\n➡️ <#${thread.id}>` : '';
    await interaction.editReply({
      content: `✅ Thanks, **${repair.name}**! Your repair request **#${repair.id}** is logged.${link}\nWe pinged you in the thread — please drop any **photos/files** there.`,
    });
  } catch (err) {
    console.error('[discord] modal submit / forum create failed:', err);
    await interaction.editReply({
      content: `✅ Your request **#${repair.id}** was saved, but I couldn't open a forum thread (check the bot's channel permissions). A volunteer will still see it in the queue.`,
    });
  }
}

/* ── bootstrap ───────────────────────────────────────────── */

export async function startBot() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (c) => {
    console.log(`[discord] Logged in as ${c.user.tag}`);
    notify.setClient(client);
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
