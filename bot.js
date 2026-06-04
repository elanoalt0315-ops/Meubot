const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, Collection, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

const TOKEN = process.env.TOKEN;
const PREFIX = '!';

// ─── Anti-Raid ───────────────────────────────────────────────────────────────
const joinTracker = new Collection();
const RAID_THRESHOLD = 5;
const RAID_WINDOW_MS = 8000;

client.once('ready', () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  client.user.setActivity('!ajuda | Anti-Raid ON', { type: 0 });
});

client.on('guildMemberAdd', async (member) => {
  const now = Date.now();
  const guild = member.guild;

  joinTracker.set(member.id, now);

  for (const [id, time] of joinTracker.entries()) {
    if (now - time > RAID_WINDOW_MS) joinTracker.delete(id);
  }

  if (joinTracker.size >= RAID_THRESHOLD) {
    for (const [id] of joinTracker.entries()) {
      const suspeito = guild.members.cache.get(id);
      if (suspeito) await suspeito.ban({ reason: '🚨 Anti-Raid automático' }).catch(() => {});
    }
    joinTracker.clear();

    const canal = guild.channels.cache.find(
      c => c.type === 0 && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)
    );
    if (canal) {
      const embed = new EmbedBuilder()
        .setTitle('🚨 RAID DETECTADO E BLOQUEADO')
        .setDescription('Vários usuários entraram ao mesmo tempo.\nTodos foram **banidos automaticamente**.')
        .setColor(0xFF0000)
        .setTimestamp();
      canal.send({ embeds: [embed] });
    }
  }
});

// ─── Comandos ────────────────────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const comando = args.shift().toLowerCase();

  // !ajuda
  if (comando === 'ajuda') {
    const embed = new EmbedBuilder()
      .setTitle('📋 Lista de Comandos')
      .setColor(0x5865F2)
      .addFields(
        { name: '`!embed [título] | [descrição]`', value: 'Cria um embed personalizado' },
        { name: '`!clear [número]`', value: 'Apaga mensagens do canal (máx 100)' },
        { name: '`!infoembed`', value: 'Embed com botões de link' },
        { name: '`!raidinfo`', value: 'Mostra status do anti-raid' },
        { name: '`!ajuda`', value: 'Mostra esta mensagem' },
      )
      .setFooter({ text: 'Bot feito com discord.js' })
      .setTimestamp();
    return message.channel.send({ embeds: [embed] });
  }

  // !embed
  if (comando === 'embed') {
    const texto = args.join(' ');
    const partes = texto.split('|');
    const titulo = partes[0]?.trim() || 'Embed';
    const descricao = partes[1]?.trim() || 'Sem descrição.';

    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descricao)
      .setColor(0x57F287)
      .setFooter({ text: `Enviado por ${message.author.username}` })
      .setTimestamp();

    await message.delete().catch(() => {});
    return message.channel.send({ embeds: [embed] });
  }

  // !clear
  if (comando === 'clear') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ Você não tem permissão para usar este comando.');
    }
    const quantidade = parseInt(args[0]);
    if (isNaN(quantidade) || quantidade < 1 || quantidade > 100) {
      return message.reply('❌ Use: `!clear [1-100]`');
    }
    await message.channel.bulkDelete(quantidade + 1, true).catch(() => {});
    const confirmacao = await message.channel.send(`✅ **${quantidade}** mensagens apagadas.`);
    setTimeout(() => confirmacao.delete().catch(() => {}), 3000);
  }

  // !infoembed
  if (comando === 'infoembed') {
    const embed = new EmbedBuilder()
      .setTitle('Exército Brasileiro - Informações')
      .setDescription('A seguir, você encontrará as informações necessárias para sua permanência no Exército Brasileiro. Leia atentamente e mantenha-se sempre comprometido com os valores da instituição.')
      .setColor(0x2B5219);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('✅  Grupo do Roblox')
        .setURL('https://www.roblox.com/groups/SEU_GRUPO')
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel('🎮  Jogo')
        .setURL('https://www.roblox.com/games/SEU_JOGO')
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel('📋  Constituição')
        .setURL('https://seulink.com/constituicao')
        .setStyle(ButtonStyle.Link),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('✅  Regras')
        .setURL('https://seulink.com/regras')
        .setStyle(ButtonStyle.Link),
    );

    await message.delete().catch(() => {});
    return message.channel.send({ embeds: [embed], components: [row, row2] });
  }

  // !raidinfo
  if (comando === 'raidinfo') {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Status Anti-Raid')
      .setColor(0xFEE75C)
      .addFields(
        { name: 'Status', value: '✅ Ativo', inline: true },
        { name: 'Threshold', value: `${RAID_THRESHOLD} joins`, inline: true },
        { name: 'Janela de tempo', value: `${RAID_WINDOW_MS / 1000} segundos`, inline: true },
        { name: 'Joins recentes', value: `${joinTracker.size}`, inline: true },
      )
      .setTimestamp();
    return message.channel.send({ embeds: [embed] });
  }
});

client.login(TOKEN);
