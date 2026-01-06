# Design Document: Group Anchor Positioning Fix

## Overview

This design addresses the "layout jumping" bug in the streaming canvas mind map application. The root cause is that the `StreamingNodeCreator` calculates node positions using spatial analysis (`calculatePositionFromRelations`) instead of anchoring to the pre-created group's position. This causes nodes to be placed at absolute grid positions, making the group "teleport" from its placeholder location.

The fix introduces an **Anchor-Based Coordinate System** where all node positions within a pre-created group are calculated relative to the group's original position, treating the AI's `row`/`col` attributes as internal grid offsets rather than canvas-wide coordinates.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    generateGroupWithAI()                        │
│  1. Create Placeholder_Group at click position (X, Y)           │
│  2. Create main edge from source → group                        │
│  3. Call setPreCreatedGroup() with anchor info                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  StreamingNodeCreator                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Anchor State (NEW)                                       │   │
│  │  - anchorX: number (group's original X)                  │   │
│  │  - anchorY: number (group's original Y)                  │   │
│  │  - anchorLocked: boolean (prevents position changes)     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ calculateNodePositionInPreCreatedGroup() (NEW)           │   │
│  │  Input: nodeXML with row/col                             │   │
│  │  Output: { x, y } anchored to group position             │   │
│  │                                                          │   │
│  │  Formula:                                                │   │
│  │    x = anchorX + padding + (col * cellWidth)             │   │
│  │    y = anchorY + padding + (row * cellHeight)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ updateGroupBoundsPreservingAnchor() (MODIFIED)           │   │
│  │  - Expands width/height to fit nodes                     │   │
│  │  - Only shifts anchor if negative coordinates exist      │   │
│  │  - Repositions all nodes when anchor shifts              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Anchor State Interface

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
}
```

### 2. Modified StreamingNodeCreator Class

```typescript
class StreamingNodeCreator {
  // Existing fields...
  
  // NEW: Anchor state for pre-created groups
  private anchorState: AnchorState | null = null;
  
  /**
   * Set pre-created group with anchor locking
   * MODIFIED: Now captures and locks the anchor position
   */
  public setPreCreatedGroup(
    group: CanvasNode,
    semanticId: string,
    mainEdgeId: string,
    userQuestion: string
  ): void {
    // Existing logic...
    
    // NEW: Lock anchor position
    this.anchorState = {
      anchorX: group.x,
      anchorY: group.y,
      anchorLocked: true,
      minRowSeen: 0,
      minColSeen: 0,
    };
  }
  
  /**
   * NEW: Calculate node position anchored to pre-created group
   */
  private calculateNodePositionInPreCreatedGroup(
    nodeXML: NodeXML
  ): { x: number; y: number } {
    // Implementation detailed below
  }
  
  /**
   * MODIFIED: Update group bounds while preserving anchor
   */
  private async updateGroupBoundsPreservingAnchor(
    groupId: string
  ): Promise<void> {
    // Implementation detailed below
  }
}
```

### 3. Position Calculation Function

```typescript
/**
 * Calculate absolute pixel position for a node within a pre-created group
 * 
 * @param nodeXML - Node data with row/col grid coordinates
 * @returns Pixel coordinates anchored to group position
 */
private calculateNodePositionInPreCreatedGroup(
  nodeXML: NodeXML
): { x: number; y: number } {
  if (!this.anchorState || !this.preCreatedGroup) {
    // Fallback to existing behavior if no anchor
    return this.calculatePositionFromRelations(nodeXML.id);
  }
  
  const padding = this.settings.groupPadding || 60;
  const nodeWidth = this.settings.gridNodeWidth || 360;
  const nodeHeight = this.settings.gridNodeHeight || 200;
  const gap = this.settings.gridGap || 40;
  
  const cellWidth = nodeWidth + gap;
  const cellHeight = nodeHeight + gap;
  
  const row = nodeXML.row || 0;
  const col = nodeXML.col || 0;
  
  // Track minimum coordinates for potential anchor adjustment
  this.anchorState.minRowSeen = Math.min(this.anchorState.minRowSeen, row);
  this.anchorState.minColSeen = Math.min(this.anchorState.minColSeen, col);
  
  // Calculate position relative to anchor
  // Normalize coordinates: if minRow is -1, row 0 becomes row 1 in calculation
  const normalizedRow = row - this.anchorState.minRowSeen;
  const normalizedCol = col - this.anchorState.minColSeen;
  
  return {
    x: this.anchorState.anchorX + padding + (normalizedCol * cellWidth),
    y: this.anchorState.anchorY + padding + (normalizedRow * cellHeight),
  };
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

### Coordinate Transformation Flow

```
AI Response:                Canvas Result:
┌─────────────────┐        ┌─────────────────────────────────────┐
│ <group row="0"  │        │ Group at (500, 300) ← Anchor        │
│        col="1"> │   →    │ ┌─────────────────────────────────┐ │
│   <node row="0" │        │ │ Node n1 at (560, 360)           │ │
│         col="0">│        │ │ = 500 + 60 + (0 * 400)          │ │
│   <node row="1" │        │ ├─────────────────────────────────┤ │
│         col="0">│        │ │ Node n2 at (560, 600)           │ │
│ </group>        │        │ │ = 500 + 60 + (0 * 400), +240    │ │
└─────────────────┘        │ └─────────────────────────────────┘ │
                           └─────────────────────────────────────┘

Formula:
  x = anchorX + padding + (col * (nodeWidth + gap))
  y = anchorY + padding + (row * (nodeHeight + gap))
  
Where:
  anchorX = 500 (group's original X)
  anchorY = 300 (group's original Y)
  padding = 60
  nodeWidth = 360
  gap = 40
  cellWidth = 400
  cellHeight = 240
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

*For any* node that has been created at position (x, y), and *for any* subsequent operation (adding new nodes, updating content, expanding bounds), the node's position SHALL remain at (x, y) unchanged.

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

### Test File Structure

```
src/utils/__tests__/
  streamingNodeCreator.anchor.test.ts    # Anchor positioning tests
  streamingNodeCreator.anchor.prop.test.ts  # Property-based tests
```

### Key Test Scenarios

1. **Basic Anchor Preservation:** Create group at (500, 300), stream nodes, verify group stays at (500, 300)
2. **Position Formula:** Verify node at row=1, col=2 appears at correct pixel position
3. **Negative Coordinates:** Verify row=-1, col=-1 positions node above/left of origin
4. **Sequential Streaming:** Add 5 nodes sequentially, verify none move after creation
5. **Bounds Expansion:** Add node outside current bounds, verify group expands correctly
