const KEY_PREFIX = 'srt_';

export class SubtitleCache {
  private key(fileId: number): string {
    return `${KEY_PREFIX}${fileId}`;
  }

  async get(fileId: number): Promise<string | null> {
    const key = this.key(fileId);
    const result = await chrome.storage.local.get([key]);
    return result[key] ?? null;
  }

  async set(fileId: number, srtText: string): Promise<void> {
    const key = this.key(fileId);
    await chrome.storage.local.set({ [key]: srtText });
  }

  async remove(fileId: number): Promise<void> {
    const key = this.key(fileId);
    await chrome.storage.local.remove([key]);
  }
}
