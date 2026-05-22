import { createEmbed } from '../../embedStates.js';
import {
    getPlayer, getQueue
} from '../../music/player.js';

export const name = 'skip';

export async function execute(
    message
) {

    const botVoiceChannel = message.guild.members.me.voice.channel;

    if (!botVoiceChannel) {
        return message.channel.send({
            embeds: [
                createEmbed('fail', 'Bot hiện tại không ở trong phòng thoại nào để nhận lệnh!')
            ]
        });
    }

    const realUsersInChannel = botVoiceChannel.members.filter(member => !member.user.bot);
    if (realUsersInChannel.size === 0) {
        return message.channel.send({
            embeds: [
                createEmbed('fail', 'Không có ai trong phòng thoại với Bot, lệnh skip không hợp lệ!')
            ]
        });
    }

    const queue = getQueue(message.guild.id);
    if (queue.length === 0) {
        return message.channel.send({
            embeds: [
                createEmbed('fail', 'Hiện tại không có bài hát nào đang phát để skip!')
            ]
        });
    }

    const player =
        getPlayer(
            message.guild.id
        );

    player.stop(true);

    message.channel.send({embeds : [createEmbed('success','Đã skip bài')]});
}