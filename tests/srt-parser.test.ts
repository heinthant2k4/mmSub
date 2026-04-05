import { describe, it, expect } from 'vitest';
import { parseSrt } from '../lib/srt-parser';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,500 --> 00:00:08,250
မင်္ဂလာပါ
ကျေးဇူးတင်ပါတယ်

3
00:01:00,000 --> 00:01:03,500
Goodbye!
`;

describe('parseSrt', () => {
  it('parses correct number of cues', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues).toHaveLength(3);
  });

  it('parses timestamps to milliseconds', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues[0].startMs).toBe(1000);
    expect(cues[0].endMs).toBe(4000);
    expect(cues[1].startMs).toBe(5500);
    expect(cues[1].endMs).toBe(8250);
    expect(cues[2].startMs).toBe(60000);
    expect(cues[2].endMs).toBe(63500);
  });

  it('preserves multiline text', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues[1].text).toBe('မင်္ဂလာပါ\nကျေးဇူးတင်ပါတယ်');
  });

  it('assigns sequential indices', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues[0].index).toBe(1);
    expect(cues[1].index).toBe(2);
    expect(cues[2].index).toBe(3);
  });

  it('handles empty input', () => {
    expect(parseSrt('')).toEqual([]);
  });

  it('handles Windows line endings (CRLF)', () => {
    const crlf = "1\r\n00:00:01,000 --> 00:00:02,000\r\nTest\r\n\r\n";
    const cues = parseSrt(crlf);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Test');
  });

  it('strips HTML tags from subtitle text', () => {
    const html = "1\n00:00:01,000 --> 00:00:02,000\n<i>Italic</i> and <b>bold</b>\n\n";
    const cues = parseSrt(html);
    expect(cues[0].text).toBe('Italic and bold');
  });
});
