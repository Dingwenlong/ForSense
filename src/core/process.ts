import { spawn } from 'node:child_process';
export class Cancelled extends Error { constructor() { super('操作已取消'); } }
export function checkCancelled(signal: AbortSignal) { if (signal.aborted) throw new Cancelled(); }
export async function runProcess(executable: string, args: string[], signal: AbortSignal, onLine?: (line: string) => void) {
  checkCancelled(signal);
  return new Promise<string>((resolve, reject) => {
    const process = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let output = '', errors = '', pending = '';
    const abort = () => process.kill();
    signal.addEventListener('abort', abort, { once: true });
    process.stdout.on('data', chunk => {
      if (onLine) { pending += chunk.toString(); const lines = pending.split(/\r?\n/); pending = lines.pop() || ''; lines.forEach(onLine); }
      else { output += chunk.toString(); if (output.length > 64 * 1024 * 1024) { process.kill(); errors = '媒体信息过大，无法处理'; } }
    });
    process.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-12000); });
    process.on('error', error => { signal.removeEventListener('abort', abort); reject(error); });
    process.on('close', code => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(new Cancelled());
      else if (code !== 0) {
        if (/No space left/i.test(errors)) reject(Object.assign(new Error('磁盘空间不足'), { code: 'ENOSPC' }));
        else reject(new Error(/Invalid data|Error opening input|moov atom not found/i.test(errors) ? '媒体文件损坏或格式不受支持' : '媒体处理失败，请检查文件是否完整并重试'));
      } else resolve(output);
    });
  });
}
export interface Tools { ffmpeg: string; ffprobe: string }
export interface Probe { duration: number; width: number; height: number; audio: boolean; codec: string; hdr: boolean }
export async function probe(tools: Tools, file: string, signal: AbortSignal): Promise<Probe> {
  const data = JSON.parse(await runProcess(tools.ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], signal));
  const stream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
  if (!stream?.width || !stream?.height) throw new Error('文件中没有可读取的画面');
  return { duration: Number(data.format?.duration || stream.duration || 0), width: stream.width, height: stream.height,
    audio: data.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'), codec: stream.codec_name,
    hdr: ['smpte2084', 'arib-std-b67'].includes(stream.color_transfer) };
}
export async function transcode(tools: Tools, args: string[], duration: number, signal: AbortSignal, progress: (n: number) => void) {
  await runProcess(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args, '-progress', 'pipe:1', '-nostats'], signal, line => {
    if (line.startsWith('out_time_us=') && duration > 0) progress(Math.min(0.99, Math.max(0, Number(line.split('=')[1]) / 1000000 / duration)));
  });
}
