import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Collection, Environment, HistoryEntry } from '../../shared/api-toolkit-contracts.js'

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
  writeJson(join(dir('collections'), `${col.id}.json`), col)
}

export function deleteCollection(id: string): void {
  const p = join(dir('collections'), `${id}.json`)
  if (existsSync(p)) unlinkSync(p)
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
