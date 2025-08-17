import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
hljs.registerLanguage('typescript', typescript);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <div class="layout">
    <div class="left">
      <div class="container">
        <h2>ZOOM:BIT Builder</h2>
        <div class="chat">
          <label>Prompt</label>
          <textarea [(ngModel)]="prompt" rows="4" style="width:100%" placeholder="Describe what to build (info only)"></textarea>
          <div class="actions">
            <button (click)="sendPrompt()" [disabled]="building">{{ building ? 'Building...' : 'Send to Build' }}</button>
            <button (click)="syncToMicrobit()" [disabled]="!canSync || syncing">{{ syncing ? 'Syncing...' : 'Sync to MICROBIT' }}</button>
          </div>
        </div>

        <!-- TypeScript viewer below the actions row -->
        <div class="code-header" style="display:flex; align-items:center; gap:8px; margin:8px 0;">
          <strong>TypeScript</strong>
          <span style="margin-left:auto; display:flex; gap:8px;">
            <button (click)="toggleCode()">{{ showCode ? 'Hide' : 'Show' }}</button>
            <button (click)="refreshCode()">Refresh</button>
          </span>
        </div>
        <div *ngIf="showCode" class="code-box">
          <pre class="code-view"><code class="hljs" [innerHTML]="highlightedHtml"></code></pre>
        </div>
      </div>
    </div>

    <!-- Right pane: Document images by page no. -->
    <div class="right-pane">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <strong>Documents</strong>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <label>Page:</label>
        <input type="number" [(ngModel)]="page" min="1" [max]="images.length || 1" style="width:80px;" />
        <button (click)="prevPage()" [disabled]="page <= 1">Prev</button>
        <button (click)="nextPage()" [disabled]="page >= images.length">Next</button>
        <span>{{ page }} / {{ images.length || 0 }}</span>
      </div>
      <div class="img-box">
        <img *ngIf="currentImage" [src]="currentImageUrl" alt="Page image" />
        <span *ngIf="!currentImage">No image</span>
      </div>
    </div>
  </div>

  <div class="status-bar">{{ statusText }}</div>

  <!-- Bottom serial pane -->
  <div class="serial-pane">
    <div class="controls">
      <button (click)="refreshPorts()">Refresh Ports</button>
      <select [(ngModel)]="selectedPort">
        <option [ngValue]="''">Select port...</option>
        <option *ngFor="let p of ports" [ngValue]="p.path">{{ p.path }} {{ p.friendlyName ? '('+p.friendlyName+')' : '' }}</option>
      </select>
      <input type="number" [(ngModel)]="baud" min="1200" step="100" style="width: 100px;" />
      <button (click)="connect()" [disabled]="connected || !selectedPort">Connect</button>
      <button (click)="disconnect()" [disabled]="!connected">Disconnect</button>
      <span class="status-dot" [class.ok]="connected" [class.fail]="!connected"></span>
    </div>
    <div class="log" #logBox>
      <pre>{{ logText }}</pre>
    </div>
  </div>
  `,
  styles: [`
    .layout { display: flex; gap: 12px; height: calc(100vh - 148px); padding: 8px 12px 8px 12px; box-sizing: border-box; overflow: hidden; }
    .actions { position: sticky; top: 0; display:flex; gap:8px; align-items:center; padding:6px 0; background: #ffffff; z-index: 1; border-bottom: 1px solid #eee; }
    @media (prefers-color-scheme: dark) { .actions { background: #121212; border-bottom-color: #222; } }
.left { flex: 1 1 50%; padding-right: 12px; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.container { display: flex; flex-direction: column; min-height: 0; overflow: hidden; flex: 1 1 0; }
    .right-pane { flex: 1 1 50%; border-left: 1px solid #ddd; padding-left: 12px; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
    .right-pane .img-box { flex: 1 1 auto; width: 100%; background: #f5f5f5; display: flex; align-items: center; justify-content: center; border: 1px dashed #ccc; min-height: 0; }
.right-pane .img-box img { max-width: 100%; max-height: 100%; object-fit: contain; }
.code-box { margin-top: 10px; flex: 1 1 0; min-height: 0; height: auto; border: 1px solid #ddd; background: #0b0b0b; display: flex; }
.code-view { margin: 0; padding: 8px 0 16px 0; color: #eee; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; line-height: 1.4; width: 100%; flex: 1 1 0; min-height: 0; overflow: auto; }
    .code-view code { display: block; width: 100%; height: 100%; }
.code-view .line { display: grid; grid-template-columns: 6ch 1fr; column-gap: 12px; padding: 0 12px; }
    .code-view .ln { color: #8a8f98; text-align: right; user-select: none; -webkit-user-select: none; background: rgba(255,255,255,0.04); padding: 0 8px 0 4px; border-right: 1px solid #444; }
.code-view .lx { white-space: pre-wrap; word-break: break-word; }
    .code-view::after { content: ''; display: block; height: 12px; }
    /* Minimal highlight colors applied to innerHTML content */
    :host ::ng-deep .code-view .hljs-keyword,
    :host ::ng-deep .code-view .hljs-selector-tag,
    :host ::ng-deep .code-view .hljs-literal { color: #c678dd; }
    :host ::ng-deep .code-view .hljs-string,
    :host ::ng-deep .code-view .hljs-meta .hljs-string { color: #98c379; }
    :host ::ng-deep .code-view .hljs-number,
    :host ::ng-deep .code-view .hljs-attr { color: #d19a66; }
    :host ::ng-deep .code-view .hljs-title,
    :host ::ng-deep .code-view .hljs-name,
    :host ::ng-deep .code-view .hljs-type { color: #61afef; }
    :host ::ng-deep .code-view .hljs-comment { color: #7f848e; }
    .status-bar { position: fixed; left: 0; right: 0; bottom: 0; height: 28px; display:flex; align-items:center; gap:12px; padding: 0 12px; background:#1a1a1a; color:#ddd; border-top:1px solid #333; }
    .status-bar .ok { color:#17b317; }
    .status-bar .fail { color:#d9534f; }
    .serial-pane { position: fixed; left: 0; right: 0; bottom: 28px; height: 120px; background: #0b0b0b; color: #d6d6d6; border-top: 1px solid #333; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    .serial-pane .controls { display: flex; align-items: center; gap: 8px; padding: 6px; border-bottom: 1px solid #333; }
    .serial-pane .log { height: calc(100% - 42px); overflow: auto; padding: 6px; }
    .serial-pane pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .status-dot { display:inline-block; width:10px; height:10px; border-radius: 50%; background:#555; }
    .status-dot.ok { background: #17b317; }
    .status-dot.fail { background: #a33; }
  `]
})
export class AppComponent {
  constructor(private zone: NgZone) {}
  title = 'zoombit-desktop';
  prompt = '';
  building = false;
  buildOk: any = null;
  buildMsg = '';
  canSync = false;
  syncing = false;
  syncMsg = '';

  ports: any[] = [];
  selectedPort: string = '';
  baud = 115200;
  connected = false;
  logText = '';

  // TypeScript code view state
  showCode = true;
  tsCode = `input.onButtonPressed(Button.A, function () {
    basic.showIcon(IconNames.Happy)
})
input.onButtonPressed(Button.B, function () {
    basic.showIcon(IconNames.Sad)
})
basic.showIcon(IconNames.Heart)

basic.forever(function () {
    serial.writeLine("Hello, world!")
    basic.pause(1000)
})`;
  highlightedHtml = '';

  // Right pane state
  docFolder: string = '';
  images: string[] = [];
  page = 1;

  get currentImage(): string | null {
    if (!this.images.length) return null;
    const idx = Math.min(Math.max(1, this.page), this.images.length) - 1;
    return this.images[idx];
  }

  get currentImageUrl(): string | null {
    const p = this.currentImage;
    return p ? ('file:///' + p.replace(/\\/g, '/')) : null;
  }

  async ngOnInit() {
    await this.refreshPorts();
    await this.loadImages();
    this.renderCode();
    // @ts-ignore
    (window as any).electronAPI?.onSerialData?.((line: string) => {
      this.appendLog(line);
    });
    // Subscribe to build events via SSE
    try {
      const es = new EventSource('http://localhost:3000/events');
      es.onmessage = () => {};
      es.addEventListener('build-succeeded', (/*e*/) => {
        this.zone.run(async () => {
          const ok = await this.loadCodeFromServer();
          if (ok) this.renderCode();
        });
      });
      es.addEventListener('build-failed', (e: any) => {
        console.warn('Build failed event', e?.data);
      });
    } catch {}
  }

  appendLog(line: string) {
    const ts = new Date().toLocaleTimeString();
    this.logText += `[${ts}] ${line}\n`;
    // Allow Angular to flush, then auto-scroll via setTimeout
    setTimeout(() => {
      const el = document.querySelector('.serial-pane .log');
      if (el) (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight;
    });
  }

  // Computed status bar text
  get statusText(): string {
    const parts: string[] = [];
    if (this.buildOk === true) parts.push('Build succeeded');
    else if (this.buildOk === false) parts.push('Build failed');
    if (this.syncMsg) parts.push(this.syncMsg);
    return parts.join(' • ');
  }

  // Folder selection no longer required; default documents folder is used by main process.

  async loadImages() {
    try {
      // @ts-ignore
      const res = await (window as any).electronAPI?.listDocImages?.();
      if (res?.success) {
        this.images = res.files || [];
        this.page = this.images.length ? 1 : 0;
      }
    } catch {
      this.images = [];
      this.page = 0;
    }
  }

  async refreshPorts() {
    try {
      // @ts-ignore
      const list = await (window as any).electronAPI?.listSerial?.();
      this.ports = Array.isArray(list) ? list : [];
    } catch {
      this.ports = [];
    }
  }

  prevPage() {
    if (this.page > 1) this.page--;
  }
  nextPage() {
    if (this.page < this.images.length) this.page++;
  }

  toggleCode() {
    this.showCode = !this.showCode;
  }

  refreshCode() {
    this.renderCode();
  }

  renderCode() {
    try {
      const highlighted = hljs.highlight(this.tsCode, { language: 'typescript' }).value;
      this.highlightedHtml = highlighted;
    } catch {
      this.highlightedHtml = this.escapeHtml(this.tsCode);
    }
  }

  escapeHtml(s: string) {
    return s.replace(/[\u0026\u003c\u003e"']/g, (ch) => ({ '\u0026': '\u0026amp;', '\u003c': '\u0026lt;', '\u003e': '\u0026gt;', '"': '\u0026quot;', "'": '\u0026#39;' }[ch] as string));
  }

  addLineNumbers(html: string) {
    // line numbers removed
    return html;
  }

  async connect() {
    if (!this.selectedPort) return;
    try {
      // @ts-ignore
      const res = await (window as any).electronAPI?.openSerial?.(this.selectedPort, this.baud);
      this.connected = !!res?.success;
      if (!this.connected) this.appendLog(`Failed to open ${this.selectedPort}: ${res?.error || 'unknown error'}`);
      else this.appendLog(`Connected ${this.selectedPort} @ ${this.baud}`);
    } catch (e: any) {
      this.connected = false;
      this.appendLog(String(e));
    }
  }

  async disconnect() {
    try {
      // @ts-ignore
      const res = await (window as any).electronAPI?.closeSerial?.();
      if (res?.success) this.appendLog('Disconnected.');
    } finally {
      this.connected = false;
    }
  }

  async sendPrompt() {
    this.building = true;
    this.canSync = false;
    this.buildOk = null;
    this.buildMsg = '';
    try {
      const res = await fetch('http://localhost:3000/build', { method: 'POST' });
      const json = await res.json();
      this.buildOk = json.success;
      this.buildMsg = json.message || (json.success ? 'Build succeeded' : 'Build failed');
      this.canSync = !!json.success;
      if (json.success) {
        await this.loadCodeFromServer();
        this.renderCode();
      }
    } catch (e: any) {
      this.buildOk = false;
      this.buildMsg = String(e);
      this.canSync = false;
    } finally {
      this.building = false;
    }
  }

  async loadCodeFromServer() {
    try {
      const resp = await fetch('http://localhost:3000/code');
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const js = await resp.json();
          if (js && (js.code || js.ts || js.source)) {
            this.tsCode = js.code || js.ts || js.source;
            return true;
          }
        } else {
          const txt = await resp.text();
          if (txt) {
            this.tsCode = txt;
            return true;
          }
        }
      }
    } catch {}
    return false;
  }

  async syncToMicrobit() {
    if (!this.canSync) return;
    this.syncing = true;
    this.syncMsg = '';
    try {
      // @ts-ignore
      const result = await (window as any).electronAPI?.syncHex?.();
      if (result?.success) {
        this.syncMsg = `Copied to ${result.drive}`;
      } else {
        this.syncMsg = `Failed: ${result?.error || 'unknown error'}`;
      }
    } catch (e: any) {
      this.syncMsg = String(e);
    } finally {
      this.syncing = false;
    }
  }
}
