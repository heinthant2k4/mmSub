// lib/overlay.ts

export class SubtitleOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private subtitleEl: HTMLDivElement;
  private resizeObserver: ResizeObserver;
  private video: HTMLVideoElement | null = null;
  private fullscreenHandler: () => void;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'myanmar-subtitles-host';

    this.shadow = this.host.attachShadow({ mode: 'open' });

    // Inject styles into shadow root
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'subtitle-text';
    this.shadow.appendChild(this.subtitleEl);

    this.resizeObserver = new ResizeObserver(() => this.reposition());

    // Bind handler so we can remove it later
    this.fullscreenHandler = () => this.handleFullscreen();
    document.addEventListener('fullscreenchange', this.fullscreenHandler);
  }

  private getStyles(): string {
    // Use chrome.runtime.getURL for the font file
    const fontUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('fonts/NotoSansMyanmar-Regular.ttf')
      : '';

    return `
      @font-face {
        font-family: 'Noto Sans Myanmar';
        src: url('${fontUrl}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }

      :host {
        all: initial;
        position: absolute;
        left: 0;
        right: 0;
        z-index: 2147483647;
        pointer-events: none;
        display: flex;
        justify-content: center;
        align-items: flex-end;
      }

      .subtitle-text {
        font-family: 'Noto Sans Myanmar', 'Myanmar Text', sans-serif;
        font-size: 28px;
        line-height: 1.4;
        color: #ffffff;
        background: rgba(0, 0, 0, 0.75);
        padding: 4px 16px;
        border-radius: 4px;
        text-align: center;
        max-width: 80%;
        white-space: pre-line;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
        margin-bottom: 8px;
      }

      .subtitle-text:empty {
        display: none;
      }
    `;
  }

  attachTo(video: HTMLVideoElement): void {
    if (this.video === video) return;

    this.detach();
    this.video = video;

    // Ensure the video's parent is positioned so absolute children work
    const parent = video.parentElement;
    if (!parent) return;

    const parentPos = getComputedStyle(parent).position;
    if (parentPos === 'static') {
      parent.style.position = 'relative';
    }

    parent.appendChild(this.host);
    this.resizeObserver.observe(video);
    this.reposition();
  }

  detach(): void {
    if (this.video) {
      this.resizeObserver.unobserve(this.video);
      this.video = null;
    }
    this.host.remove();
  }

  setText(text: string): void {
    this.subtitleEl.textContent = text;
  }

  clear(): void {
    this.subtitleEl.textContent = '';
  }

  private reposition(): void {
    if (!this.video) return;
    const videoRect = this.video.getBoundingClientRect();
    const parentEl = this.host.parentElement;
    if (!parentEl) return;
    const parentRect = parentEl.getBoundingClientRect();

    this.host.style.position = 'absolute';
    this.host.style.left = `${videoRect.left - parentRect.left}px`;
    this.host.style.top = `${videoRect.top - parentRect.top}px`;
    this.host.style.width = `${videoRect.width}px`;
    this.host.style.height = `${videoRect.height}px`;
  }

  private handleFullscreen(): void {
    const fsElement = document.fullscreenElement;

    if (fsElement) {
      // Move overlay inside the fullscreen element so it stays visible
      fsElement.appendChild(this.host);
    } else if (this.video?.parentElement) {
      // Return overlay to video parent on fullscreen exit
      this.video.parentElement.appendChild(this.host);
    }

    this.reposition();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    document.removeEventListener('fullscreenchange', this.fullscreenHandler);
    this.detach();
  }
}
