import type { WebContents } from 'electron'
import { HarCapture } from './harCapture.js'

/**
 * Owns the per-pane HAR captures. Thin registry over `HarCapture` so BrowserPaneManager
 * doesn't carry HAR bookkeeping alongside native-view lifecycle.
 */
export class HarCaptureService {
  private captures = new Map<string, HarCapture>()

  start(paneId: string, wc: WebContents): void {
    let capture = this.captures.get(paneId)
    if (!capture) {
      capture = new HarCapture()
      this.captures.set(paneId, capture)
    }
    capture.start(wc)
  }

  stop(paneId: string): void {
    this.captures.get(paneId)?.stop()
  }

  getData(paneId: string): object | null {
    return this.captures.get(paneId)?.getHar() ?? null
  }

  isRecording(paneId: string): boolean {
    return this.captures.get(paneId)?.isRecording ?? false
  }

  getEntryCount(paneId: string): number {
    return this.captures.get(paneId)?.entryCount ?? 0
  }

  /** Stop and forget a pane's capture (on pane destroy). */
  delete(paneId: string): void {
    this.captures.get(paneId)?.stop()
    this.captures.delete(paneId)
  }
}
