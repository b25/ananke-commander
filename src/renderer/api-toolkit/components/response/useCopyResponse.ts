import { useState } from 'react'

export function useCopyResponse() {
  const [copied, setCopied] = useState(false)

  function copyBody(body: string) {
    window.ananke.clipboard.writeText(body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return { copied, copyBody }
}
