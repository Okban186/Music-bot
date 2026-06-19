
import { Client, GatewayIntentBits, Collection, User } from 'discord.js';
import fs from 'fs';
import path from 'path'
import 'dotenv/config'
import { getVoiceConnection } from '@discordjs/voice';
import http from 'http';
import { clearGuild } from './music/player.js';
import { createEmbed } from './embedStates.js';
import { getQueue } from './music/player.js';
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive');
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = '!'

client.commands = new Collection()
const folders = fs.readdirSync('./commands');

for (const folder of folders) {

    const files = fs
        .readdirSync(`./commands/${folder}`)
        .filter(file => file.endsWith('.js'));

    for (const file of files) {

        const command = await import(
            `./commands/${folder}/${file}`
        );

        client.commands.set(command.name, command);
    }
}
client.once('clientReady', () => {
    console.log(`Bot online: ${client.user.tag}`);
});

client.on('messageCreate', async message => {

    if (message.author.bot) return;
    if (!message.content.startsWith('3m!')) return;
    const args = message.content.slice(3).trim().split(/ +/);
    const commandName = args.shift().toLowerCase()

    const command = client.commands.get(commandName);

    if (!command) return
    await command.execute(message, args)
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const connection = getVoiceConnection(oldState.guild.id)
    if (!connection) return;

    const botChannelId = oldState.guild.members.me.voice.channelId;
    if (!botChannelId) return;

    if (oldState.channelId === botChannelId && newState.channelId !== botChannelId) {
        const channel = oldState.guild.channels.cache.get(botChannelId);
        const realUsers = channel.members.filter(member => !member.user.bot).size;


        if (realUsers === 0) {
            const queue = getQueue(oldState.guild.id);

            if (queue && queue.length > 0) {
                const textChannelId = queue[0].textChannelId;
                const textChannel = oldState.guild.channels.cache.get(textChannelId);

                if (textChannel) {
                    textChannel.send({
                        embeds: [
                            createEmbed('fail', '💤 Không còn ai trong voice chat cả, geeee GET OUT!!!.')
                        ]
                    }).catch(err => console.error("Không thể gửi tin nhắn thông báo:", err));
                }
            }

            clearGuild(oldState.guild.id);
            connection.destroy();
        }
    }
})


client.login(TOKEN);