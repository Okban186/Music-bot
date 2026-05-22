import {getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus,} from '@discordjs/voice'
import { EmbedBuilder } from 'discord.js';
import { createEmbed } from '../../embedStates.js';
export const name = 'join'
export async function execute(message,args) {
    const voiceChannel = message.member?.voice?.channel;
    const embedInVoice = createEmbed('fail','Bạn phải vào voice trước')
    if (!voiceChannel) {
        return message.channel.send({embeds : [embedInVoice]});
    }

    const connection = getVoiceConnection(message.guild.id);
    const botInVoice = message.guild.members.me.voice.channel;
    const embedJoinFail = createEmbed('fail','Bot da o trong voice')
    if (connection && botInVoice) {
        return message.channel.send({embeds : [embedJoinFail]});
    }

    joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true
    });
    const embedJoinSucc = createEmbed('success','Đã join voice!')
    return message.channel.send({embeds : [embedJoinSucc]});
}




