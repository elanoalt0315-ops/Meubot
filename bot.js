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

const joinTracker = new Collection();
const RAID_THRESHOLD = 5;
const RAID_WINDOW_MS = 8000;
const embedSessions = new Collection();

client.once('ready', () => {
  console.log('Bot online como ' + client.user.tag);
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
      if (suspeito) await suspeito.ban({ reason: 'Anti-Raid automatico' }).catch(() => {});
    }
    joinTracker.clear();
    const canal = guild.channels.cache.find(
      c => c.type === 0 && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)
    );
    if (canal) {
      const embed = new EmbedBuilder()
        .setTitle('RAID DETECTADO E BLOQUEADO')
        .setDescription('Varios usuarios entraram ao mesmo tempo.\nTodos foram **banidos automaticamente**.')
        .setColor(0xFF0000)
        .setTimestamp();
      canal.send({ embeds: [embed] });
    }
  }
});

// ─── Botoes de cargo clicados ─────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('role_')) return;

  const roleId = interaction.customId.replace('role_', '');
  const member = interaction.member;

  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: 'Cargo removido!', ephemeral: true });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: 'Cargo adicionado!', ephemeral: true });
    }
  } catch (e) {
    await interaction.reply({ content: 'Erro ao modificar cargo. Verifique se o bot tem permissao.', ephemeral: true });
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ─── Sessoes ativas ───────────────────────────────────────────────────────
  if (embedSessions.has(message.author.id)) {
    const session = embedSessions.get(message.author.id);
    const resposta = message.content.trim();

    if (resposta.toLowerCase() === 'cancelar') {
      embedSessions.delete(message.author.id);
      return message.reply('Criacao cancelada.');
    }

    if (session.step === 'titulo') {
      session.data.titulo = resposta === '-' ? null : resposta;
      session.step = 'descricao';
      return message.reply('**Descricao** (ou `-` para pular):');
    }

    if (session.step === 'descricao') {
      session.data.descricao = resposta === '-' ? null : resposta;
      session.step = 'cor';
      return message.reply('**Cor** em hex (ex: `#FF0000`) (ou `-` para azul padrao):');
    }

    if (session.step === 'cor') {
      session.data.cor = resposta === '-' ? 0x5865F2 : (parseInt(resposta.replace('#', ''), 16) || 0x5865F2);
      session.step = 'autor';
      return message.reply('**Autor** (nome no topo) (ou `-` para pular):');
    }

    if (session.step === 'autor') {
      session.data.autor = resposta === '-' ? null : resposta;
      session.step = 'rodape';
      return message.reply('**Rodape** (texto pequeno no final) (ou `-` para pular):');
    }

    if (session.step === 'rodape') {
      session.data.rodape = resposta === '-' ? null : resposta;
      session.step = 'botoes';
      session.data.botoes = [];

      if (session.type === 'role') {
        return message.reply('**Botoes de cargo** - manda o nome e ID do cargo separado por |\nEx: Importante | 123456789012345678\nQuando terminar manda: pronto\n\nPara pegar o ID do cargo: Configuracoes do servidor > Cargos > segura o cargo > Copiar ID');
      } else {
        return message.reply('**Botoes de link** - manda o nome e link separado por |\nEx: Grupo do Roblox | https://roblox.com/groups/123\nQuando terminar manda: pronto');
      }
    }

    if (session.step === 'botoes') {
      if (resposta.toLowerCase() === 'pronto') {
        const d = session.data;
        const embed = new EmbedBuilder().setColor(d.cor);
        if (d.titulo) embed.setTitle(d.titulo);
        if (d.descricao) embed.setDescription(d.descricao);
        if (d.autor) embed.setAuthor({ name: d.autor });
        if (d.rodape) embed.setFooter({ text: d.rodape });

        const components = [];
        if (d.botoes.length > 0) {
          for (let i = 0; i < d.botoes.length; i += 5) {
            const row = new ActionRowBuilder();
            d.botoes.slice(i, i + 5).forEach(b => {
              if (session.type === 'role') {
                row.addComponents(
                  new ButtonBuilder()
                    .setLabel(b.nome)
                    .setCustomId('role_' + b.valor)
                    .setStyle(ButtonStyle.Secondary)
                );
              } else {
                row.addComponents(
                  new ButtonBuilder()
                    .setLabel(b.nome)
                    .setURL(b.valor)
                    .setStyle(ButtonStyle.Link)
                );
              }
            });
            components.push(row);
          }
        }

        embedSessions.delete(message.author.id);
        await message.channel.send({ embeds: [embed], components });
        return message.reply('Embed enviado!');
      }

      if (resposta.includes('|')) {
        if (session.data.botoes.length >= 25) {
          return message.reply('Maximo de 25 botoes. Manda pronto para enviar.');
        }
        const partes = resposta.split('|');
        const nome = partes[0].trim();
        const valor = partes[1].trim();

        if (session.type === 'link' && !valor.startsWith('http')) {
          return message.reply('Link invalido! Precisa comecar com http.');
        }

        session.data.botoes.push({ nome, valor });
        return message.reply('Botao "' + nome + '" adicionado! Manda mais ou pronto para enviar.');
      }

      return message.reply('Formato invalido. Use: Nome | Valor ou manda pronto');
    }

    return;
  }

  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const comando = args.shift().toLowerCase();

  if (comando === 'ajuda') {
    const embed = new EmbedBuilder()
      .setTitle('Lista de Comandos')
      .setColor(0x5865F2)
      .addFields(
        { name: '!criembed', value: 'Embed com botoes de link personalizados' },
        { name: '!rolemembed', value: 'Embed com botoes que dao/removem cargos' },
        { name: '!embed [titulo] | [descricao]', value: 'Embed rapido' },
        { name: '!clear [numero]', value: 'Apaga mensagens (max 100)' },
        { name: '!raidinfo', value: 'Status do anti-raid' },
      )
      .setFooter({ text: 'Bot feito com discord.js' })
      .setTimestamp();
    return message.channel.send({ embeds: [embed] });
  }

  if (comando === 'criembed') {
    embedSessions.set(message.author.id, { step: 'titulo', type: 'link', data: {} });
    return message.reply('Vamos criar o embed! (manda cancelar para sair)\n\n**Titulo** (ou `-` para pular):');
  }

  if (comando === 'rolemembed') {
    embedSessions.set(message.author.id, { step: 'titulo', type: 'role', data: {} });
    return message.reply('Vamos criar o embed de cargos! (manda cancelar para sair)\n\n**Titulo** (ou `-` para pular):');
  }

  if (comando === 'embed') {
    const texto = args.join(' ');
    const partes = texto.split('|');
    const titulo = partes[0].trim() || 'Embed';
    const descricao = partes[1] ? partes[1].trim() : 'Sem descricao.';
    const embed = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descricao)
      .setColor(0x57F287)
      .setFooter({ text: 'Enviado por ' + message.author.username })
      .setTimestamp();
    await message.delete().catch(() => {});
    return message.channel.send({ embeds: [embed] });
  }

  if (comando === 'clear') {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('Voce nao tem permissao para usar este comando.');
    }
    const quantidade = parseInt(args[0]);
    if (isNaN(quantidade) || quantidade < 1 || quantidade > 100) {
      return message.reply('Use: !clear [1-100]');
    }
    const msgs = await message.channel.messages.fetch({ limit: quantidade + 1 });
    await message.channel.bulkDelete(msgs, true).catch(() => {});
    const confirmacao = await message.channel.send(quantidade + ' mensagens apagadas.');
    setTimeout(() => confirmacao.delete().catch(() => {}), 3000);
  }

  if (comando === 'raidinfo') {
    const embed = new EmbedBuilder()
      .setTitle('Status Anti-Raid')
      .setColor(0xFEE75C)
      .addFields(
        { name: 'Status', value: 'Ativo', inline: true },
        { name: 'Threshold', value: RAID_THRESHOLD + ' joins', inline: true },
        { name: 'Janela de tempo', value: (RAID_WINDOW_MS / 1000) + ' segundos', inline: true },
        { name: 'Joins recentes', value: '' + joinTracker.size, inline: true },
      )
      .setTimestamp();
    return message.channel.send({ embeds: [embed] });
  }
});

client.login(TOKEN);
