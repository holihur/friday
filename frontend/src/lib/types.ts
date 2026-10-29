export type ColumnType = "status" | "text" | "people" | "date" | "priority" | "numbers" | "checkbox"

export interface User {
  id: string
  email: string
  name: string
  avatarColor: string
  totpEnabled: boolean
  oidcConnected: boolean
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface Column {
  id: string
  title: string
  type: ColumnType
  width: number
  labels?: Label[]
}

export interface BoardMember {
  userId: string
  role: string
}

export interface Board {
  id: string
  workspaceId: string
  name: string
  description: string
  color: string
  icon: string
  visibility: "workspace" | "private"
  ownerId: string
  members: BoardMember[]
  columns: Column[]
  createdAt: string
  updatedAt: string
}

export interface BoardPermissions {
  role: string
  canComment: boolean
  canEdit: boolean
  canAdmin: boolean
}

export interface BoardMemberView {
  user: User
  role: string
  explicit: boolean
  isOwner: boolean
  workspaceRole: string
}

export interface BoardMembersPayload {
  visibility: "workspace" | "private"
  members: BoardMemberView[]
}

export interface Workspace {
  id: string
  name: string
  slug: string
  ownerId: string
  role: "owner" | "admin" | "member" | "guest"
  memberCount: number
  boardCount: number
  createdAt: string
  updatedAt: string
}

export interface WorkspaceMember {
  user: User
  role: Workspace["role"]
  joinedAt: string
}

export interface Invitation {
  id: string
  workspaceId: string
  email: string
  role: Workspace["role"]
  invitedBy: string
  expiresAt: string
  createdAt: string
  emailSent?: boolean
  workspaceName?: string
  inviterName?: string
  inviteUrl?: string
}

export interface BoardSummary extends Board {
  itemCount: number
  doneCount: number
}

export interface Group {
  id: string
  boardId: string
  title: string
  color: string
  position: number
  collapsed: boolean
  createdAt: string
  updatedAt: string
}

export interface Item {
  id: string
  boardId: string
  groupId: string
  name: string
  position: number
  values: Record<string, unknown>
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  itemId: string
  boardId: string
  userId: string
  authorName: string
  authorColor: string
  body: string
  createdAt: string
}

export interface Activity {
  id: string
  boardId: string
  itemId?: string
  userId: string
  userName: string
  userColor: string
  action: string
  itemName?: string
  detail?: string
  createdAt: string
}

export interface BoardPayload {
  board: Board
  groups: Group[]
  items: Item[]
  activity: Activity[]
  permissions?: BoardPermissions
}

export interface BoardItem extends Item {
  boardName: string
  boardColor: string
  boardIcon: string
  boardColumns: Column[]
}

export interface BoardActivityItem extends Activity {
  boardName: string
  boardColor: string
}

export interface DashboardData {
  stats: {
    boards: number
    items: number
    myItems: number
    inProgress: number
    done: number
  }
  boards: BoardSummary[]
  myItems: BoardItem[]
  activity: BoardActivityItem[]
}

export interface SessionInfo {
  id: string
  userAgent?: string
  ip?: string
  expiresAt: string
  createdAt: string
  current: boolean
}

export interface MeResponse {
  user: User
  scopes: string[]
  authMethod: "session" | "pat"
}

export interface PublicConfig {
  oidcEnabled: boolean
  oidcName: string
  registrationEnabled: boolean
  demoMode: boolean
}

export interface SearchResult {
  itemId: string
  name: string
  boardId: string
  boardName: string
  boardColor: string
  boardIcon: string
  updatedAt: string
}

export interface PAT {
  id: string
  userId: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt?: string
  lastUsedAt?: string
  createdAt: string
}

export type PATScope =
  | "boards:read"
  | "boards:write"
  | "items:read"
  | "items:write"
  | "users:read"
