const RAW_KEY = 'ananke.apiToolkit.responseRaw'
const REMEMBER_KEY = 'ananke.apiToolkit.rememberResponseView'

export type ResponseViewPrefs = {
  raw: boolean
  remember: boolean
}

export function loadResponseViewPrefs(): ResponseViewPrefs {
  try {
    const raw = localStorage.getItem(RAW_KEY) === '1'
    const remember = localStorage.getItem(REMEMBER_KEY)
    // Default pretty (raw=false); legacy installs without keys use pretty.
    return {
      remember: remember !== '0',
      raw: remember === null ? false : raw,
    }
  } catch {
    return { raw: false, remember: true }
  }
}

/** Per-tab view mode; falls back to app default. */
export function tabResponseViewRaw(tab: { responseViewRaw?: boolean }, globalRaw: boolean): boolean {
  return tab.responseViewRaw ?? globalRaw
}

export function saveResponseViewPrefs(prefs: ResponseViewPrefs): void {
  try {
    localStorage.setItem(REMEMBER_KEY, prefs.remember ? '1' : '0')
    if (prefs.remember) localStorage.setItem(RAW_KEY, prefs.raw ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
}
