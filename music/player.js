import {
    createAudioPlayer,
    createAudioResource,
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    StreamType
} from '@discordjs/voice';
import { spawn } from 'child_process';
import prism from 'prism-media';

const players = new Map();
const queues = new Map();

// --- CÁC HÀM TIỆN ÍCH HỆ THỐNG ---

export function getQueue(guildId) {
    if (!queues.has(guildId)) {
        queues.set(guildId, []);
    }
    return queues.get(guildId);
}

export function getPlayer(guildId) {
    if (!players.has(guildId)) {
        const player = createAudioPlayer();
        player.on('error', err => {
            console.error('Player error:', err);
        });
        players.set(guildId, player);
    }
    return players.get(guildId);
}

function isPlaylist(url) {
    if (!url || typeof url !== 'string') return false;
    // Chấp nhận mọi link có chứa tham số list= (bao gồm cả playlist thường, Mix và Radio)
    return /[?&]list=([^#\&\?]+)/.test(url);
}

function formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// --- CÁC HÀM TƯƠNG TÁC VỚI YT-DLP ---

async function getPlaylistVideos(url) {
    return await new Promise((resolve, reject) => {
        const ytDlp = spawn('yt-dlp', [
            '--flat-playlist',
            '--yes-playlist',   
            '-i',               // Bỏ qua video chết/ẩn
            '--playlist-end', '20', // Giới hạn chỉ lấy tối đa 20 bài trong playlist
            '--print', 'id',    // Lệnh tối ưu nhất để lấy ID dòng lệnh dạng chữ, cực kì nhanh
            '--no-warnings',
            url
        ]);

        let data = '';
        const timeout = setTimeout(() => {
            ytDlp.kill();
            reject(new Error('Không thể tải danh sách phát (Quá thời gian chờ)'));
        }, 15000);

        ytDlp.stdout.on('data', chunk => data += chunk.toString());

        ytDlp.on('close', code => {
            clearTimeout(timeout);
            
            // Tách các dòng ID ra thành mảng
            const lines = data.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            // Lọc chuẩn ID video Youtube dài đúng 11 ký tự
            const videoIds = lines.filter(id => id.length === 11); 

            if (videoIds.length > 0) {
                const videos = videoIds.map(id => `https://www.youtube.com/watch?v=${id}`);
                return resolve(videos);
            }
            if (code !== 0) return reject(new Error('Không thể phân tích Playlist này'));
            resolve([]);
        });
    });
}

async function getVideoInfo(url) {
    return await new Promise((resolve, reject) => {
        const ytDlp = spawn('yt-dlp', ['-J', '--no-playlist', url]);
        let data = '';
        let error = '';

        ytDlp.stdout.on('data', chunk => data += chunk.toString());
        ytDlp.stderr.on('data', chunk => error += chunk.toString());

        ytDlp.on('close', code => {
            if (code !== 0) return reject(new Error(error));
            try {
                resolve(JSON.parse(data));
            } catch (err) {
                reject(err);
            }
        });

        setTimeout(() => {
            ytDlp.kill();
            reject(new Error('Không thể lấy thông tin video (Timeout)'));
        }, 15000);
    });
}

async function getStreamUrl(url) {
    return await new Promise((resolve, reject) => {
        const ytDlp = spawn('yt-dlp', [
            '--no-playlist',
            '--format', 'bestaudio[ext=webm]/bestaudio',
            '--get-url',
            '--no-warnings',
            '--quiet',
            url
        ]);

        let data = '';
        const timeout = setTimeout(() => {
            ytDlp.kill();
            reject(new Error('Không thể tải luồng phát (Timeout)'));
        }, 15000);

        ytDlp.stdout.on('data', chunk => data += chunk.toString());

        ytDlp.on('close', code => {
            clearTimeout(timeout);
            if (code !== 0) return reject(new Error('Không lấy được đường dẫn stream'));
            resolve(data.trim());
        });
    });
}

// --- HÀM XỬ LÝ PHÁT NHẠC CHÍNH ---

export async function playSong(message, url) {
    const voiceChannel = message.guild.channels.cache.find(
        channel => channel.isVoiceBased() && channel.members.filter(m => !m.user.bot).size > 0
    );
    if (!voiceChannel) {
        throw new Error('Hiện tại không có người dùng nào trong các kênh phòng thoại cả!');
    }

    const queue = getQueue(message.guild.id);
    const initialQueueLength = queue.length; // Lưu lại trạng thái hàng đợi trước khi nạp thêm bài

    if (isPlaylist(url)) {
        const videos = await getPlaylistVideos(url);
        if (videos.length === 0) {
            throw new Error('Không tìm thấy bài hát nào hợp lệ trong playlist này.');
        }

        // Đẩy toàn bộ 10-20 bài từ playlist vào hàng đợi
        for (const video of videos) {
            queue.push({
                url: video,
                requestedBy: message.author.username
            });
        }

        // Nếu bot đang bận phát nhạc từ trước -> Trả kết quả báo đưa vào hàng chờ
        if (initialQueueLength > 0) {
            return { queued: true, playlist: true, amount: videos.length };
        }
    } else {
        // Link thường thì chỉ push ĐÚNG 1 bài này vào hàng đợi
        queue.push({
            url,
            requestedBy: message.author.username
        });

        // Nếu bot đang phát nhạc từ trước -> Báo đưa 1 bài vào hàng chờ
        if (initialQueueLength > 0) {
            return { queued: true, playlist: false, amount: 1 };
        }
    }

    // Nếu lúc gõ lệnh queue đang trống, lập tức khởi động trình phát bài đầu tiên
    await processQueue(message);
    return { queued: false };
}

export async function processQueue(message) {
    const queue = getQueue(message.guild.id);
    if (queue.length === 0) return;

    const song = queue[0];

    if (!song.title) {
        try {
            const info = await getVideoInfo(song.url);
            song.title = info.title;
            song.duration = info.duration;
            song.thumbnail = info.thumbnail;
            song.uploader = info.uploader;
        } catch {
            song.title = 'Unknown title';
        }
    }

    await message.channel.send({
        embeds: [{
            title: '🎵 Đang phát',
            description: `**${song.title}**`,
            thumbnail: { url: song.thumbnail || 'https://i.imgur.com/AfFp7pu.png' },
            fields: [
                { name: 'Uploader', value: song.uploader || 'Unknown', inline: true },
                { name: 'Duration', value: formatDuration(song.duration), inline: true },
                { name: 'Requested by', value: song.requestedBy, inline: true }
            ]
        }]
    });

    const voiceChannel = message.guild.members.me.voice.channel || message.member.voice.channel;
    if (!voiceChannel) {
        clearGuild(message.guild.id);
        return;
    }

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: true
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 30000);

    // --- 1. TỰ ĐỘNG DỌN DẸP KHI BỊ DISCONNECT THỦ CÔNG ---
    // Kiểm tra listenerCount để tránh bị gom trùng lặp sự kiện khi bot chuyển bài hát tiếp theo
    if (!connection.listenerCount(VoiceConnectionStatus.Disconnected)) {
        connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            try {
                // Chờ tối đa 5 giây xem bot có đang tự chuyển phòng hoặc do mạng lag chập chờn không
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
                // Nếu chạy vào đây tức là bot đang cố gắng kết nối lại thành công, không cần xóa queue.
            } catch (error) {
                // Nếu quá 5 giây mà không kết nối lại được -> Thực sự bị Disconnect/Kick
                connection.destroy();
                clearGuild(message.guild.id);
            }
        });
    }

    const streamUrl = await getStreamUrl(song.url);
    const ffmpeg = new prism.FFmpeg({
        args: [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '10',
            '-nostdin',
            '-i', streamUrl,
            '-vn',
            '-f', 's16le',
            '-ar', '48000',
            '-af', 'volume=1.6', 
            '-ac', '2'
        ]
    });

    const resource = createAudioResource(ffmpeg, { inputType: StreamType.Raw });
    const player = getPlayer(message.guild.id);

    player.play(resource);
    connection.subscribe(player);

    player.removeAllListeners(AudioPlayerStatus.Idle);
    player.once(AudioPlayerStatus.Idle, async () => {
        // --- 2. ĐIỀU KIỆN CHẶN XUNG ĐỘT ---
        // Nếu hàng đợi đã bị xóa từ trước (do sự kiện Disconnect ở trên kích hoạt trước), dừng xử lý luôn
        if (!queues.has(message.guild.id)) return;

        queue.shift(); // Hát xong thì xóa bài hiện tại khỏi hàng đợi

        if (queue.length > 0) {
            // Nếu là link playlist (hoặc hàng đợi còn bài), bot tự động chạy tiếp bài sau
            await processQueue(message);
        } else {
            // Nếu là link thường (hát xong hết bài) -> Dọn dẹp dứt điểm và rời phòng thoại
            connection.destroy();
            clearGuild(message.guild.id);
        }
    });
}

export function clearGuild(guildId) {
    const queue = queues.get(guildId);
    if (queue) queue.length = 0;

    const player = players.get(guildId);
    if (player) {
        player.stop();
        players.delete(guildId);
    }
    queues.delete(guildId);
}