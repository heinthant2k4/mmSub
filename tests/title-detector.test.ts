import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// We mock document methods before importing to control DOM behavior
const mockQuerySelector = vi.fn();
const mockQuerySelectorAll = vi.fn().mockReturnValue([]);
const mockTitle = { value: '' };

vi.stubGlobal('document', {
  get title() { return mockTitle.value; },
  querySelector: mockQuerySelector,
  querySelectorAll: mockQuerySelectorAll,
  location: { hostname: 'www.netflix.com' },
});

// Import after stubbing global document
const { detectTitle } = await import('../lib/title-detector');

describe('detectTitle', () => {
  beforeEach(() => {
    mockQuerySelector.mockReset();
    mockQuerySelector.mockReturnValue(null);
    mockQuerySelectorAll.mockReset();
    mockQuerySelectorAll.mockReturnValue([]);
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
        if (sel === '[data-uia="video-title"]') {
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
        if (sel === '[data-testid="content-title"]') {
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

  // Prime Video via primevideo.com hostname
  describe('Prime Video (primevideo.com)', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'www.primevideo.com' };
    });

    it('returns title from primevideo.com DOM selector', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel.includes('atvwebplayersdk')) {
          return { textContent: 'Reacher' };
        }
        return null;
      });
      expect(detectTitle()).toBe('Reacher');
    });

    it('strips "- Amazon" suffix from document.title on primevideo.com', () => {
      mockQuerySelector.mockReturnValue(null);
      mockTitle.value = 'Watch Reacher - Amazon';
      expect(detectTitle()).toBe('Reacher');
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

  // OpenGraph og:title
  describe('OpenGraph og:title', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'www.somesite.com' };
    });

    it('reads title from og:title meta tag', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel === 'meta[property="og:title"]') {
          return { content: 'Oppenheimer' };
        }
        return null;
      });
      expect(detectTitle()).toBe('Oppenheimer');
    });

    it('cleans pirate noise from og:title', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel === 'meta[property="og:title"]') {
          return { content: 'Watch Oppenheimer (2023) Full Movie Online Free' };
        }
        return null;
      });
      expect(detectTitle()).toBe('Oppenheimer');
    });

    it('skips empty og:title and falls back to document.title', () => {
      mockQuerySelector.mockImplementation((sel: string) => {
        if (sel === 'meta[property="og:title"]') {
          return { content: '' };
        }
        return null;
      });
      mockTitle.value = 'Avatar | Hulu';
      expect(detectTitle()).toBe('Avatar');
    });
  });

  // Pirate site document.title noise stripping
  describe('pirate site title cleaning', () => {
    beforeEach(() => {
      (document as any).location = { hostname: 'fmovies.to' };
      mockQuerySelector.mockReturnValue(null);
    });

    it('strips "Watch " prefix and " Online Free" suffix', () => {
      mockTitle.value = 'Watch Inception Online Free';
      expect(detectTitle()).toBe('Inception');
    });

    it('strips "(2023)" year at end', () => {
      mockTitle.value = 'Barbie (2023)';
      expect(detectTitle()).toBe('Barbie');
    });

    it('strips "HD" quality tag', () => {
      mockTitle.value = 'The Dark Knight HD';
      expect(detectTitle()).toBe('The Dark Knight');
    });

    it('strips "1080p" resolution tag', () => {
      mockTitle.value = 'Interstellar 1080p';
      expect(detectTitle()).toBe('Interstellar');
    });

    it('strips "Full Movie Online" suffix', () => {
      mockTitle.value = 'Parasite Full Movie Online';
      expect(detectTitle()).toBe('Parasite');
    });

    it('strips "| SiteName" style suffix', () => {
      mockTitle.value = 'Dune | FMovies';
      expect(detectTitle()).toBe('Dune');
    });

    it('handles combined pirate noise', () => {
      mockTitle.value = 'Watch Dune Part Two (2024) Online Free HD';
      expect(detectTitle()).toBe('Dune Part Two');
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
