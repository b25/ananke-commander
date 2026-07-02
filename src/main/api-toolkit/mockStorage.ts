import { app } from 'electron'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MockServerData } from '../../shared/api-toolkit-contracts.js'
import { readJson, writeJson } from './storage-io.js'

const DEFAULT: MockServerData = { port: 3001, routes: [] }

function dataFile(): string {
  const dir = join(app.getPath('userData'), 'api-toolkit-data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'mock-server.json')
}

export function readMockData(): MockServerData {
  return readJson<MockServerData>(dataFile(), { ...DEFAULT })
}

export function writeMockData(data: MockServerData): void {
  writeJson(dataFile(), data)
}
