const STORAGE_KEY = 'ananke.browser.jsonPrettyPrint'

export function loadBrowserJsonPrettyPrint(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === null) return true
    return v === '1'
  } catch {
    return true
  }
}

export function saveBrowserJsonPrettyPrint(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // ignore
  }
}

export function paneJsonPrettyPrint(pane: { jsonPrettyPrint?: boolean }): boolean {
  return pane.jsonPrettyPrint ?? loadBrowserJsonPrettyPrint()
}
