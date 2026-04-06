# Subtitle Format Reference

mmSub supports three subtitle formats. Here's what each looks like and how the parsers handle them.

---

## SRT (SubRip Text)

The simplest format. Each cue has an index, a time range, and text.

```
1
00:01:23,456 --> 00:01:26,789
ကျွန်တော် သွားမည်

2
00:01:28,000 --> 00:01:31,500
တိတ်တခိုး ထွက်သွားသည်
```

**Parser notes:**
- Timestamps: `HH:MM:SS,mmm` (comma as decimal separator)
- Multi-line cues are joined with `\n`
- Empty lines separate cues
- BOM and CRLF are stripped before parsing

---

## ASS / SSA (Advanced SubStation Alpha)

The most capable format. Supports styling, positioning, and karaoke.

```ini
[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:01:23.45,0:01:26.78,Default,,0,0,0,,{\an8}ကျွန်တော် သွားမည်
Dialogue: 0,0:01:28.00,0:01:31.50,Default,,0,0,0,,တိတ်တခိုး ထွက်သွားသည်
```

**Parser notes:**
- Only the `[Events]` section is read; everything else is ignored
- `Format:` line is parsed to determine column positions — non-standard orderings work
- `Comment:` lines are skipped
- Override tags `{...}` are stripped (e.g. `{\an8}`, `{\b1}`, `{\c&H00FFFF&}`)
- Timestamps: `H:MM:SS.cc` (centiseconds — multiply by 10 for ms)
- `\N` and `\n` in text become real newlines
- Cues with `endMs < startMs` or NaN timestamps are dropped

---

## Format Detection

Format is detected from the **file extension** — never from content inspection:

| Extension | Format |
|-----------|--------|
| `.srt` | SRT |
| `.ass` | ASS |
| `.ssa` | ASS (treated identically) |

For **SubDL downloads** (which come as ZIP files), the parser extracts subtitle entries in this priority:

```
1. Root-level .srt  (e.g. Movie.srt)
2. Any nested .srt  (e.g. subs/Movie.srt)
3. Root-level .ass/.ssa
4. Any nested .ass/.ssa
```

The detected format determines which parser runs. Cached subtitle text is re-detected by checking whether it starts with `[Script Info]` (all valid ASS files do).
