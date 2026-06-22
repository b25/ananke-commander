import type {
  HttpRequest, HttpResponse, GrpcRequest, GrpcResponse, GrpcMessage, GrpcStatus,
  Collection, CollectionItem, Environment, HistoryEntry, KeyValue, HttpBody, AuthConfig, TlsConfig, ProtoDiscovery,
  MockServerData,
} from '../../../shared/api-toolkit-contracts'

export type Protocol = 'http' | 'grpc'

export interface Tab {
  id: string
  name: string
  protocol: Protocol
  httpRequest: HttpRequest
  grpcRequest: GrpcRequest
  httpResponse: HttpResponse | null
  grpcResponse: GrpcResponse | null
  grpcMessages: GrpcMessage[]
  grpcStreamStatus: GrpcStatus | null
  grpcStreamActive: boolean
  grpcDiscovery: ProtoDiscovery | null
  loading: boolean
  error: string | null
  collectionId?: string
  requestId?: string
  dirty: boolean
  /** Response body view: false = pretty, true = raw. */
  responseViewRaw?: boolean
}

/** Tabs + the per-tab HTTP/gRPC request mutations + response-view default. */
export interface TabSlice {
  tabs: Tab[]
  activeTabId: string | null
  /** Default for new tabs: false = pretty, true = raw */
  responseViewRaw: boolean
  setTabResponseViewRaw: (tabId: string, raw: boolean) => void

  openTab: (overrides?: Partial<Tab>) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  updateTab: (id: string, patch: Partial<Tab>) => void

  setHttpMethod: (tabId: string, method: HttpRequest['method']) => void
  setHttpUrl: (tabId: string, url: string) => void
  setHttpParams: (tabId: string, params: KeyValue[]) => void
  setHttpHeaders: (tabId: string, headers: KeyValue[]) => void
  setHttpBody: (tabId: string, body: HttpBody) => void
  setHttpAuth: (tabId: string, auth: AuthConfig) => void

  setGrpcEndpoint: (tabId: string, endpoint: string) => void
  setGrpcServiceMethod: (tabId: string, serviceMethod: string) => void
  setGrpcMessageJson: (tabId: string, json: string) => void
  setGrpcMetadata: (tabId: string, metadata: KeyValue[]) => void
  setGrpcTls: (tabId: string, tls: TlsConfig) => void
  setGrpcDiscovery: (tabId: string, discovery: ProtoDiscovery) => void
  addGrpcStreamMessage: (tabId: string, msg: GrpcMessage) => void
  endGrpcStream: (tabId: string, status: GrpcStatus, trailers: Record<string, string>) => void
}

/** Collections, environments, request history, and collection CRUD/import. */
export interface CollectionSlice {
  collections: Collection[]
  environments: Environment[]
  activeEnvironmentId: string | null
  history: HistoryEntry[]

  setCollections: (cols: Collection[]) => void
  setEnvironments: (envs: Environment[]) => void
  setHistory: (h: HistoryEntry[]) => void
  addHistoryEntry: (entry: HistoryEntry) => void
  clearHistory: () => void
  setActiveEnvironment: (id: string | null) => void

  addItemToCollection: (colId: string, item: CollectionItem, parentId?: string) => Promise<void>
  updateCollectionItem: (colId: string, itemId: string, patch: Partial<CollectionItem>) => Promise<void>
  removeCollectionItem: (colId: string, itemId: string) => Promise<void>
  saveTabToCollection: (tabId: string) => Promise<void>
  importPostmanCollection: (jsonStr: string) => Promise<{ count: number }>
}

/** Mock proxy server data + lifecycle. */
export interface MockSlice {
  mockData: MockServerData
  mockRunning: boolean
  mockActualPort: number | null
  setMockData: (d: MockServerData) => void
  setMockRunning: (r: boolean) => void
  setMockActualPort: (p: number | null) => void
  saveMockData: (d: MockServerData) => Promise<void>
  startMock: () => Promise<void>
  stopMock: () => Promise<void>
  updateRouteHitCount: (routeId: string, hitCount: number) => void
}

/** Sidebar / shell UI state. */
export interface UiSlice {
  sidebarTab: 'collections' | 'history' | 'environments' | 'mock'
  setSidebarTab: (t: 'collections' | 'history' | 'environments' | 'mock') => void
}

export type AppStore = TabSlice & CollectionSlice & MockSlice & UiSlice
