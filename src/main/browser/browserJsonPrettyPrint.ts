import type { WebContents } from 'electron'

/** Apply or clear Ananke-managed JSON pretty-print inside guest WebContents. */
export async function applyJsonPrettyPrint(
  wc: WebContents,
  enabled: boolean
): Promise<boolean | 'reload'> {
  if (wc.isDestroyed()) return false
  try {
    return await wc.executeJavaScript(buildJsonPrettyPrintScript(enabled), true)
  } catch {
    return false
  }
}

function buildJsonPrettyPrintScript(enabled: boolean): string {
  if (!enabled) {
    return `(() => {
      if (document.body?.dataset.anankeJsonPretty === '1') {
        delete document.body.dataset.anankeJsonPretty;
        return 'reload';
      }
      return false;
    })()`
  }
  return `(() => {
    try {
      const body = document.body;
      if (!body) return false;
      if (body.dataset.anankeJsonPretty === '1') return true;

      let raw = '';
      const pre = body.querySelector('pre');
      if (pre?.textContent?.trim()) raw = pre.textContent;
      else raw = body.innerText || body.textContent || '';
      raw = raw.trim();
      if (!raw || (raw[0] !== '{' && raw[0] !== '[')) return false;

      const parsed = JSON.parse(raw);
      const formatted = JSON.stringify(parsed, null, 2);
      const out = document.createElement('pre');
      out.style.cssText = 'margin:0;padding:12px;font:12px ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;background:#0d1117;color:#c9d1d9;';
      out.textContent = formatted;
      body.replaceChildren(out);
      body.dataset.anankeJsonPretty = '1';
      return true;
    } catch {
      return false;
    }
  })()`
}
