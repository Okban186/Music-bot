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
import { createEmbed } from '../embedStates.js';

const leaveTimeouts = new Map();
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

// async function getVideoInfo(url) {
//     return await new Promise((resolve, reject) => {
//         const ytDlp = spawn('yt-dlp', ['-J', '--no-playlist', url]);
//         let data = '';
//         let error = '';

//         ytDlp.stdout.on('data', chunk => data += chunk.toString());
//         ytDlp.stderr.on('data', chunk => error += chunk.toString());

//         ytDlp.on('close', code => {
//             if (code !== 0) return reject(new Error(error));
//             try {
//                 resolve(JSON.parse(data));
//             } catch (err) {
//                 reject(err);
//             }
//         });

//         setTimeout(() => {
//             ytDlp.kill();
//             reject(new Error('Không thể lấy thông tin video (Timeout)'));
//         }, 15000);
//     });
// }

// async function getStreamUrl(url) {
//     return await new Promise((resolve, reject) => {
//         const ytDlp = spawn('yt-dlp', [
//             '--no-playlist',
//             '--format', 'bestaudio[ext=webm]/bestaudio',
//             '--get-url',
//             '--no-warnings',
//             '--quiet',
//             '--force-ipv4',
//             '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
//             url
//         ]);

//         let data = '';
//         const timeout = setTimeout(() => {
//             ytDlp.kill();
//             reject(new Error('Timeout'));
//         }, 15000);

//         ytDlp.stdout.on('data', chunk => data += chunk.toString());
//         ytDlp.on('close', code => {
//             clearTimeout(timeout);

//             if (code !== 0 || !data.trim()) return reject(new Error('Không lấy được đường dẫn stream'));
//             resolve(data.trim());
//         });
//     });
// }

async function getTrackDetails(url) {
    return await new Promise((resolve, reject) => {
        // Gộp cả việc chọn định dạng audio tốt nhất và xuất JSON
        const ytDlp = spawn('yt-dlp', [
            '--no-playlist',
            '-f', 'bestaudio[ext=webm]/bestaudio',
            '-J', // Lấy file JSON tổng hợp
            '--no-warnings',
            '--force-ipv4',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            url
        ]);

        let data = '';
        let error = '';

        const timeout = setTimeout(() => {
            ytDlp.kill();
            reject(new Error('Timeout: Không thể lấy thông tin bài hát'));
        }, 15000);

        ytDlp.stdout.on('data', chunk => data += chunk.toString());
        ytDlp.stderr.on('data', chunk => error += chunk.toString());

        ytDlp.on('close', code => {
            clearTimeout(timeout);
            if (code !== 0) return reject(new Error(error));

            try {
                const info = JSON.parse(data);
                resolve({
                    title: info.title,
                    duration: info.duration,
                    thumbnail: info.thumbnail,
                    uploader: info.uploader,
                    streamUrl: info.url // <-- Direct link stream nằm ngay đây
                });
            } catch (err) {
                reject(err);
            }
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
    //--- Nếu có người thêm URL thì reset timeout
    if (leaveTimeouts.has(message.guild.id)) {
        clearTimeout(leaveTimeouts.get(message.guild.id));
        leaveTimeouts.delete(message.guild.id);
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
                requestedBy: message.author.username,
                textChannelId: message.channel.id
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
            requestedBy: message.author.username,
            textChannelId: message.channel.id
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

    // Chỉ gọi yt-dlp một lần duy nhất nếu bài hát chưa có data
    if (!song.streamUrl) {
        try {
            const info = await getTrackDetails(song.url);
            song.title = info.title;
            song.duration = info.duration;
            song.thumbnail = info.thumbnail;
            song.uploader = info.uploader;
            song.streamUrl = info.streamUrl;
        } catch (error) {
            console.error('Lỗi khi lấy stream bài hát:', error.message);

            // Phân loại lỗi để thông báo cho người dùng
            let errorMsg = `💤 Không thể tải stream cho đường link **${song.url}**. Đã tự động bỏ qua bài này!`;
            if (error.message.includes('DRM')) {
                errorMsg = `Đường link **${song.url}** bị khóa bản quyền kỹ thuật số (DRM) và không thể phát. Đã tự động bỏ qua!`;
            }

            // Gửi tin nhắn lỗi vào kênh chat dựa trên textChannelId đã lưu
            const textChannel = message.guild.channels.cache.get(song.textChannelId) || message.channel;
            if (textChannel) {
                textChannel.send({
                    embeds: [
                        createEmbed('fail', errorMsg)
                    ]
                }).catch(err => console.error("Không thể gửi thông báo lỗi DRM:", err));
            }

            // Xóa bài bị lỗi khỏi hàng đợi và lập tức gọi lại processQueue để phát bài tiếp theo
            queue.shift();
            return processQueue(message);
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

    if (!connection.listenerCount(VoiceConnectionStatus.Disconnected)) {
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
            } catch (error) {
                connection.destroy();
                clearGuild(message.guild.id);
            }
        });
    }

    // KHÔNG GỌI LẠI getStreamUrl NỮA
    // Đưa trực tiếp song.streamUrl vào FFmpeg
    const ffmpeg = new prism.FFmpeg({
        args: [
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '10',
            '-nostdin',
            '-i', song.streamUrl, // Sử dụng link stream đã lấy ở trên
            '-vn',
            '-f', 's16le',
            '-ar', '48000',
            '-af', 'volume=1.6',
            '-ac', '2'
        ]
    });

    const resource = createAudioResource(ffmpeg, { inputType: StreamType.Raw });
    const player = getPlayer(message.guild.id);

    await new Promise(resolve => setTimeout(resolve, 1500));

    player.play(resource);
    connection.subscribe(player);

    player.removeAllListeners(AudioPlayerStatus.Idle);
    player.once(AudioPlayerStatus.Idle, async () => {
        if (!queues.has(message.guild.id)) return;

        queue.shift();

        if (queue.length > 0) {
            await processQueue(message);
        } else {
            const timeout = setTimeout(() => {
                connection.destroy();
                clearGuild(message.guild.id);
                leaveTimeouts.delete(message.guild.id);

                message.channel.send({
                    embeds: [
                        createEmbed('fail', '💤 Đã rời phòng thoại do không có bài hát nào được thêm trong 3 phút qua.')
                    ]
                }).catch(err => console.error("Không thể gửi tin nhắn thông báo:", err));
            }, 180000);

            leaveTimeouts.set(message.guild.id, timeout);
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