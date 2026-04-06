const KEY_PREFIX = 'srt_';

export class SubtitleCache {
  private key(id: string | number): string {
    // Encode non-numeric keys to avoid collisions with storage keys
    const safe = String(id).replace(/[^a-zA-Z0-9_-]/g, encodeURIComponent);
    return `${KEY_PREFIX}${safe}`;
  }

  async get(id: string | number): Promise<string | null> {
    const key = this.key(id);
    const result = await browser.storage.local.get([key]);
    return (result[key] as string) ?? null;
  }

  async set(id: string | number, srtText: string): Promise<void> {
    const key = this.key(id);
    await browser.storage.local.set({ [key]: srtText });
  }

  async remove(id: string | number): Promise<void> {
    const key = this.key(id);
    await browser.storage.local.remove([key]);
  }
}
