import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Collection, CollectionItem, Environment, HistoryEntry } from '../../shared/api-toolkit-contracts.js'

function dataDir(): string {
  const dir = join(app.getPath('userData'), 'api-toolkit-data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function dir(sub: string): string {
  const d = join(dataDir(), sub)
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
}

// ─── Collections ────────────────────────────────────────────────────────────

export function getCollections(): Collection[] {
  const d = dir('collections')
  const files = readdirSync(d).filter((f) => f.endsWith('.json'))
  return files.map((f) => readJson<Collection>(join(d, f), null as unknown as Collection)).filter(Boolean)
}

export function saveCollection(col: Collection): void {
  writeJson(join(dir('collections'), `${col.id}.json`), { ...col, updatedAt: Date.now() })
}

export function deleteCollection(id: string): void {
  const p = join(dir('collections'), `${id}.json`)
  if (existsSync(p)) unlinkSync(p)
}

function findAndUpdateItem(
  items: CollectionItem[],
  id: string,
  updater: (item: CollectionItem) => CollectionItem | null
): { items: CollectionItem[]; found: boolean } {
  let found = false
  const next = items.reduce<CollectionItem[]>((acc, item) => {
    if (item.id === id) {
      found = true
      const updated = updater(item)
      if (updated !== null) acc.push(updated)
      return acc
    }
    if (item.type === 'folder') {
      const res = findAndUpdateItem(item.items, id, updater)
      if (res.found) found = true
      acc.push({ ...item, items: res.items })
      return acc
    }
    acc.push(item)
    return acc
  }, [])
  return { items: next, found }
}

export function addCollectionItem(
  collectionId: string,
  item: CollectionItem,
  parentFolderId?: string
): Collection | null {
  const col = getCollections().find((c) => c.id === collectionId)
  if (!col) return null
  let items: CollectionItem[]
  if (parentFolderId) {
    const res = findAndUpdateItem(col.items, parentFolderId, (f) => {
      if (f.type !== 'folder') return f
      return { ...f, items: [...f.items, item] }
    })
    items = res.items
  } else {
    items = [...col.items, item]
  }
  const updated: Collection = { ...col, items, updatedAt: Date.now() }
  saveCollection(updated)
  return updated
}

export function updateCollectionItem(
  collectionId: string,
  itemId: string,
  patch: Partial<CollectionItem>
): Collection | null {
  const col = getCollections().find((c) => c.id === collectionId)
  if (!col) return null
  const res = findAndUpdateItem(col.items, itemId, (item) => ({ ...item, ...patch } as CollectionItem))
  const updated: Collection = { ...col, items: res.items, updatedAt: Date.now() }
  saveCollection(updated)
  return updated
}

export function deleteCollectionItem(collectionId: string, itemId: string): Collection | null {
  const col = getCollections().find((c) => c.id === collectionId)
  if (!col) return null
  const res = findAndUpdateItem(col.items, itemId, () => null)
  const updated: Collection = { ...col, items: res.items, updatedAt: Date.now() }
  saveCollection(updated)
  return updated
}

// ─── Postman v2.1 import ─────────────────────────────────────────────────────

interface PostmanItem {
  name: string
  item?: PostmanItem[]
  request?: {
    method?: string
    url?: string | { raw?: string; query?: { key: string; value: string; disabled?: boolean }[] }
    header?: { key: string; value: string; disabled?: boolean }[]
    body?: {
      mode?: string
      raw?: string
      formdata?: { key: string; value: string; disabled?: boolean }[]
      urlencoded?: { key: string; value: string; disabled?: boolean }[]
    }
    auth?: { type: string; bearer?: { key: string; value: string }[]; basic?: { key: string; value: string }[]; apikey?: { key: string; value: string }[] }
  }
}

function mapPostmanItems(items: PostmanItem[]): CollectionItem[] {
  return items.map((item): CollectionItem => {
    if (Array.isArray(item.item) && item.item.length > 0) {
      return { type: 'folder', id: crypto.randomUUID(), name: item.name, items: mapPostmanItems(item.item) }
    }
    const r = item.request ?? {}
    const rawUrl = typeof r.url === 'string' ? r.url : (r.url?.raw ?? '')
    const params = typeof r.url === 'object' && r.url?.query
      ? r.url.query.map((q) => ({ key: q.key, value: q.value, enabled: !q.disabled }))
      : []
    const headers = (r.header ?? []).map((h) => ({ key: h.key, value: h.value, enabled: !h.disabled }))
    const body = (() => {
      if (!r.body) return { mode: 'none' as const }
      if (r.body.mode === 'raw') return { mode: 'raw' as const, raw: r.body.raw ?? '' }
      if (r.body.mode === 'formdata') {
        return { mode: 'form' as const, formFields: (r.body.formdata ?? []).map((f) => ({ key: f.key, value: f.value, enabled: !f.disabled })) }
      }
      if (r.body.mode === 'urlencoded') {
        return { mode: 'form' as const, formFields: (r.body.urlencoded ?? []).map((f) => ({ key: f.key, value: f.value, enabled: !f.disabled })) }
      }
      return { mode: 'none' as const }
    })()
    const auth = (() => {
      if (!r.auth) return { type: 'none' as const }
      const t = r.auth.type
      if (t === 'bearer') {
        const token = r.auth.bearer?.find((b) => b.key === 'token')?.value ?? ''
        return { type: 'bearer' as const, token }
      }
      if (t === 'basic') {
        const username = r.auth.basic?.find((b) => b.key === 'username')?.value ?? ''
        const password = r.auth.basic?.find((b) => b.key === 'password')?.value ?? ''
        return { type: 'basic' as const, username, password }
      }
      if (t === 'apikey') {
        const key = r.auth.apikey?.find((b) => b.key === 'key')?.value ?? ''
        const value = r.auth.apikey?.find((b) => b.key === 'value')?.value ?? ''
        return { type: 'apiKey' as const, key, value, in: 'header' as const }
      }
      return { type: 'none' as const }
    })()
    return {
      type: 'request',
      id: crypto.randomUUID(),
      name: item.name,
      protocol: 'http',
      httpRequest: {
        method: (r.method ?? 'GET') as import('../../shared/api-toolkit-contracts.js').HttpMethod,
        url: rawUrl,
        params,
        headers,
        body,
        auth,
        timeout: 30000,
      },
    }
  })
}

export function importPostmanCollection(jsonStr: string): { collection: Collection; count: number } {
  const pm = JSON.parse(jsonStr)
  if (!pm.info || !pm.info.name) throw new Error('Not a valid Postman v2.1 collection (missing info.name)')
  const items = mapPostmanItems(pm.item ?? [])
  const count = (function countRequests(its: CollectionItem[]): number {
    return its.reduce((n, i) => n + (i.type === 'folder' ? countRequests(i.items) : 1), 0)
  })(items)
  const col: Collection = {
    id: crypto.randomUUID(),
    name: pm.info.name,
    description: pm.info.description ?? '',
    items,
    variables: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  saveCollection(col)
  return { collection: col, count }
}

// ─── Postman v2.1 export ─────────────────────────────────────────────────────

function toPostmanItems(items: CollectionItem[]): unknown[] {
  return items.map((item) => {
    if (item.type === 'folder') {
      return { name: item.name, item: toPostmanItems(item.items) }
    }
    const req = item.httpRequest
    if (!req) return { name: item.name, request: { method: 'GET', url: { raw: '' } } }
    const url: Record<string, unknown> = { raw: req.url }
    const enabledParams = req.params.filter((p) => p.enabled && p.key)
    if (enabledParams.length > 0) {
      url.query = enabledParams.map((p) => ({ key: p.key, value: p.value }))
    }
    const auth: Record<string, unknown> = { type: req.auth.type }
    if (req.auth.type === 'bearer') auth.bearer = [{ key: 'token', value: req.auth.token }]
    if (req.auth.type === 'basic') auth.basic = [{ key: 'username', value: req.auth.username }, { key: 'password', value: req.auth.password }]
    if (req.auth.type === 'apiKey') auth.apikey = [{ key: 'key', value: req.auth.key }, { key: 'value', value: req.auth.value }]
    const body: Record<string, unknown> = {}
    if (req.body.mode !== 'none') {
      body.mode = req.body.mode === 'json' ? 'raw' : req.body.mode
      if (req.body.mode === 'raw' || req.body.mode === 'json') body.raw = req.body.raw ?? ''
      if (req.body.mode === 'form') body.formdata = (req.body.formFields ?? []).map((f) => ({ key: f.key, value: f.value }))
      if (req.body.mode === 'urlencoded') body.urlencoded = (req.body.formFields ?? []).map((f) => ({ key: f.key, value: f.value }))
    }
    return {
      name: item.name,
      request: {
        method: req.method,
        url,
        header: req.headers.filter((h) => h.enabled && h.key).map((h) => ({ key: h.key, value: h.value })),
        auth: req.auth.type !== 'none' ? auth : undefined,
        body: req.body.mode !== 'none' ? body : undefined,
      },
    }
  })
}

export function exportPostmanCollection(collectionId: string): string {
  const col = getCollections().find((c) => c.id === collectionId)
  if (!col) throw new Error(`Collection ${collectionId} not found`)
  const pm = {
    info: {
      name: col.name,
      description: col.description ?? '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: toPostmanItems(col.items),
    variable: col.variables.map((v) => ({ key: v.key, value: v.value })),
  }
  return JSON.stringify(pm, null, 2)
}

// ─── Environments ────────────────────────────────────────────────────────────

export function getEnvironments(): Environment[] {
  const d = dir('environments')
  const files = readdirSync(d).filter((f) => f.endsWith('.json'))
  return files.map((f) => readJson<Environment>(join(d, f), null as unknown as Environment)).filter(Boolean)
}

export function saveEnvironment(env: Environment): void {
  writeJson(join(dir('environments'), `${env.id}.json`), env)
}

export function deleteEnvironment(id: string): void {
  const p = join(dir('environments'), `${id}.json`)
  if (existsSync(p)) unlinkSync(p)
}

// ─── History ─────────────────────────────────────────────────────────────────

const HISTORY_FILE = () => join(dataDir(), 'history.json')
const MAX_HISTORY = 500

export function getHistory(): HistoryEntry[] {
  return readJson<HistoryEntry[]>(HISTORY_FILE(), [])
}

export function addHistory(entry: HistoryEntry): void {
  const all = getHistory()
  all.unshift(entry)
  writeJson(HISTORY_FILE(), all.slice(0, MAX_HISTORY))
}

export function clearHistory(): void {
  writeJson(HISTORY_FILE(), [])
}
