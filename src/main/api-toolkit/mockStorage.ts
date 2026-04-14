import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MockServerData } from '../../shared/api-toolkit-contracts.js'

const DEFAULT: MockServerData = { port: 3001, routes: [] }

function dataFile(): string {
  const dir = join(app.getPath('userData'), 'api-toolkit-data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'mock-server.json')
}

export function readMockData(): MockServerData {
  try {
    return JSON.parse(readFileSync(dataFile(), 'utf8')) as MockServerData
  } catch {
    return { ...DEFAULT }
  }
}

export function writeMockData(data: MockServerData): void {
  writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf8')
}
