export function durationHMS(time: number) {
  const seconds = Number.isFinite(time) ? Math.max(0, Math.floor(time)) : 0;
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
}
