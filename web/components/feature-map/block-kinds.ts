import { Cloud, Database, Monitor, Server, type LucideIcon } from 'lucide-react'

import type { BlockKind } from '../../../core/types.ts'

export const KIND_LABELS: Record<BlockKind, string> = {
  client: 'Client',
  server: 'Server',
  data: 'Data',
  external: 'External',
}

export const KIND_ICONS: Record<BlockKind, LucideIcon> = {
  client: Monitor,
  server: Server,
  data: Database,
  external: Cloud,
}
