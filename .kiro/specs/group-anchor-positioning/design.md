# Design Document: Group Anchor Positioning Fix

## Overview

This design addresses multiple layout issues in the streaming canvas mind map application:

1. **Layout Jumping Bug (Fixed)**: The `StreamingNodeCreator` was calculating node positions using spatial analysis instead of anchoring to the pre-created group's position, causing a "teleport" effect.

2. **Vertical Node Overlap (CRITICAL)**: Nodes in the same column overlap because the layout uses fixed grid heights instead of dynamic heights based on actual content. The Y-position calculation must use accumulated actual heights.

3. **Continuous Jitter/Jumping (CRITICAL)**: The group visually "vibrates" during streaming because the group tries to re-center itself on every token update. The anchor point must be immutable during streaming.

4. **Edge Label Occlusion**: The group content covers the incoming edge label, making the user's question unreadable.

5. **Column Collision**: Adjacent columns may touch or overlap when nodes have wide content.

6. **First Node Header Overflow (NEW - Requirement 12)**: The first node is positioned too high during the initial render, causing it to overflow/clip out of the top border of the Group container. This occurs because the layout engine fails to account for the Group Header Height and Top Padding during the very first render cycle.

The solution introduces:
- **Anchor-Based Coordinate System**: All node positions within a pre-created group are calculated relative to the group's original position
- **Immutable Anchor During Streaming**: The group's top-left (x, y) position is locked and never modified during streaming - only width/height can change
- **Dynamic Stack Layout (Masonry-like)**: Vertical positioning uses actual rendered heights with the "push down" logic: `Node[N].y = Node[N-1].y + Node[N-1].actualHeight + VERTICAL_GAP`
- **Real-Time Reflow**: When a node's content grows, all nodes below it are immediately pushed down
- **Edge Label Safe Zone**: Additional margin prevents content from overlapping edge labels
- **Column Width Tracking**: Horizontal spacing uses actual column widths for proper separation
- **Group Header Clearance (NEW)**: First row nodes are positioned at `anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP` to clear the group's title bar from the first millisecond of rendering

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    generateGroupWithAI()                        │
│  1. Create Placeholder_Group at click position (X, Y)           │
│  2. Create main edge from source → group                        │
│  3. Call setPreCreatedGroup() with anchor info + edge direction │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  StreamingNodeCreator                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Anchor State                                             │   │
│  │  - anchorX, anchorY: number (group's original position)  │   │
│  │  - anchorLocked: boolean                                 │   │
│  │  - edgeDirection: 'left' | 'top' | 'right' | 'bottom'    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Layout Tracking State (NEW)                              │   │
│  │  - columnHeights: Map<col, { nodes: NodeInfo[] }>        │   │
│  │  - columnWidths: Map<col, number> (max width per column) │   │
│  │  - nodeActualSizes: Map<nodeId, { width, height }>       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ calculateNodePositionInPreCreatedGroup() (ENHANCED)      │   │
│  │  Input: nodeXML with row/col                             │   │
│  │  Output: { x, y } using dynamic stack layout             │   │
│  │                                                          │   │
│  │  Y-Position Formula (Dynamic Stack):                     │   │
│  │    if row == 0: y = anchorY + GROUP_HEADER_HEIGHT        │   │
│  │                     + PADDING_TOP + safeZone             │   │
│  │    else: y = prevNode.y + prevNode.actualHeight + gap    │   │
│  │                                                          │   │
│  │  X-Position Formula (Column Tracking):                   │   │
│  │    x = anchorX + padding + safeZone + Σ(colWidths[0..col-1]) │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ repositionNodesInColumn() (NEW)                          │   │
│  │  - Called when a node's height changes during streaming  │   │
│  │  - Recalculates Y positions for all nodes below          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ updateGroupBoundsPreservingAnchor() (ENHANCED)           │   │
│  │  - Expands width/height to fit nodes                     │   │
│  │  - Accounts for safe zones in bounds calculation         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Anchor State Interface (Enhanced)

```typescript
interface AnchorState {
  /** Original X position of the pre-created group */
  anchorX: number;
  
  /** Original Y position of the pre-created group */
  anchorY: number;
  
  /** Whether the anchor has been locked (set when group is created) */
  anchorLocked: boolean;
  
  /** Minimum row value seen (for handling negative coordinates) */
  minRowSeen: number;
  
  /** Minimum col value seen (for handling negative coordinates) */
  minColSeen: number;
  
  /** Direction from which the main edge connects to the group (NEW) */
  edgeDirection: 'left' | 'top' | 'right' | 'bottom';
}
```

### 2. Layout Tracking Interfaces (NEW)

```typescript
/** Information about a node's position and size in a column */
interface ColumnNodeInfo {
  nodeId: string;
  row: number;
  y: number;
  actualHeight: number;
}

/** Tracks all nodes in a specific column */
interface ColumnTrack {
  col: number;
  nodes: ColumnNodeInfo[];  // Sorted by row
  maxWidth: number;         // Maximum width of any node in this column
}

/** Tracks actual rendered sizes of nodes */
interface NodeActualSize {
  width: number;
  height: number;
}

/** Layout constants */
const LAYOUT_CONSTANTS = {
  VERTICAL_GAP: 40,           // Minimum vertical gap between nodes
  HORIZONTAL_GAP: 40,         // Minimum horizontal gap between columns
  EDGE_LABEL_SAFE_ZONE: 40,   // Safe zone for edge labels
  GROUP_HEADER_HEIGHT: 40,    // Height of group title bar (NEW - Requirement 12)
  PADDING_TOP: 20,            // Top padding below header (NEW - Requirement 12)
  PADDING_BOTTOM: 20,         // Bottom padding inside group (NEW - Requirement 12)
};
```

### 3. Modified StreamingNodeCreator Class

```typescript
class StreamingNodeCreator {
  // Existing fields...
  
  // Anchor state for pre-created groups
  private anchorState: AnchorState | null = null;
  
  // NEW: Layout tracking state
  private columnTracks: Map<number, ColumnTrack> = new Map();
  private nodeActualSizes: Map<string, NodeActualSize> = new Map();
  
  /**
   * Set pre-created group with anchor locking and edge direction
   * ENHANCED: Now also captures edge direction for safe zone calculation
   */
  public setPreCreatedGroup(
    group: CanvasNode,
    semanticId: string,
    mainEdgeId: string,
    userQuestion: string,
    edgeDirection: 'left' | 'top' | 'right' | 'bottom' = 'left'
  ): void {
    // Existing logic...
    
    // Lock anchor position with edge direction
    this.anchorState = {
      anchorX: group.x,
      anchorY: group.y,
      anchorLocked: true,
      minRowSeen: 0,
      minColSeen: 0,
      edgeDirection,
    };
    
    // Initialize layout tracking
    this.columnTracks.clear();
    this.nodeActualSizes.clear();
  }
  
  /**
   * ENHANCED: Calculate node position using dynamic stack layout
   */
  private calculateNodePositionInPreCreatedGroup(
    nodeXML: NodeXML
  ): { x: number; y: number } {
    // Implementation detailed below
  }
  
  /**
   * NEW: Reposition all nodes below a given node in the same column
   * Called when a node's height changes during streaming
   */
  private async repositionNodesInColumn(
    col: number,
    startingRow: number
  ): Promise<void> {
    // Implementation detailed below
  }
  
  /**
   * NEW: Update tracked size for a node
   */
  private updateNodeActualSize(
    nodeId: string,
    width: number,
    height: number
  ): void {
    // Implementation detailed below
  }
}
```

### 4. Enhanced Position Calculation Function

```typescript
/**
 * Calculate absolute pixel position for a node within a pre-created group
 * Uses dynamic stack layout instead of fixed grid
 * 
 * CRITICAL (Requirement 12): The first node must clear the group header.
 * Formula for first row: y = anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone
 * 
 * @param nodeXML - Node data with row/col grid coordinates
 * @returns Pixel coordinates using dynamic stack layout
 */
private calculateNodePositionInPreCreatedGroup(
  nodeXML: NodeXML
): { x: number; y: number } {
  if (!this.anchorState || !this.preCreatedGroup) {
    console.warn('[StreamingNodeCreator] No anchor state, falling back to spatial analysis');
    return this.calculatePositionFromRelations(nodeXML.id);
  }
  
  const padding = this.settings.groupPadding || 60;
  const defaultNodeWidth = this.settings.gridNodeWidth || 360;
  const defaultNodeHeight = this.settings.gridNodeHeight || 200;
  const { 
    VERTICAL_GAP, 
    HORIZONTAL_GAP, 
    EDGE_LABEL_SAFE_ZONE,
    GROUP_HEADER_HEIGHT,  // NEW: Account for group title bar
    PADDING_TOP           // NEW: Top padding below header
  } = LAYOUT_CONSTANTS;
  
  // Clamp coordinates
  const MAX_GRID_COORD = 100;
  const row = Math.max(-MAX_GRID_COORD, Math.min(MAX_GRID_COORD, nodeXML.row || 0));
  const col = Math.max(-MAX_GRID_COORD, Math.min(MAX_GRID_COORD, nodeXML.col || 0));
  
  // Track minimum coordinates for normalization
  this.anchorState.minRowSeen = Math.min(this.anchorState.minRowSeen, row);
  this.anchorState.minColSeen = Math.min(this.anchorState.minColSeen, col);
  
  const normalizedRow = row - this.anchorState.minRowSeen;
  const normalizedCol = col - this.anchorState.minColSeen;
  
  // Calculate safe zone based on edge direction
  const topSafeZone = (this.anchorState.edgeDirection === 'top') ? EDGE_LABEL_SAFE_ZONE : 0;
  const leftSafeZone = (this.anchorState.edgeDirection === 'left') ? EDGE_LABEL_SAFE_ZONE : 0;
  
  // Calculate X position using column width tracking
  let x = this.anchorState.anchorX + padding + leftSafeZone;
  for (let c = 0; c < normalizedCol; c++) {
    const colTrack = this.columnTracks.get(c);
    const colWidth = colTrack?.maxWidth || defaultNodeWidth;
    x += colWidth + HORIZONTAL_GAP;
  }
  
  // Calculate Y position using dynamic stack layout
  // CRITICAL (Requirement 12): First row must clear the group header
  let y: number;
  const colTrack = this.columnTracks.get(normalizedCol);
  
  if (normalizedRow === 0 || !colTrack || colTrack.nodes.length === 0) {
    // First node in column: MUST clear group header + padding + safe zone
    // Formula: y = anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone
    // This ensures the first node is positioned below the group's title bar
    y = this.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone;
  } else {
    // Find the previous node in this column
    const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);
    const prevNodeInfo = sortedNodes.find(n => n.row < normalizedRow);
    
    if (prevNodeInfo) {
      // Stack below previous node
      y = prevNodeInfo.y + prevNodeInfo.actualHeight + VERTICAL_GAP;
    } else {
      // No previous node found, use base position with header clearance
      y = this.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone;
    }
  }
  
  // Register this node in column tracking
  this.registerNodeInColumn(nodeXML.id, normalizedCol, normalizedRow, y, defaultNodeHeight);
  
  return { x, y };
}

/**
 * Register a node in column tracking for dynamic layout
 */
private registerNodeInColumn(
  nodeId: string,
  col: number,
  row: number,
  y: number,
  height: number
): void {
  if (!this.columnTracks.has(col)) {
    this.columnTracks.set(col, {
      col,
      nodes: [],
      maxWidth: this.settings.gridNodeWidth || 360,
    });
  }
  
  const colTrack = this.columnTracks.get(col)!;
  
  // Remove existing entry for this node if any
  colTrack.nodes = colTrack.nodes.filter(n => n.nodeId !== nodeId);
  
  // Add new entry
  colTrack.nodes.push({
    nodeId,
    row,
    y,
    actualHeight: height,
  });
  
  // Sort by row
  colTrack.nodes.sort((a, b) => a.row - b.row);
}
```

### 5. Node Repositioning Function (NEW)

```typescript
/**
 * Reposition all nodes below a given row in the same column
 * Called when a node's height changes during streaming
 * 
 * @param col - Column index
 * @param changedRow - Row of the node that changed height
 */
private async repositionNodesInColumn(
  col: number,
  changedRow: number
): Promise<void> {
  const colTrack = this.columnTracks.get(col);
  if (!colTrack) return;
  
  const { VERTICAL_GAP } = LAYOUT_CONSTANTS;
  const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);
  
  // Find nodes that need repositioning (rows > changedRow)
  let prevY = 0;
  let prevHeight = 0;
  
  for (const nodeInfo of sortedNodes) {
    if (nodeInfo.row <= changedRow) {
      // Update tracking for nodes at or before changed row
      prevY = nodeInfo.y;
      prevHeight = nodeInfo.actualHeight;
      continue;
    }
    
    // Calculate new Y position
    const newY = prevY + prevHeight + VERTICAL_GAP;
    
    if (Math.abs(nodeInfo.y - newY) > 1) {
      // Position changed, update the node
      const canvasNode = this.createdNodeMap.get(nodeInfo.nodeId);
      if (canvasNode && canvasNode.x !== undefined) {
        canvasNode.setData({ y: newY });
        nodeInfo.y = newY;
      }
    }
    
    prevY = nodeInfo.y;
    prevHeight = nodeInfo.actualHeight;
  }
  
  await this.canvas.requestFrame();
}
```

## Data Models

### NodeXML (Existing - No Changes)

```typescript
interface NodeXML {
  id: string;
  type?: string;
  title?: string;
  content: string;
  row?: number;  // Grid row (relative to group)
  col?: number;  // Grid column (relative to group)
  groupId?: string;
}
```

### GroupXML (Existing - No Changes)

```typescript
interface GroupXML {
  id: string;
  title?: string;
  row?: number;  // Ignored for pre-created groups
  col?: number;  // Ignored for pre-created groups
  nodes: NodeXML[];
}
```

### Coordinate Transformation Flow (Updated for Dynamic Layout)

```
AI Response:                Canvas Result (Dynamic Stack Layout):
┌─────────────────┐        ┌─────────────────────────────────────────┐
│ <group row="0"  │        │ Group at (500, 300) ← Anchor            │
│        col="1"> │   →    │ ┌─────────────────────────────────────┐ │
│   <node row="0" │        │ │ [Safe Zone: 40px for edge label]    │ │
│         col="0">│        │ ├─────────────────────────────────────┤ │
│   (short text)  │        │ │ Node n1 at (560, 400)               │ │
│                 │        │ │ actualHeight: 150px                 │ │
│   <node row="1" │        │ ├─────────────────────────────────────┤ │
│         col="0">│        │ │ [VERTICAL_GAP: 40px]                │ │
│   (long text)   │        │ ├─────────────────────────────────────┤ │
│ </group>        │        │ │ Node n2 at (560, 590)               │ │
└─────────────────┘        │ │ = n1.y + n1.actualHeight + gap      │ │
                           │ │ = 400 + 150 + 40 = 590              │ │
                           │ │ actualHeight: 300px (long content)  │ │
                           │ └─────────────────────────────────────┘ │
                           └─────────────────────────────────────────┘

Dynamic Y-Position Formula:
  if row == 0:
    y = anchorY + padding + topSafeZone
  else:
    y = prevNode.y + prevNode.actualHeight + VERTICAL_GAP

Dynamic X-Position Formula:
  x = anchorX + padding + leftSafeZone + Σ(columnWidths[0..col-1] + HORIZONTAL_GAP)

Where:
  anchorX = 500, anchorY = 300
  padding = 60
  VERTICAL_GAP = 40
  HORIZONTAL_GAP = 40
  EDGE_LABEL_SAFE_ZONE = 40
```

### Multi-Column Layout Example

```
AI Response:                Canvas Result:
┌─────────────────┐        ┌─────────────────────────────────────────────────┐
│ <node row="0"   │        │ Group at (500, 300)                             │
│       col="0">  │        │ ┌───────────────────┬───────────────────┐       │
│ <node row="1"   │        │ │ n1 (col=0, row=0) │ n3 (col=1, row=0) │       │
│       col="0">  │        │ │ width: 360        │ width: 400        │       │
│ <node row="0"   │        │ │ height: 200       │ height: 150       │       │
│       col="1">  │        │ ├───────────────────┼───────────────────┤       │
│ <node row="1"   │        │ │ n2 (col=0, row=1) │ n4 (col=1, row=1) │       │
│       col="1">  │        │ │ y = n1.y + 200    │ y = n3.y + 150    │       │
└─────────────────┘        │ │     + 40 = 600    │     + 40 = 550    │       │
                           │ └───────────────────┴───────────────────┘       │
                           │                                                 │
                           │ Column 0 width: 360 (max of n1, n2)             │
                           │ Column 1 x: 500 + 60 + 360 + 40 = 960           │
                           └─────────────────────────────────────────────────┘
```

## Critical Implementation Details

### Anchor Stabilization (Jitter Fix)

The jitter issue occurs because the group's position is being recalculated during streaming. The fix requires:

1. **Immutable Anchor During Streaming**: Once `setPreCreatedGroup()` is called, the `anchorX` and `anchorY` values are locked and NEVER modified during streaming.

2. **updateGroupBoundsPreservingAnchor() Changes**:
   - MUST NOT modify `group.x` or `group.y` during streaming
   - ONLY modify `group.width` and `group.height` to expand the group
   - The group grows downward and rightward only

```typescript
/**
 * CRITICAL: This method must NEVER change group.x or group.y during streaming
 * Only width and height can be modified to expand the group
 */
private async updateGroupBoundsPreservingAnchor(
  groupId: string,
  memberNodes: CanvasNode[],
  padding: number
): Promise<void> {
  if (!this.anchorState || !this.preCreatedGroup) return;
  
  const groupNode = this.preCreatedGroup;
  
  // Calculate required dimensions (NOT position)
  let maxX = -Infinity, maxY = -Infinity;
  memberNodes.forEach(node => {
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  });
  
  // Calculate new dimensions - group can only GROW, never shrink or move
  const newWidth = Math.max(
    groupNode.width,
    maxX - this.anchorState.anchorX + padding
  );
  const newHeight = Math.max(
    groupNode.height,
    maxY - this.anchorState.anchorY + padding
  );
  
  // CRITICAL: Only update width/height, NEVER x/y
  if (newWidth > groupNode.width || newHeight > groupNode.height) {
    groupNode.setData({
      // x and y are intentionally NOT included - anchor is immutable
      width: newWidth,
      height: newHeight
    });
    await this.canvas.requestFrame();
  }
}
```

### Real-Time Reflow (Overlap Fix)

The overlap issue occurs because Y positions are calculated once using fixed grid heights. The fix requires:

1. **Dynamic Y Calculation**: Y position must be calculated as: `prevNode.y + prevNode.actualHeight + VERTICAL_GAP`

2. **Immediate Reflow on Height Change**: When `updatePartialNode()` detects a height change, it must immediately trigger `repositionNodesInColumn()`.

3. **Height Tracking**: Every node's actual rendered height must be tracked in `columnTracks`.

```typescript
/**
 * CRITICAL: This method triggers reflow when content grows
 */
async updatePartialNode(nodeXML: NodeXML): Promise<void> {
  const node = this.createdNodeMap.get(nodeXML.id);
  if (!node) {
    await this.createNodeFromXML(nodeXML);
    return;
  }
  
  // Capture current state
  const currentX = node.x;
  const currentY = node.y;
  const oldHeight = node.height;
  
  // Update text content
  node.setText(nodeXML.content);
  
  // Calculate new height based on content
  const newHeight = Math.max(
    this.settings.gridNodeHeight || 200,
    calcHeight({ text: nodeXML.content })
  );
  
  const heightChanged = Math.abs(oldHeight - newHeight) > 1;
  
  if (heightChanged) {
    // Update node height, preserve position
    node.setData({ 
      height: newHeight,
      x: currentX,  // Explicitly preserve
      y: currentY   // Explicitly preserve
    });
    
    // CRITICAL: Trigger reflow for nodes below
    await this.updateNodeHeightAndReposition(nodeXML.id, newHeight);
  }
  
  // Update group bounds (will only expand, never move)
  const groupId = this.nodeToGroup.get(nodeXML.id);
  if (groupId) {
    await this.updateGroupBounds(groupId);
  }
}
```

### Reflow Algorithm

```
When node N's height changes from H_old to H_new:

1. Calculate delta = H_new - H_old

2. For each node M in the same column where M.row > N.row:
   M.y = M.y + delta
   
3. Update columnTracks with new positions

4. Call canvas.requestFrame() once (batched update)

5. Update group bounds (expand only)
```

### Visual Flow During Streaming

```
Initial State:          After Node A grows:      After Reflow:
┌─────────────┐        ┌─────────────┐          ┌─────────────┐
│ Node A      │        │ Node A      │          │ Node A      │
│ height: 100 │        │ (more text) │          │ (more text) │
├─────────────┤        │ height: 200 │          │ height: 200 │
│ [40px gap]  │        ├─────────────┤          ├─────────────┤
├─────────────┤        │ Node B      │ ← OVERLAP│ [40px gap]  │
│ Node B      │        │ height: 100 │          ├─────────────┤
│ height: 100 │        └─────────────┘          │ Node B      │ ← PUSHED DOWN
└─────────────┘                                 │ height: 100 │
                                                └─────────────┘
                                                
Group anchor (x,y) remains FIXED throughout - only width/height change
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified:

### Property 1: Anchor Preservation Invariant

*For any* pre-created group at position (X, Y) and *for any* sequence of streaming operations (node creation, content updates, bounds expansion), the group's anchor position SHALL remain at (X, Y) within a 2-pixel tolerance, unless negative grid coordinates require anchor adjustment.

**Validates: Requirements 1.1, 1.2, 1.3, 3.2**

### Property 2: Position Calculation Round-Trip

*For any* anchor position (anchorX, anchorY), padding value, cell dimensions (cellWidth, cellHeight), and grid coordinate (row, col), the calculated pixel position SHALL satisfy:
- `pixelX = anchorX + padding + (normalizedCol * cellWidth)`
- `pixelY = anchorY + padding + (normalizedRow * cellHeight)`

Where normalizedRow = row - minRowSeen and normalizedCol = col - minColSeen.

Additionally, *for any* calculated pixel position, converting back to grid coordinates SHALL produce the original (row, col) values.

**Validates: Requirements 2.1**

### Property 3: Node Position Stability Under Streaming

*For any* node that has been created at position (x, y), and *for any* subsequent operation (adding new nodes, updating content, expanding bounds), the node's position SHALL remain at (x, y) unchanged, EXCEPT when:
- A node above it in the same column grows in height (triggering repositioning)
- Negative coordinates cause anchor adjustment

**Validates: Requirements 2.3, 5.2**

### Property 4: Group Bounds Containment

*For any* group with member nodes, the group's bounds SHALL satisfy:
- `group.x <= min(node.x for all nodes) - padding`
- `group.y <= min(node.y for all nodes) - padding`
- `group.x + group.width >= max(node.x + node.width for all nodes) + padding`
- `group.y + group.height >= max(node.y + node.height for all nodes) + padding`

**Validates: Requirements 3.1**

### Property 5: Relative Position Preservation

*For any* two nodes A and B within a group, and *for any* operation that causes anchor adjustment (due to negative coordinates), the relative distance between A and B SHALL remain constant:
- `distance(A, B) before operation == distance(A, B) after operation`

**Validates: Requirements 3.3**

### Property 6: Vertical Stack Layout (NEW)

*For any* two nodes A and B in the same column where B.row > A.row, the Y-position of B SHALL satisfy:
- `B.y >= A.y + A.actualHeight + VERTICAL_GAP`

This ensures nodes in the same column never overlap vertically, regardless of content height.

**Validates: Requirements 6.1, 6.3**

### Property 7: Dynamic Height Tracking and Repositioning (NEW)

*For any* node whose content grows during streaming (causing actualHeight to increase), *all* nodes below it in the same column SHALL be repositioned such that:
- Each node's new Y-position = previous node's Y + previous node's actualHeight + VERTICAL_GAP
- The tracked actualHeight for the changed node SHALL equal its rendered height

**Validates: Requirements 6.2, 6.4**

### Property 8: Edge Label Safe Zone (NEW)

*For any* group with an incoming edge from direction D, the first row/column of nodes SHALL have an additional margin:
- If D == 'top': first row nodes have `y >= anchorY + padding + EDGE_LABEL_SAFE_ZONE`
- If D == 'left': first column nodes have `x >= anchorX + padding + EDGE_LABEL_SAFE_ZONE`
- If D == 'bottom': last row has extra bottom padding
- If D == 'right': last column has extra right padding

Where EDGE_LABEL_SAFE_ZONE >= 40 pixels.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4**

### Property 9: Horizontal Column Spacing (NEW)

*For any* two adjacent columns C1 and C2 where C2.col = C1.col + 1, the X-position of nodes in C2 SHALL satisfy:
- `min(C2.nodes.x) >= max(C1.nodes.x + C1.nodes.width) + HORIZONTAL_GAP`

This ensures columns never overlap horizontally, using the maximum width of all nodes in each column.

**Validates: Requirements 8.1, 8.3, 8.4**

### Property 10: Anchor Immutability During Streaming (NEW)

*For any* pre-created group with anchor position (anchorX, anchorY), and *for any* sequence of streaming operations (node creation, content updates, height changes), the group's top-left position SHALL satisfy:
- `group.x == anchorX` (exactly, no tolerance)
- `group.y == anchorY` (exactly, no tolerance)

The group may only expand by increasing width and height; x and y coordinates are immutable during streaming.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4**

### Property 11: Node Background Color Invariant (NEW)

*For any* node created by StreamingNodeCreator, the node SHALL have a non-null background color property set, ensuring visual clarity and readability even when nodes are positioned close together.

**Validates: Requirements 11.1**

### Property 12: Group Header Height Clearance (NEW)

*For any* node in the first row (row=0) of a group, the Y-position SHALL satisfy:
- `node.y >= group.y + GROUP_HEADER_HEIGHT + PADDING_TOP`

This ensures the first node is positioned below the group's title bar from the very first render cycle, preventing content from clipping out of the top border of the group container.

Additionally, *for any* group with at least one node, the group's height SHALL satisfy:
- `group.height >= (node.y - group.y) + node.height + PADDING_BOTTOM`

This ensures the group container immediately expands to wrap the first node.

**Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**

## Error Handling

### Missing Anchor State

**Condition:** `calculateNodePositionInPreCreatedGroup` is called when `anchorState` is null.

**Handling:** Fall back to existing `calculatePositionFromRelations` behavior. Log a warning for debugging.

```typescript
if (!this.anchorState || !this.preCreatedGroup) {
  console.warn('[StreamingNodeCreator] No anchor state, falling back to spatial analysis');
  return this.calculatePositionFromRelations(nodeXML.id);
}
```

### Invalid Grid Coordinates

**Condition:** Node XML contains non-numeric or extremely large row/col values.

**Handling:** Clamp values to reasonable bounds and log a warning.

```typescript
const MAX_GRID_COORD = 100;
const row = Math.max(-MAX_GRID_COORD, Math.min(MAX_GRID_COORD, nodeXML.row || 0));
const col = Math.max(-MAX_GRID_COORD, Math.min(MAX_GRID_COORD, nodeXML.col || 0));
```

### Group Node Not Found

**Condition:** Pre-created group reference becomes invalid during streaming.

**Handling:** Skip anchor-based positioning and use fallback. Notify user of potential layout issues.

### Canvas Not Available

**Condition:** Canvas reference is null during node creation.

**Handling:** Queue the operation and retry on next frame, or fail gracefully with error notification.

### Column Track Not Found (NEW)

**Condition:** `repositionNodesInColumn` is called for a column that doesn't exist in tracking.

**Handling:** Return early without error. This is a valid state when no nodes have been created in that column yet.

```typescript
const colTrack = this.columnTracks.get(col);
if (!colTrack) return; // No nodes in this column yet
```

### Height Calculation Failure (NEW)

**Condition:** `calcHeight` returns invalid or zero height for node content.

**Handling:** Use default node height as fallback.

```typescript
const calculatedHeight = calcHeight({ text: nodeXML.content });
const actualHeight = calculatedHeight > 0 ? calculatedHeight : (this.settings.gridNodeHeight || 200);
```

## Testing Strategy

### Property-Based Testing

Property-based tests will be implemented using **fast-check** (JavaScript/TypeScript PBT library) to validate the correctness properties defined above.

**Configuration:**
- Minimum 100 iterations per property test
- Each test tagged with: `Feature: group-anchor-positioning, Property N: {property_text}`

### Unit Tests

Unit tests will cover:
- Specific examples demonstrating correct anchor-based positioning
- Edge cases: negative coordinates, zero coordinates, large coordinate values
- Integration between `setPreCreatedGroup` and `calculateNodePositionInPreCreatedGroup`
- Dynamic height tracking and repositioning
- Edge label safe zone calculations
- Column width tracking

### Test File Structure

```
src/utils/__tests__/
  streamingNodeCreator.anchor.test.ts         # Anchor positioning tests
  streamingNodeCreator.anchor.prop.test.ts    # Property-based tests (Properties 1-5)
  streamingNodeCreator.layout.test.ts         # Dynamic layout unit tests (NEW)
  streamingNodeCreator.layout.prop.test.ts    # Layout property tests (Properties 6-9) (NEW)
```

### Key Test Scenarios

1. **Basic Anchor Preservation:** Create group at (500, 300), stream nodes, verify group stays at (500, 300)
2. **Position Formula:** Verify node at row=1, col=2 appears at correct pixel position
3. **Negative Coordinates:** Verify row=-1, col=-1 positions node above/left of origin
4. **Sequential Streaming:** Add 5 nodes sequentially, verify none move after creation
5. **Bounds Expansion:** Add node outside current bounds, verify group expands correctly
6. **Vertical Stack Layout (NEW):** Create nodes with varying content heights, verify no overlap
7. **Dynamic Repositioning (NEW):** Grow a node's content, verify nodes below shift down
8. **Edge Label Safe Zone (NEW):** Create group with left/top edge, verify safe zone margin
9. **Column Spacing (NEW):** Create multi-column layout with wide nodes, verify no horizontal overlap
