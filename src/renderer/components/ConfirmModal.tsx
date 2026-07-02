import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/useModal'

/**
 * Renders inside ConfirmModal to fire ananke:modal-open/close events.
 * Lives in its own component so it can be conditionally MOUNTED (not conditionally
 * calling a hook — that would violate the Rules of Hooks).
 */
function ModalSuspender() {
  useModal()
  return null
}

export type ConfirmModalProps = {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'destructive'
  /**
   * When set, the Confirm button stays disabled until the user types this exact
   * string. Use for irreversible actions (e.g. workspace delete).
   */
  requireTyped?: string
  onConfirm: () => void
  onCancel: () => void
  /**
   * Skip the ananke:modal-open/close browser-suspend events. Pass `true` when
   * ConfirmModal is nested inside another modal that already called useModal(),
   * to prevent the inner modal-close from briefly un-suspending browser panes.
   */
  noSuspend?: boolean
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  requireTyped,
  onConfirm,
  onCancel,
  noSuspend = false,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('')
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (requireTyped) {
      inputRef.current?.focus()
    } else if (tone === 'destructive') {
      // Focus Cancel for destructive actions to avoid accidental confirmation
      cancelBtnRef.current?.focus()
    } else {
      confirmBtnRef.current?.focus()
    }
  }, [requireTyped, tone])

  const canConfirm = !requireTyped || typed === requireTyped

  return createPortal(
    <>
      {/* ModalSuspender is conditionally rendered (not a conditional hook call) */}
      {!noSuspend && <ModalSuspender />}
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={onCancel}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      >
        <div
          className="modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          aria-describedby={message ? 'confirm-modal-msg' : undefined}
          onClick={(e) => e.stopPropagation()}
          style={{ minWidth: 340, maxWidth: 480 /* intentional modal sizing constraints; no design-token equivalent exists */ }}
        >
          <h2
            id="confirm-modal-title"
            style={{
              color: tone === 'destructive' ? 'var(--danger)' : 'var(--text)',
              margin: '0 0 var(--space-md)',
              fontSize: 'var(--text-lg)',
            }}
          >
            {title}
          </h2>

          {message && (
            <p
              id="confirm-modal-msg"
              style={{
                margin: '0 0 var(--space-md)',
                color: 'var(--muted)',
                fontSize: 'var(--text-sm)',
                lineHeight: 1.5,
              }}
            >
              {message}
            </p>
          )}

          {requireTyped && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <p style={{ margin: '0 0 var(--space-sm)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                Type{' '}
                <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                  {requireTyped}
                </strong>{' '}
                to confirm:
              </p>
              <input
                ref={inputRef}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canConfirm) onConfirm()
                  if (e.key === 'Escape') onCancel()
                }}
                style={{ width: '100%', boxSizing: 'border-box' }}
                aria-label={`Type ${requireTyped} to confirm`}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
            <button ref={cancelBtnRef} type="button" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              className={tone !== 'destructive' ? 'primary' : undefined}
              style={
                tone === 'destructive'
                  ? {
                      background: 'var(--danger)',
                      borderColor: 'var(--danger)',
                      color: 'var(--text-on-accent)',
                      opacity: canConfirm ? 1 : 0.45,
                    }
                  : undefined
              }
              onClick={onConfirm}
              disabled={!canConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
