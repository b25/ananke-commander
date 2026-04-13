import type { HttpRequest, GrpcRequest, Variable } from '../../../shared/api-toolkit-contracts'

/** Replace every {{key}} in a string with its value from the variable list. */
export function subStr(s: string, vars: Variable[]): string {
  if (!s || !vars.length) return s
  return s.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const v = vars.find((v) => v.enabled && v.key === key.trim())
    return v ? v.value : match
  })
}

export function applyVarsToHttpRequest(req: HttpRequest, vars: Variable[]): HttpRequest {
  if (!vars.length) return req
  return {
    ...req,
    url: subStr(req.url, vars),
    params: req.params.map((p) => ({ ...p, key: subStr(p.key, vars), value: subStr(p.value, vars) })),
    headers: req.headers.map((h) => ({ ...h, key: subStr(h.key, vars), value: subStr(h.value, vars) })),
    body: req.body.mode === 'raw'
      ? { ...req.body, raw: subStr(req.body.raw ?? '', vars) }
      : req.body.mode === 'form'
        ? { ...req.body, formFields: (req.body.formFields ?? []).map((f) => ({ ...f, key: subStr(f.key, vars), value: subStr(f.value, vars) })) }
        : req.body,
  }
}

export function applyVarsToGrpcRequest(req: GrpcRequest, vars: Variable[]): GrpcRequest {
  if (!vars.length) return req
  return {
    ...req,
    endpoint: subStr(req.endpoint, vars),
    messageJson: subStr(req.messageJson, vars),
    metadata: req.metadata.map((m) => ({ ...m, key: subStr(m.key, vars), value: subStr(m.value, vars) })),
  }
}
