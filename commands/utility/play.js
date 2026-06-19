import { playSong }
    from '../../music/player.js';

import { createEmbed }
    from '../../embedStates.js';

export const name = 'play';

export async function execute(
    message,
    args
) {

    const query = args.join(' ');

    if (!query) {

        return message.channel.send({
            embeds: [
                createEmbed(
                    'fail',
                    'Nhập URL YouTube'
                )
            ]
        });
    }

    try {

        const result = await playSong(message, query);

        if (result?.error === 'VOICE_REQUIRED') {
            return message.channel.send('Bạn phải vào voice trước');
        }

        if (result.queued) {

            return message.channel.send({
                embeds: [
                    createEmbed(
                        'success',
                        `Da them ${result.amount} vao queue`
                    )
                ]
            })

        }


        return

    } catch (err) {

        console.error(err);

        return message.channel.send({
            embeds: [
                createEmbed(
                    'fail',
                    err.message
                )
            ]
        });
    }
}