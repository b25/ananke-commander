import { useState } from 'react'
import { useStore } from '../store'
import type { Environment, Variable } from '../../../shared/api-toolkit-contracts'

function VariableRow({
  v,
  onChange,
  onDelete,
}: {
  v: Variable
  onChange: (patch: Partial<Variable>) => void
  onDelete: () => void
}) {
  return (
    <div className="kv-row">
      <input className="kv-check" type="checkbox" checked={v.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
      <input className="kv-input" placeholder="Variable" value={v.key} onChange={(e) => onChange({ key: e.target.value })} />
      <input
        className="kv-input"
        placeholder="Value"
        type={v.isSecret ? 'password' : 'text'}
        value={v.value}
        onChange={(e) => onChange({ value: e.target.value })}
      />
      <input className="kv-check" type="checkbox" checked={v.isSecret} onChange={(e) => onChange({ isSecret: e.target.checked })} title="Secret" />
      <span className="kv-del" onClick={onDelete}>×</span>
    </div>
  )
}

export function EnvEditor() {
  const { environments, activeEnvironmentId, setEnvironments, setActiveEnvironment } = useStore()
  const [editingId, setEditingId] = useState<string | null>(null)

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId) ?? null
  const editingEnv = environments.find((e) => e.id === editingId) ?? null

  function newEnv() {
    const name = window.prompt('Environment name')?.trim()
    if (!name) return
    const env: Environment = { id: crypto.randomUUID(), name, variables: [], createdAt: Date.now(), updatedAt: Date.now() }
    const next = [...environments, env]
    setEnvironments(next)
    window.ananke.apiToolkit.storage.saveEnvironment(env)
    setActiveEnvironment(env.id)
    setEditingId(env.id)
  }

  function saveEnv(env: Environment) {
    const next = environments.map((e) => e.id === env.id ? env : e)
    setEnvironments(next)
    window.ananke.apiToolkit.storage.saveEnvironment(env)
  }

  function deleteEnv(id: string) {
    if (!window.confirm('Delete this environment?')) return
    window.ananke.apiToolkit.storage.deleteEnvironment(id)
    const next = environments.filter((e) => e.id !== id)
    setEnvironments(next)
    if (activeEnvironmentId === id) setActiveEnvironment(next[0]?.id ?? null)
    if (editingId === id) setEditingId(null)
  }

  function updateVar(env: Environment, idx: number, patch: Partial<Variable>) {
    const variables = env.variables.map((v, i) => i === idx ? { ...v, ...patch } : v)
    const updated = { ...env, variables, updatedAt: Date.now() }
    saveEnv(updated)
    setEnvironments(environments.map((e) => e.id === updated.id ? updated : e))
  }

  function addVar(env: Environment) {
    const variables = [...env.variables, { key: '', value: '', enabled: true, isSecret: false }]
    const updated = { ...env, variables, updatedAt: Date.now() }
    saveEnv(updated)
    setEnvironments(environments.map((e) => e.id === updated.id ? updated : e))
  }

  function deleteVar(env: Environment, idx: number) {
    const variables = env.variables.filter((_, i) => i !== idx)
    const updated = { ...env, variables, updatedAt: Date.now() }
    saveEnv(updated)
    setEnvironments(environments.map((e) => e.id === updated.id ? updated : e))
  }

  return (
    <div className="sidebar-content">
      {/* Selector row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
        <select
          className="select"
          style={{ flex: 1, fontSize: 10 }}
          value={activeEnvironmentId ?? ''}
          onChange={(e) => setActiveEnvironment(e.target.value || null)}
        >
          <option value="">No environment</option>
          {environments.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <span className="sidebar-action-btn" title="New environment" onClick={newEnv}>+</span>
      </div>

      {/* Environment list */}
      {environments.length === 0 && (
        <div style={{ padding: '24px 16px', color: 'var(--text-2)', fontSize: 10, textAlign: 'center' }}>
          No environments.<br />
          <span className="text-accent" style={{ cursor: 'pointer' }} onClick={newEnv}>Create one</span>
        </div>
      )}

      {environments.map((env) => (
        <div key={env.id} style={{ borderBottom: '1px solid var(--border)' }}>
          <div
            className="sidebar-section-header"
            style={{ fontSize: 10, color: env.id === activeEnvironmentId ? 'var(--text-accent)' : 'var(--text-1)', cursor: 'pointer' }}
            onClick={() => setEditingId(editingId === env.id ? null : env.id)}
          >
            <span style={{ flex: 1 }}>{env.name}{env.id === activeEnvironmentId ? ' ✓' : ''}</span>
            <span className="sidebar-action-btn" title="Set active" onClick={(e) => { e.stopPropagation(); setActiveEnvironment(env.id) }}>▶</span>
            <span className="sidebar-action-btn" title="Delete" onClick={(e) => { e.stopPropagation(); deleteEnv(env.id) }}>×</span>
          </div>
          {editingId === env.id && (
            <div style={{ padding: '6px 8px' }}>
              <div className="kv-editor">
                {env.variables.map((v, i) => (
                  <VariableRow
                    key={i}
                    v={v}
                    onChange={(patch) => updateVar(env, i, patch)}
                    onDelete={() => deleteVar(env, i)}
                  />
                ))}
              </div>
              <div className="kv-add-btn" onClick={() => addVar(env)}>+ Add variable</div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
