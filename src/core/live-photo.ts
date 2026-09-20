// Binary format implementation; see docs/格式说明.md for references and validation limits.
import { randomUUID } from 'node:crypto';

const bytes = (...values: number[]) => Buffer.from(values);
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const join = (...b: Buffer[]) => Buffer.concat(b);
const text = (s: string) => Buffer.from(s, 'ascii');
const full = (flags = 0) => u32(flags);
function box(type: string, ...payload: Buffer[]) { const data = join(...payload); return join(u32(data.length + 8), text(type), data); }
interface Box { type: string; start: number; end: number; body: number }
export function readBoxes(data: Buffer, start = 0, end = data.length): Box[] {
  const result: Box[] = [];
  for (let at = start; at < end;) {
    if (at + 8 > end) throw new Error('媒体容器被截断');
    let size = data.readUInt32BE(at), header = 8;
    if (size === 1) {
      if (at + 16 > end) throw new Error('媒体容器大小无效');
      size = Number(data.readBigUInt64BE(at + 8)); header = 16;
    } else if (size === 0) size = end - at;
    if (!Number.isSafeInteger(size) || size < header || at + size > end) throw new Error('媒体容器边界无效');
    result.push({ type: data.toString('ascii', at + 4, at + 8), start: at, end: at + size, body: at + header });
    at += size;
  }
  return result;
}
function child(data: Buffer, parent: Box, type: string) {
  const found = readBoxes(data, parent.body, parent.end).find(b => b.type === type);
  if (!found) throw new Error(`媒体容器缺少 ${type}`);
  return found;
}
function patchOffsets(data: Buffer, delta: number) {
  function visit(start: number, end: number) {
    for (const b of readBoxes(data, start, end)) {
      if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(b.type)) visit(b.body, b.end);
      if (b.type === 'stco' || b.type === 'co64') {
        const width = b.type === 'co64' ? 8 : 4;
        const count = data.readUInt32BE(b.body + 4);
        if (b.body + 8 + count * width > b.end) throw new Error('媒体索引无效');
        for (let n = 0; n < count; n++) {
          const at = b.body + 8 + n * width;
          if (width === 8) data.writeBigUInt64BE(data.readBigUInt64BE(at) + BigInt(delta), at);
          else data.writeUInt32BE(data.readUInt32BE(at) + delta, at);
        }
      }
    }
  }
  visit(0, data.length);
  return data;
}
function exifEntry(tag: number, type: number, count: number, value: number) {
  return join(u16(tag), u16(type), u32(count), u32(value));
}
export function appleJPEG(jpeg: Buffer, identifier: string): Buffer {
  const id = identifier.toUpperCase();
  if (!/^[0-9A-F]{8}(-[0-9A-F]{4}){3}-[0-9A-F]{12}$/.test(id)) throw new Error('实况标识无效');
  if (jpeg[0] !== 255 || jpeg[1] !== 216) throw new Error('封面不是有效 JPEG');
  const maker = join(text('Apple iOS'), bytes(0, 0, 1), text('MM'), u16(1), exifEntry(17, 2, 37, 32), u32(0), text(id), bytes(0));
  const tiff = join(text('MM'), u16(42), u32(8), u16(2), exifEntry(0x10f, 2, 6, 56), exifEntry(0x8769, 4, 1, 38), u32(0),
    u16(1), exifEntry(0x927c, 7, maker.length, 62), u32(0), text('Apple\0'), maker);
  const payload = join(text('Exif\0\0'), tiff);
  return join(jpeg.subarray(0, 2), bytes(255, 225), u16(payload.length + 2), payload, jpeg.subarray(2));
}
export function appleMOV(mov: Buffer, identifier: string, coverTime: number): Buffer {
  const roots = readBoxes(mov);
  const moov = roots.find(b => b.type === 'moov'), mdat = roots.find(b => b.type === 'mdat');
  if (!moov || !mdat || roots.filter(b => b.type === 'mdat').length !== 1) throw new Error('实况视频需要完整的单段 MOV');
  const movie = child(mov, moov, 'mvhd');
  const timeAt = movie.body + (mov[movie.body] ? 20 : 12);
  const timescale = mov.readUInt32BE(timeAt);
  const duration = mov[movie.body] ? Number(mov.readBigUInt64BE(timeAt + 4)) : mov.readUInt32BE(timeAt + 4);
  const tracks = readBoxes(mov, moov.body, moov.end).filter(b => b.type === 'trak');
  const trackId = (t: Box) => { const h = child(mov, t, 'tkhd'); return mov.readUInt32BE(h.body + (mov[h.body] ? 20 : 12)); };
  const video = tracks.find(t => { const h = child(mov, child(mov, t, 'mdia'), 'hdlr'); return mov.toString('ascii', h.body + 8, h.body + 12) === 'vide'; });
  if (!video || timescale <= 0 || !Number.isFinite(coverTime) || coverTime < 0) throw new Error('实况视频时间或视频轨无效');
  const id = Math.max(...tracks.map(trackId)) + 1;
  const ticks = Math.min(Math.round(coverTime * timescale), Math.max(0, duration - 1));
  const prefix = join(...roots.filter(b => !['moov', 'mdat'].includes(b.type)).map(b => mov.subarray(b.start, b.end)));
  const sample = join(u32(9), u32(1), bytes(255));
  const media = box('mdat', mov.subarray(mdat.body, mdat.end), sample);
  const sampleAt = prefix.length + 8 + mdat.end - mdat.body;
  const identifierKey = text('com.apple.quicktime.content.identifier');
  const handler = (type: string, name: string) => box('hdlr', full(), u32(0), text(type), Buffer.alloc(12), text(name + '\0'));
  const meta = box('meta', handler('mdta', ''), box('keys', full(), u32(1), u32(identifierKey.length + 8), text('mdta'), identifierKey),
    box('ilst', box('\0\0\0\x01', box('data', u32(1), u32(0), text(identifier.toUpperCase())))));
  const matrix = join(...[0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));
  const trackHeader = box('tkhd', full(3), u32(0), u32(0), u32(id), u32(0), u32(ticks + 1), Buffer.alloc(16), matrix, Buffer.alloc(8));
  const edits = ticks ? [join(u32(ticks), i32(-1), u16(1), u16(0))] : [];
  edits.push(join(u32(1), u32(0), u16(1), u16(0)));
  const key = box('keyd', text('mdta'), text('com.apple.quicktime.still-image-time'));
  const datatype = box('dtyp', full(), u32(0x41));
  const mebx = box('mebx', Buffer.alloc(6), u16(1), box('keys', u32(8 + key.length + datatype.length), u32(1), key, datatype));
  const table = box('stbl', box('stsd', full(), u32(1), mebx), box('stts', full(), u32(1), u32(1), u32(1)),
    box('stsc', full(), u32(1), u32(1), u32(1), u32(1)), box('stsz', full(), u32(0), u32(1), u32(sample.length)), box('stco', full(), u32(1), u32(sampleAt)));
  const dinf = box('dinf', box('dref', full(), u32(1), box('url ', full(1))));
  const minf = box('minf', box('gmhd', box('gmin', full(), u16(0x40), u16(0x8000), u16(0x8000), u16(0x8000), u16(0), u16(0))), dinf, table);
  const track = box('trak', trackHeader, box('edts', box('elst', full(), u32(edits.length), ...edits)), box('tref', box('cdsc', u32(trackId(video)))),
    box('mdia', box('mdhd', full(), u32(0), u32(0), u32(timescale), u32(1), u16(0x55c4), u16(0)), handler('meta', 'Core Media Metadata'), minf));
  const patched = patchOffsets(Buffer.from(mov.subarray(moov.start, moov.end)), prefix.length + 8 - mdat.body);
  const header = readBoxes(patched)[0];
  const changedMovie = child(patched, header, 'mvhd');
  patched.writeUInt32BE(id + 1, changedMovie.end - 4);
  return join(prefix, media, box('moov', patched.subarray(header.body), meta, track));
}
export function androidMotionPhoto(jpeg: Buffer, mp4: Buffer, coverTime: number): Buffer {
  if (jpeg[0] !== 255 || jpeg[1] !== 216 || !mp4.length || coverTime < 0) throw new Error('动态照片资源无效');
  const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:Camera="http://ns.google.com/photos/1.0/camera/" xmlns:Container="http://ns.google.com/photos/1.0/container/" xmlns:Item="http://ns.google.com/photos/1.0/container/item/" Camera:MotionPhoto="1" Camera:MotionPhotoVersion="1" Camera:MotionPhotoPresentationTimestampUs="${Math.round(coverTime * 1000000)}"><Container:Directory><rdf:Seq><rdf:li rdf:parseType="Resource"><Container:Item Item:Mime="image/jpeg" Item:Semantic="Primary" Item:Length="0" Item:Padding="0"/></rdf:li><rdf:li rdf:parseType="Resource"><Container:Item Item:Mime="video/mp4" Item:Semantic="MotionPhoto" Item:Length="${mp4.length}"/></rdf:li></rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const payload = join(text('http://ns.adobe.com/xap/1.0/\0'), Buffer.from(xmp));
  return join(jpeg.subarray(0, 2), bytes(255, 225), u16(payload.length + 2), payload, jpeg.subarray(2), mp4);
}
export const newLiveIdentifier = () => randomUUID().toUpperCase();
