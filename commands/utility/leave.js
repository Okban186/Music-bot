import {
    getVoiceConnection
} from '@discordjs/voice';
import { createEmbed } from '../../embedStates.js';
import {
    clearGuild
}
from '../../music/player.js';
export const name = 'leave';

export async function execute(
    message,
    args,
    distube
) {

    const connection =
        getVoiceConnection(
            message.guild.id
        );

    const embedLeaveFail =
        createEmbed(
            'fail',
            'Bot khong o trong voice'
        );

    if (!connection) {

        return message.channel.send({
            embeds: [embedLeaveFail]
        });
    }

    clearGuild(
        message.guild.id
    );

    connection.destroy();

    const embedLeaveSucc =
        createEmbed(
            'success',
            'Đã rời voice và xóa queue'
        );

    return message.channel.send({
        embeds: [embedLeaveSucc]
    });
}