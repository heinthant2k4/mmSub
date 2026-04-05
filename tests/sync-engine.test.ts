import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../lib/sync-engine';
import type { SubtitleCue } from '../lib/messages';

const CUES: SubtitleCue[] = [
  { index: 1, startMs: 1000, endMs: 4000, text: 'First' },
  { index: 2, startMs: 5000, endMs: 8000, text: 'Second' },
  { index: 3, startMs: 10000, endMs: 13000, text: 'Third' },
];

describe('SyncEngine', () => {
  it('returns null when no cues loaded', () => {
    const engine = new SyncEngine();
    expect(engine.getCueAt(1500)).toBeNull();
  });

  it('finds the correct cue for a given time', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    expect(engine.getCueAt(2000)?.text).toBe('First');
    expect(engine.getCueAt(6000)?.text).toBe('Second');
    expect(engine.getCueAt(11000)?.text).toBe('Third');
  });

  it('returns null between cues', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    expect(engine.getCueAt(4500)).toBeNull();
  });

  it('returns null before first cue', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    expect(engine.getCueAt(500)).toBeNull();
  });

  it('applies positive offset', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    engine.adjustOffset(1000); // shift subs 1s later
    // At time 2000, effective lookup is 2000 - 1000 = 1000, which is start of First
    expect(engine.getCueAt(2000)?.text).toBe('First');
    // At time 1500, effective lookup is 500, before First
    expect(engine.getCueAt(1500)).toBeNull();
  });

  it('applies negative offset', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    engine.adjustOffset(-500);
    // At time 500, effective lookup is 1000, start of First
    expect(engine.getCueAt(500)?.text).toBe('First');
  });

  it('accumulates offset adjustments', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    engine.adjustOffset(500);
    engine.adjustOffset(500);
    expect(engine.getOffset()).toBe(1000);
  });

  it('resets offset when new cues are loaded', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    engine.adjustOffset(500);
    engine.loadCues(CUES);
    expect(engine.getOffset()).toBe(0);
  });

  it('uses binary search efficiently for large cue sets', () => {
    const engine = new SyncEngine();
    const manyCues: SubtitleCue[] = Array.from({ length: 10000 }, (_, i) => ({
      index: i + 1,
      startMs: i * 3000,
      endMs: i * 3000 + 2000,
      text: `Cue ${i + 1}`,
    }));
    engine.loadCues(manyCues);
    expect(engine.getCueAt(15001)?.text).toBe('Cue 6');
  });
});
