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

// ─── Sessões do criembed ─────────────────────────────────────────────────────
const embedSessions = new Collection(); // userId -> { step, data }

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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ─── Intercepta respostas do criembed ────────────────────────────────────
  if (embedSessions.has(message.author.id)) {
    const session = embedSessions.get(message.author.id);
    const resposta = message.content.trim();

    // Cancelar a qualquer momento
    if (resposta.toLowerCase() === 'cancelar') {
      embedSessions.delete(message.author.id);
      return message.reply('❌ Criação de embed cancelada.');
    }

    switch (session.step) {
      case 'titulo':
        session.data.titulo = resposta === '-' ? null : resposta;
        session.step = 'descricao';
        await message.reply('**Descrição** (ou `-` para pular):');
        break;

      case 'descricao':
        session.data.descricao = resposta === '-' ? null : resposta;
        session.step = 'cor';
        await message.reply('**Cor** em hex (ex: `#FF0000`) (ou `-` para azul padrão):');
        break;

      case 'cor':
        if (resposta === '-') {
          session.data.cor = 0x5865F2;
        } else {
          const hex = resposta.replace('#', '');
          session.data.cor = parseInt(hex, 16) || 0x5865F2;
        }
        session.step = 'autor';
        await message.reply('**Autor** (nome que aparece no topo do embed) (ou `-` para pular):');
        break;

      case 'autor':
        session.data.autor = resposta === '-' ? null : resposta;
        session.step = 'rodape';
        await message.reply('**Rodapé** (texto pequeno no final) (ou `-` para pular):');
        break;

      case 'rodape':
        session.data.rodape = resposta === '-' ? null : resposta;
        session.step = 'botoes';
        session.data.botoes = [];
        await message.reply('**Botões** — manda o nome e link separado por `|`\nEx: `Grupo do Roblox | https://roblox.com/groups/123`\nQuando terminar, manda `pronto`.');
        break;

      case 'botoes':
        if (resposta.toLowerCase() === 'pronto') {
          // Monta e envia o embed
          const d = session.data;
          const embed = new EmbedBuilder().setColor(d.cor);
          if (d.titulo) embed.setTitle(d.titulo);
          if (d.descricao) embed.setDescription(d.descricao);
          if (d.autor) embed.setAuthor({ name: d.autor });
          if (d.rodape) embed.setFooter({ text: d.rodape });

          const components = [];
          if (d.botoes.length > 0) {
            // Divide em linhas de até 5 botões
            for (let i = 0; i < d.botoes.length; i += 5) {
              const row = new ActionRowBuilder();
              d.botoes.slice(i, i + 5).forEach(b => {
                row.addComponents(
                  new ButtonBuilder()
                    .setLabel(b.nome)
                    .setURL(b.url)
                    .setStyle(ButtonStyle.Link)
                );
              });
              components.push(row);
            }
          }

          embedSessions.delete(message.author.id);
          await message.channel.send({ embeds: [embed], components });
          await message.reply('✅ Embed enviado!');
        } else if (resposta.includes('|')) {
          if (session.data.botoes.length >= 25) {
            return message.reply('❌ Máximo de 25 botões atingido. Manda `pronto` pra enviar.');
          }
          const partes = resposta.split('|');
          const nome = partes[0].trim();
          const url = partes[1].trim();
          if (!url.startsWith('http')) {
            return message.reply('❌ Link inválido! Precisa começar com `http`. Tenta de novo.');
          }
          session.data.botoes.push({ nome, url });
          await message.reply(`✅ Botão **${nome}** adicionado! Manda mais ou `pronto` pra enviar.`);
        } else {
          await message.reply('❌ Formato inválido. Use `Nome | https://link.com` ou manda `pronto`.');
        }
        break;
    }
    return;
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const comando = args.shift().toLowerCase();

  // !ajuda
  if (comando === 'ajuda') {
    const embed = new EmbedBuilder()
      .setTitle('📋 Lista de Comandos')
      .setColor(0x5865F2)
      .addFields(
        { name: '`!criembed`', value: 'Cria embed personalizado com botões de link' },
        { name: '`!embed [título] | [descrição]`', value: 'Cria embed rápido' },
        { name: '`!clear [número]`', value: 'Apaga mensagens do canal (máx 100)' },
        { name: '`!raidinfo`', value: 'Mostra status do anti-raid' },
      )
      .setFooter({ text: 'Bot feito com discord.js' })
      .setTimestamp();
    return message.channel.send({ embeds: [embed] });
  }

  // !criembed
  if (comando === 'criembed') {
    embedSessions.set(message.author.id, { step: 'titulo', data: {} });
    return message.reply('🎨 Vamos criar seu embed! (manda `cancelar` a qualquer momento)\n\n**Título** (ou `-` para pular):');
  }

  // !embed rápido
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
    const msgs = await message.channel.messages.fetch({ limit: quantidade + 1 });
    await message.channel.bulkDelete(msgs, true).catch(() => {});
    const confirmacao = await message.channel.send(`✅ **${quantidade}** mensagens apagadas.`);
    setTimeout(() => confirmacao.delete().catch(() => {}), 3000);
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
