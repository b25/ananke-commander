export function isEditableTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.getAttribute('contenteditable') === 'true') return true
  if (el.getAttribute('role') === 'combobox' || el.getAttribute('role') === 'textbox') return true
  return Boolean(el.closest('[contenteditable="true"]'))
}

/** Return false when the user is typing in a field — shell shortcuts should not run. */
export function shouldShellHandleShortcut(e: KeyboardEvent): boolean {
  if (e.defaultPrevented) return false
  if (isEditableTarget(document.activeElement)) return false
  return true
}
