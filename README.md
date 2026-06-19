# Discord Music Bot

A simple and fast music bot for Discord. It uses Discord.js v14, @discordjs/voice, yt-dlp, and FFmpeg[cite: 1, 2, 3]. It is ready to run inside a Docker container.

## Features

* Fast Speed: It gets the song details and the audio link at the same time using only 1 request to yt-dlp[cite: 2].
* Playlist Support: It can load up to 20 songs from a YouTube playlist at once[cite: 2].
* Auto Leave: It leaves the voice channel immediately if all real users leave the room.
* Idle Timer: When the music ends, it waits for 3 minutes before leaving[cite: 2]. It cancels the timer if you add a new song[cite: 2].
* Error Handling: It sends a message if a link is blocked by DRM (copyright protection) and skips to the next song automatically[cite: 2].

## Requirements

If you run the bot without Docker, you need to install these tools on your computer:
* Node.js v22 or newer
* FFmpeg
* Python 3
* yt-dlp

If you use Docker, you do not need to install these tools manually.

## Environment Variables

Create a file named .env in the main folder and add these lines:

```env
DISCORD_TOKEN=your_discord_bot_token_here
