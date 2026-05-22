
import { Client, GatewayIntentBits, Collection, User } from 'discord.js';
import fs from 'fs';
import path from 'path'
import 'dotenv/config'
import { getVoiceConnection } from '@discordjs/voice';

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

   if(message.author.bot) return;
   if(!message.content.startsWith('3m!')) return;
   const args = message.content.slice(3).trim().split(/ +/);
   const commandName = args.shift().toLowerCase()

   const command = client.commands.get(commandName);

   if(!command) return 
   await command.execute(message,args)
});

client.on('voiceStateUpdate',  async (oldState, newState) => {
    const connection = getVoiceConnection(oldState.guild.id)
    if(!connection) return;

    const botChannelId = oldState.guild.members.me.voice.channelId;
    if(!botChannelId) return;

    if(oldState.channelId === botChannelId && newState.channelId !== botChannelId){
        const channel = oldState.guild.channels.cache.get(botChannelId);
        const realUsers = channel.members.filter(member => !member.user.bot).size;


        if(realUsers === 0){
            connection.destroy();
        }
    }
})


client.login(TOKEN);