#!/usr/bin/env node
/**
 * Ananke Commander Debug MCP Server
 * Exposes workspace state inspection tools to Claude.
 * Run: node scripts/debug-mcp.mjs
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const STATE_JSON = join(homedir(), 'Library/Application Support/ananke-commander/ananke-commander-state.json')
const STATE_TOML = join(homedir(), 'Library/Application Support/ananke-commander/workspace.toml')

function readState() {
  const raw = readFileSync(STATE_JSON, 'utf8')
  return JSON.parse(raw)
}

function floorPct(n) { return Math.floor(n) }

function screenOf(pane) {
  const col = floorPct(pane.xPct), row = floorPct(pane.yPct)
  return row * 2 + col
}

function debugInfo(wsName) {
  const snap = readState()
  const workspaces = snap.workspaces
  const ws = wsName
    ? workspaces.find(w => w.name === wsName || w.id.startsWith(wsName))
    : workspaces.find(w => w.id === snap.activeWorkspaceId)
  if (!ws) return `Workspace not found. Available: ${workspaces.map(w => `${w.name} (${w.id.slice(0,8)})`).join(', ')}`

  const allCollapsed = new Set(Object.values(ws.screenCollapsed ?? {}).flat())
  const lines = [
    `=== Ananke Commander Debug Info ===`,
    `Workspace: ${ws.name} (${ws.id})`,
    `Total panes: ${ws.panes.length}`,
    ``,
    `--- Screen layouts ---`,
  ]
  for (let i = 0; i < 4; i++) {
    const col = i % 2, row = Math.floor(i / 2)
    const onScreen = ws.panes.filter(p => floorPct(p.xPct) === col && floorPct(p.yPct) === row)
    if (onScreen.length === 0) continue
    const layout = ws.screenLayouts?.[i] ?? 'full'
    const intent = ws.intentLayouts?.[i] ?? layout
    const collapsed = (ws.screenCollapsed?.[i] ?? []).length
    lines.push(`  Screen ${i}: layout=${layout} intent=${intent} panes=${onScreen.length} collapsed=${collapsed}`)
  }
  lines.push(``, `--- All panes ---`)
  lines.push(`id       | screen | type         | xPct   | yPct   | wPct   | hPct   | status`)
  lines.push(`-`.repeat(80))
  for (const p of ws.panes) {
    const status = allCollapsed.has(p.id) ? 'collapsed' : 'visible'
    const fr = n => n.toFixed(4).padStart(6)
    lines.push(`${p.id.slice(0,8)} | s${screenOf(p)}     | ${p.type.padEnd(12)} | ${fr(p.xPct)} | ${fr(p.yPct)} | ${fr(p.wPct)} | ${fr(p.hPct)} | ${status}`)
  }
  return lines.join('\n')
}

function listWorkspaces() {
  const snap = readState()
  return snap.workspaces.map(ws => {
    const allCollapsed = new Set(Object.values(ws.screenCollapsed ?? {}).flat())
    const byScreen = {}
    for (const p of ws.panes) {
      const s = screenOf(p)
      if (!byScreen[s]) byScreen[s] = { total: 0, collapsed: 0 }
      byScreen[s].total++
      if (allCollapsed.has(p.id)) byScreen[s].collapsed++
    }
    const screenSummary = Object.entries(byScreen)
      .map(([s, { total, collapsed }]) => `s${s}:${total}panes/${collapsed}collapsed`)
      .join(' ')
    const active = ws.id === snap.activeWorkspaceId ? ' [ACTIVE]' : ''
    return `${ws.name}${active} (${ws.id.slice(0,8)}) — ${ws.panes.length} total — ${screenSummary}`
  }).join('\n')
}

function getToml() {
  return readFileSync(STATE_TOML, 'utf8')
}

// MCP JSON-RPC over stdio
const TOOLS = [
  {
    name: 'workspace_debug_info',
    description: 'Get full debug info for a workspace (pane positions, layouts, collapsed state). Leave wsName empty for active workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        wsName: { type: 'string', description: 'Workspace name or ID prefix (optional, defaults to active)' }
      }
    }
  },
  {
    name: 'list_workspaces',
    description: 'List all workspaces with pane counts and collapsed state summary',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_toml',
    description: 'Get the raw TOML config file contents',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_raw_state',
    description: 'Get the raw JSON state for a specific workspace',
    inputSchema: {
      type: 'object',
      properties: {
        wsName: { type: 'string', description: 'Workspace name or ID prefix (optional, defaults to active)' }
      }
    }
  }
]

function handleTool(name, args) {
  try {
    if (name === 'workspace_debug_info') return debugInfo(args.wsName)
    if (name === 'list_workspaces') return listWorkspaces()
    if (name === 'get_toml') return getToml()
    if (name === 'get_raw_state') {
      const snap = readState()
      const ws = args.wsName
        ? snap.workspaces.find(w => w.name === args.wsName || w.id.startsWith(args.wsName))
        : snap.workspaces.find(w => w.id === snap.activeWorkspaceId)
      return JSON.stringify(ws, null, 2)
    }
    return `Unknown tool: ${name}`
  } catch (e) {
    return `Error: ${e.message}`
  }
}

const rl = createInterface({ input: process.stdin })
rl.on('line', line => {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const { id, method, params } = msg

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'ananke-debug', version: '1.0.0' }
    }})
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
  } else if (method === 'tools/call') {
    const result = handleTool(params.name, params.arguments ?? {})
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: result }] } })
  } else if (method === 'notifications/initialized') {
    // no-op
  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
  }
})

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}
