import { describe, it, expect } from 'vitest';
import { parseAss } from '../lib/ass-parser';

const SAMPLE_ASS = `[Script Info]
ScriptType: v4.00+
Title: Example

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Hello World
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Line one\\NLine two
Comment: 0,0:00:00.00,0:00:00.00,Default,,0,0,0,,This is a comment
`;

describe('parseAss', () => {
  it('parses the correct number of cues (excludes Comment lines)', () => {
    const cues = parseAss(SAMPLE_ASS);
    expect(cues).toHaveLength(2);
  });

  it('parses timestamps H:MM:SS.cc to milliseconds', () => {
    const cues = parseAss(SAMPLE_ASS);
    // 0:00:01.00 → 1*1000 + 00*10 = 1000 ms
    expect(cues[0].startMs).toBe(1000);
    // 0:00:03.50 → 3*1000 + 50*10 = 3500 ms
    expect(cues[0].endMs).toBe(3500);
    // 0:00:04.00 → 4000 ms
    expect(cues[1].startMs).toBe(4000);
    // 0:00:06.00 → 6000 ms
    expect(cues[1].endMs).toBe(6000);
  });

  it('correctly converts hours, minutes, seconds, centiseconds', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,1:23:45.67,2:00:00.00,Default,,0,0,0,,Test
`;
    const cues = parseAss(ass);
    // 1:23:45.67 → 1*3600000 + 23*60000 + 45*1000 + 67*10
    expect(cues[0].startMs).toBe(1 * 3600000 + 23 * 60000 + 45 * 1000 + 67 * 10);
    // 2:00:00.00 → 2*3600000
    expect(cues[0].endMs).toBe(2 * 3600000);
  });

  it('replaces \\N with newline in text', () => {
    const cues = parseAss(SAMPLE_ASS);
    expect(cues[1].text).toBe('Line one\nLine two');
  });

  it('replaces \\n (lowercase) with newline in text', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,First\\nSecond
`;
    const cues = parseAss(ass);
    expect(cues[0].text).toBe('First\nSecond');
  });

  it('strips ASS override tags {…} from text', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\an8}Hello World
`;
    const cues = parseAss(ass);
    expect(cues[0].text).toBe('Hello World');
  });

  it('strips multiple override tags', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}Italic{\\i0} and {\\c&HFF0000&}red
`;
    const cues = parseAss(ass);
    expect(cues[0].text).toBe('Italic and red');
  });

  it('skips Comment: lines', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Comment: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,I am a comment
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Real dialogue
`;
    const cues = parseAss(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Real dialogue');
  });

  it('returns [] for empty input', () => {
    expect(parseAss('')).toEqual([]);
  });

  it('returns [] for whitespace-only input', () => {
    expect(parseAss('   \n\n  ')).toEqual([]);
  });

  it('returns [] for input with no [Events] section', () => {
    const ass = `[Script Info]
ScriptType: v4.00+
Title: Example
`;
    expect(parseAss(ass)).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const ass = '[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello\r\n';
    const cues = parseAss(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Hello');
  });

  it('assigns sequential indices starting at 1', () => {
    const cues = parseAss(SAMPLE_ASS);
    expect(cues[0].index).toBe(1);
    expect(cues[1].index).toBe(2);
  });

  it('sorts cues by startMs', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:10.00,0:00:12.00,Default,,0,0,0,,Third
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,First
Dialogue: 0,0:00:05.00,0:00:07.00,Default,,0,0,0,,Second
`;
    const cues = parseAss(ass);
    expect(cues).toHaveLength(3);
    expect(cues[0].text).toBe('First');
    expect(cues[1].text).toBe('Second');
    expect(cues[2].text).toBe('Third');
  });

  it('ignores lines outside the [Events] section', () => {
    const ass = `[Script Info]
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Should be ignored

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:04.00,0:00:06.00,Default,,0,0,0,,Real
`;
    const cues = parseAss(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Real');
  });

  it('handles text with commas (text is 10th field with max 10 splits)', () => {
    const ass = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello, world, and more
`;
    const cues = parseAss(ass);
    expect(cues[0].text).toBe('Hello, world, and more');
  });
});
