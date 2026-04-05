import type { SubtitleCue } from './messages';

export class SyncEngine {
  private cues: SubtitleCue[] = [];
  private offsetMs = 0;

  loadCues(cues: SubtitleCue[]): void {
    this.cues = [...cues].sort((a, b) => a.startMs - b.startMs);
    this.offsetMs = 0;
  }

  adjustOffset(deltaMs: number): void {
    this.offsetMs += deltaMs;
  }

  getOffset(): number {
    return this.offsetMs;
  }

  getCueAt(timeMs: number): SubtitleCue | null {
    if (this.cues.length === 0) return null;

    // Effective time = current time minus offset
    const effective = timeMs - this.offsetMs;

    // Binary search for the cue containing effective time
    let low = 0;
    let high = this.cues.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const cue = this.cues[mid];

      if (effective < cue.startMs) {
        high = mid - 1;
      } else if (effective >= cue.endMs) {
        low = mid + 1;
      } else {
        return cue;
      }
    }

    return null;
  }
}
