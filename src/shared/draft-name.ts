// Names are display/export summaries, never a second editable source of content.
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
export function draftName(caption: string): string {
  const text = caption.replace(/\s+/gu, ' ').trim();
  if (!text) return '未填写文案';
  let name = '';
  for (const { segment } of segmenter.segment(text)) {
    if (name.length + segment.length > 68) return name + '…';
    name += segment;
  }
  return name;
}
