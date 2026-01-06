# Design Document: Group Regenerate Fix

## Overview

This design addresses the bug where clicking the "regenerate" button on an edge pointing to a Group throws `TypeError: p.setText is not a function`. The root cause is that the `generateNote` function in `noteGenerator.ts` assumes the target (`toNode`) is always a text Node with a `setText()` method, but Groups don't have this method.

The solution is to make the regeneration logic polymorphic by:
1. Detecting the target type (Node vs Group)
2. For Nodes: Use existing `setText()` logic
3. For Groups: Clear child nodes and repopulate using the streaming node creator

## Architecture

The fix follows a strategy pattern where the target type determines which regeneration strategy is used:

```
┌─────────────────────────────────────────────────────────────┐
│                    regenerateResponse.ts                     │
│                                                              │
│  handleRegenerateResponse()                                  │
│         │                                                    │
│         ▼                                                    │
│  noteGenerator() → generateNote()                            │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────┐                                        │
│  │ isGroup(toNode)? │                                        │
│  └────────┬─────────┘                                        │
│           │                                                  │
│     ┌─────┴─────┐                                            │
│     │           │                                            │
│     ▼           ▼                                            │
│  [Group]     [Node]                                          │
│     │           │                                            │
│     ▼           ▼                                            │
│  regenerateGroup()  existing setText() logic                 │
│     │                                                        │
│     ▼                                                        │
│  1. Clear child nodes                                        │
│  2. Stream AI response                                       │
│  3. Parse markdown → nodes                                   │
│  4. Create nodes inside group                                │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Modified Components

#### 1. `noteGenerator.ts` - `generateNote()` function

The main function that handles regeneration. Will be modified to:
- Accept an optional `isGroupTarget` parameter or detect group type internally
- Branch logic based on target type
- Delegate to `regenerateGroup()` for group targets

```typescript
// New function signature (internal detection)
const generateNote = async (question?: string, edgeLabel?: string) => {
  // ... existing setup code ...
  
  if (toNode) {
    // Check if target is a group
    if (isGroup(toNode)) {
      await regenerateGroup(canvas, toNode, messages, settings, edgeLabel);
      return;
    }
    
    // Existing node logic with setText()
    // ...
  }
}
```

#### 2. New Function: `regenerateGroup()`

A new function to handle group regeneration:

```typescript
async function regenerateGroup(
  canvas: Canvas,
  groupNode: CanvasNode,
  messages: any[],
  settings: AugmentedCanvasSettings,
  edgeLabel?: string
): Promise<void> {
  // 1. Store group position/dimensions
  const groupBounds = {
    x: groupNode.x,
    y: groupNode.y,
    width: groupNode.width,
    height: groupNode.height
  };
  
  // 2. Clear existing child nodes
  const childNodes = getNodesInGroup(groupNode, canvas);
  for (const child of childNodes) {
    canvas.removeNode(child);
  }
  
  // 3. Stream AI response and create new nodes
  // Uses existing streaming infrastructure
  
  // 4. Position new nodes within group bounds
}
```

### Existing Components Used

- `groupUtils.ts` - `isGroup()`, `getNodesInGroup()` for type detection and child node retrieval
- `groupGenerator.ts` - `parseNodesFromMarkdown()`, `calculateSmartLayout()` for parsing AI response
- `streamingNodeCreator.ts` - For streaming display within groups
- `chatgpt.ts` - `streamResponse()` for AI communication

## Data Models

### Target Type Detection

```typescript
// Using existing isGroup() from groupUtils.ts
function isGroup(node: CanvasNode): boolean {
  const nodeData = node.getData();
  return nodeData.type === "group";
}
```

### Group Bounds Preservation

```typescript
interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### Regeneration Context

```typescript
interface RegenerationContext {
  canvas: Canvas;
  target: CanvasNode;
  isGroup: boolean;
  sourceNode: CanvasNode;
  edgeLabel?: string;
  messages: any[];
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Type Detection Correctness

*For any* canvas element, the `isGroup()` function should return `true` if and only if the element's data type property equals "group".

**Validates: Requirements 1.1**

### Property 2: Routing Correctness

*For any* target element in a regeneration action, the system routes to group regeneration logic if and only if `isGroup(target)` returns `true`, otherwise it routes to node regeneration logic.

**Validates: Requirements 1.2, 1.3**

### Property 3: Node setText Invocation

*For any* regeneration where the target is a Node (not a Group), the `setText()` method should be called on the target node during content updates.

**Validates: Requirements 2.1**

### Property 4: Group setText Avoidance (Core Bug Fix)

*For any* regeneration where the target is a Group, the `setText()` method should never be called on the Group object.

**Validates: Requirements 3.1**

### Property 5: Group Position/Dimension Preservation

*For any* group regeneration, the group container's x, y, width, and height values should remain unchanged after regeneration completes.

**Validates: Requirements 3.3**

### Property 6: Group Content Replacement

*For any* group regeneration, after completion: (a) all original child nodes should be removed, and (b) all new child nodes should be spatially contained within the group's boundaries.

**Validates: Requirements 3.2, 3.6**

### Property 7: Edge Label Prompt Usage

*For any* regeneration action with an edge that has a label, that label should be included in the AI messages array as the user prompt.

**Validates: Requirements 3.4, 5.1, 5.3**

### Property 8: Error Recovery Content Preservation

*For any* group regeneration that encounters an error during AI streaming, the original group contents should be preserved (not deleted).

**Validates: Requirements 4.2**

## Error Handling

### Error Scenarios

1. **Missing API Key**
   - Detection: Check `settings.apiKey` before making AI call
   - Response: Display notice "请在插件设置中设置 DeepSeek API 密钥"
   - Recovery: Return early without modifying target

2. **AI Streaming Error**
   - Detection: Error callback in `streamResponse()`
   - Response: Display notice with error message
   - Recovery: For groups, restore original child nodes if they were cleared

3. **Invalid Target**
   - Detection: `toNode` is null/undefined
   - Response: Display notice "No target node found"
   - Recovery: Return early without action

### Error Recovery Strategy for Groups

To preserve group contents on error, we use a two-phase approach:

```typescript
// Phase 1: Store references to existing nodes (don't delete yet)
const originalNodes = getNodesInGroup(groupNode, canvas);

// Phase 2: Only delete after successful AI response starts
let deletedOriginals = false;

streamResponse(..., (chunk, error) => {
  if (error) {
    // Don't delete if we haven't started
    if (!deletedOriginals) {
      // Original content preserved
    }
    throw error;
  }
  
  if (!deletedOriginals && chunk) {
    // First successful chunk - safe to delete originals
    for (const node of originalNodes) {
      canvas.removeNode(node);
    }
    deletedOriginals = true;
  }
  // ... create new nodes ...
});
```

## Testing Strategy

### Unit Tests

Unit tests will cover:
- Type detection edge cases (null nodes, missing type property)
- Group bounds calculation
- Child node identification within groups

### Property-Based Tests

Property-based tests will use `fast-check` to verify the correctness properties:

1. **Type Detection Property Test**
   - Generate random node data with various type values
   - Verify `isGroup()` returns correct boolean

2. **Routing Property Test**
   - Generate mock targets (nodes and groups)
   - Verify correct code path is taken

3. **Group Position Preservation Test**
   - Generate random group positions/dimensions
   - Simulate regeneration
   - Verify bounds unchanged

4. **Content Replacement Test**
   - Generate groups with random child nodes
   - Simulate regeneration with mock AI response
   - Verify old nodes removed, new nodes within bounds

### Test Configuration

- Property-based tests: minimum 100 iterations per property
- Test framework: Jest with fast-check
- Each test tagged with: **Feature: group-regenerate-fix, Property N: [property_text]**

### Integration Tests

Integration tests will verify:
- End-to-end regeneration flow for groups
- Streaming display within groups
- Edge creation between new child nodes
