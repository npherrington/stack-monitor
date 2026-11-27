import { Fragment, useEffect, useState } from 'react'

import { PagePane } from '@/components/panes/page-pane.tsx'
import { TerminalPane } from '@/components/panes/terminal-pane.tsx'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable.tsx'
import { useTerminalLayout } from '@/contexts/terminal-context.ts'
import {
  terminalPanes,
  visibleTree,
  type LayoutNode,
  type SplitNode,
} from '@/lib/pane-layout.ts'

const PAGE_MIN_PX = 360
const PANE_MIN_PX = 160

// A panel's DOM id: the library puts it on the element, where a bare 'page' could clash.
const panelId = (node: LayoutNode) => `pane-${node.id}`

interface PaneNodeProps {
  node: LayoutNode
  paneIndex: Map<string, number>
  dragging: string | null
  onDragChange: (session: string | null) => void
}

function PaneNode({ node, paneIndex, dragging, onDragChange }: PaneNodeProps) {
  if (node.kind === 'page') return <PagePane dragging={dragging} />
  if (node.kind === 'terminals')
    return (
      <TerminalPane
        pane={node}
        index={paneIndex.get(node.id) ?? 0}
        dragging={dragging}
        onDragChange={onDragChange}
      />
    )
  return (
    <SplitGroup
      node={node}
      paneIndex={paneIndex}
      dragging={dragging}
      onDragChange={onDragChange}
    />
  )
}

interface SplitGroupProps extends Omit<PaneNodeProps, 'node'> {
  node: SplitNode
}

// A split as a resizable group. The tree holds the sizes: the group starts from them, and a drag
// writes them back when it ends. It's keyed by its children, so a pane joining or leaving lays it
// out afresh from the tree; what's in the panes is held elsewhere and survives that.
function SplitGroup({ node, ...rest }: SplitGroupProps) {
  const { setSizes } = useTerminalLayout()
  return (
    <ResizablePanelGroup
      key={node.children.map((child) => child.id).join(' ')}
      id={`split-${node.id}`}
      orientation={node.direction === 'row' ? 'horizontal' : 'vertical'}
      defaultLayout={Object.fromEntries(
        node.children.map((child, at) => [panelId(child), node.sizes[at]]),
      )}
      onLayoutChanged={(layout, { isUserInteraction }) => {
        if (!isUserInteraction) return
        setSizes(
          node.id,
          node.children.map((child) => layout[panelId(child)] ?? 0),
        )
      }}
    >
      {node.children.map((child, at) => (
        <Fragment key={child.id}>
          {at > 0 && <ResizableHandle />}
          <ResizablePanel
            id={panelId(child)}
            minSize={child.kind === 'page' ? PAGE_MIN_PX : PANE_MIN_PX}
            className="flex min-h-0 min-w-0 flex-col"
          >
            <PaneNode node={child} {...rest} />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  )
}

// The page and the terminal panes as a tree of resizable splits, on a wide screen.
export function PaneTree() {
  const { layout } = useTerminalLayout()
  const [dragging, setDragging] = useState<string | null>(null)
  const root = visibleTree(layout)

  // A drop that moves the tab unmounts it before its dragend, which then never reaches React:
  // the drop itself ends the drag.
  useEffect(() => {
    if (dragging === null) return
    const end = () => setDragging(null)
    window.addEventListener('drop', end)
    return () => window.removeEventListener('drop', end)
  }, [dragging])
  const paneIndex = new Map(
    terminalPanes(root).map((pane, at) => [pane.id, at]),
  )
  return (
    <div className="grid min-h-0 min-w-0 flex-1">
      <PaneNode
        node={root}
        paneIndex={paneIndex}
        dragging={dragging}
        onDragChange={setDragging}
      />
    </div>
  )
}
