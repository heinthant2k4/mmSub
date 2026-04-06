import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// We mock document methods before importing to control DOM behavior
const mockQuerySelector = vi.fn();
const mockTitle = { value: '' };

vi.stubGlobal('document', {
  get title() { return mockTitle.value; },
  querySelector: mockQuerySelector,
  location: { hostname: 'www.netflix.com' },
});

// Import after stubbing global document
const { detectTitle } = await import('../lib/title-detector');

describe('detectTitle', () => {
  beforeEach(() => {
    mockQuerySelector.mockReset();
    mockQuerySelector.mockReturnValue(null);
    mockTitle.value = '';
    // Reset hostname to a neutral value for most tests
    (document as any).location = { hostname: 'www.example.com' };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Netflix tests
  describe('Netflix', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'www.netflix.com' };
    });

    it('returns title from Netflix DOM selector', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel === '.title-card-title-text, .VideoTitle, [data-uia="video-title"]') {
          return { textContent: '  Squid Game  ' };
        }
        return null;
      });
      expect(detectTitle()).toBe('Squid Game');
    });

    it('strips " - Netflix" suffix from document.title', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = 'Squid Game - Netflix';
      expect(detectTitle()).toBe('Squid Game');
    });

    it('uses document.title as fallback when no selector matches', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = 'Money Heist - Netflix';
      expect(detectTitle()).toBe('Money Heist');
    });
  });

  // Disney+ tests
  describe('Disney+', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'www.disneyplus.com' };
    });

    it('returns title from Disney+ DOM selector', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel.includes('Disney')) {
          return null;
        }
        if (sel.includes('title')) {
          return { textContent: 'The Mandalorian' };
        }
        return null;
      });
      expect(detectTitle()).toBe('The Mandalorian');
    });

    it('strips " | Disney+" suffix from document.title', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = 'Encanto | Disney+';
      expect(detectTitle()).toBe('Encanto');
    });
  });

  // Prime Video tests
  describe('Prime Video', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'www.amazon.com' };
    });

    it('returns title from Prime Video DOM selector', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel.includes('atvwebplayersdk')) {
          return { textContent: 'The Boys' };
        }
        return null;
      });
      expect(detectTitle()).toBe('The Boys');
    });

    it('strips "- Amazon" suffix and "Watch " prefix from document.title', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = 'Watch The Boys - Amazon';
      expect(detectTitle()).toBe('The Boys');
    });
  });

  // Apple TV+ tests
  describe('Apple TV+', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'tv.apple.com' };
    });

    it('returns title from Apple TV+ DOM selector', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel.includes('video-title')) {
          return { textContent: 'Ted Lasso' };
        }
        return null;
      });
      expect(detectTitle()).toBe('Ted Lasso');
    });

    it('strips " - Apple TV+" suffix from document.title', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = 'Ted Lasso - Apple TV+';
      expect(detectTitle()).toBe('Ted Lasso');
    });
  });

  // HBO Max tests
  describe('HBO Max', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'www.max.com' };
    });

    it('returns title from HBO Max DOM selector', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel.includes('video-player-title')) {
          return { textContent: 'Game of Thrones' };
        }
        return null;
      });
      expect(detectTitle()).toBe('Game of Thrones');
    });

    it('strips " | Max" suffix from document.title', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = 'Game of Thrones | Max';
      expect(detectTitle()).toBe('Game of Thrones');
    });
  });

  // Generic fallback tests
  describe('Generic fallback', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'www.hulu.com' };
    });

    it('strips "| Hulu" from document.title', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = 'Avatar | Hulu';
      expect(detectTitle()).toBe('Avatar');
    });

    it('strips "| Peacock" from document.title', () => {
      mockQuerySelector.mockReturnValue(null);
      (document as any).location = { hostname: 'www.peacocktv.com' };
      mockTitle.value = 'Yellowstone | Peacock';
      expect(detectTitle()).toBe('Yellowstone');
    });

    it('strips "- Netflix" suffix (generic)', () => {
      mockQuerySelector.mockReturnValue(null);
      (document as any).location = { hostname: 'unknown-site.com' };
      mockTitle.value = 'Some Show - Netflix';
      expect(detectTitle()).toBe('Some Show');
    });

    it('returns empty string when document.title equals hostname', () => {
      mockQuerySelector.mockReturnValue(null);
      (document as any).location = { hostname: 'www.netflix.com' };
      mockTitle.value = 'www.netflix.com';
      expect(detectTitle()).toBe('');
    });

    it('returns empty string when title is blank', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = '';
      expect(detectTitle()).toBe('');
    });

    it('returns empty string when all suffixes stripped leaves empty result', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = '- Netflix';
      expect(detectTitle()).toBe('');
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('trims whitespace from selector result', () => {
      (document as any).location = { hostname: 'www.netflix.com' };
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel.includes('VideoTitle') || sel.includes('title-card')) {
          return { textContent: '   Breaking Bad   ' };
        }
        return null;
      });
      expect(detectTitle()).toBe('Breaking Bad');
    });

    it('returns empty string when selector textContent is empty', () => {
      (document as any).location = { hostname: 'www.netflix.com' };
      mockQuerySelector.mockReturnValue({ textContent: '   ' });
      mockTitle.value = '';
      expect(detectTitle()).toBe('');
    });
  });
});
