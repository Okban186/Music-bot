import { EmbedBuilder } from "discord.js";

export function createEmbed(type, description){
    const embed = new EmbedBuilder().setDescription(description)

    switch(type){
        case 'success':
            embed.setColor('Green')
            break;
        case 'fail':
            embed.setColor('Red')
            break;
        case 'info':
            embed.setColor('Blue')
            break;
        default:
            embed.setColor('Grey')
            break;
    }

    return embed
}