// Some Windows sessions resolve clipboard writes even when the OS rejects them.
// Verify the requested content before reporting success to the user.
export async function writeClipboardVerified(write: () => Promise<void>, verify: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await write(); if (await verify()) return; } catch { /* Retry brief clipboard contention. */ }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error('复制失败：系统剪贴板暂不可用，请稍后重试');
}
