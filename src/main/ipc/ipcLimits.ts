export const IPC_LIMITS = {
  clipboardText: 1024 * 1024,
  fsWriteUtf8: 16 * 1024 * 1024,
  notesBody: 8 * 1024 * 1024,
  tomlApply: 4 * 1024 * 1024,
  stateSetJsonEstimate: 8 * 1024 * 1024
} as const

export function assertMaxBytes(label: string, value: string, max: number): void {
  const len = Buffer.byteLength(value, 'utf8')
  if (len > max) {
    throw new Error(`${label} exceeds ${max} byte limit (${len} bytes)`)
  }
}
