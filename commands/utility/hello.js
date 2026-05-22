export const name = 'hello'
export async function execute(message,args) {
    await message.channel.send('!Pong')
}