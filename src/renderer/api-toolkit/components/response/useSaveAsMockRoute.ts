import { useState } from 'react'
import type { Tab } from '../../store'
import { useStore } from '../../store'
import type { MockRoute } from '../../../../shared/api-toolkit-contracts'

export function useSaveAsMockRoute(tab: Tab) {
  const [savedAsMock, setSavedAsMock] = useState(false)
  const { mockData, saveMockData, setSidebarTab } = useStore()

  async function saveAsMock() {
    if (!tab.httpResponse) return
    const req = tab.httpRequest
    let urlPattern = '/'
    try {
      urlPattern = new URL(req.url).pathname || '/'
    } catch {
      urlPattern = req.url.startsWith('/') ? req.url.split('?')[0] : '/' + req.url.split('?')[0]
    }
    const route: MockRoute = {
      id: crypto.randomUUID(),
      name: tab.name !== 'New Request' ? tab.name : urlPattern,
      enabled: true,
      method: req.method,
      urlPattern,
      statusCode: tab.httpResponse.status,
      responseHeaders: { 'Content-Type': tab.httpResponse.headers['content-type'] ?? 'application/json' },
      responseBody: tab.httpResponse.body,
      delay: 0,
      hitCount: 0,
      createdAt: Date.now(),
    }
    await saveMockData({ ...mockData, routes: [...mockData.routes, route] })
    setSidebarTab('mock')
    setSavedAsMock(true)
    setTimeout(() => setSavedAsMock(false), 2000)
  }

  return { savedAsMock, saveAsMock }
}
