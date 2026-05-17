import type { AppSettings } from '../../shared/contracts.js'
import { setGuestAllowedHosts } from './browserSecurity.js'

export function syncBrowserGuestHostsFromSettings(settings: AppSettings): void {
  setGuestAllowedHosts(settings.browser?.extraAllowedHosts ?? [])
}
