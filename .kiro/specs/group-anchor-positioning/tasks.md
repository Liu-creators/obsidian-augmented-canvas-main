# Implementation Plan: Group Anchor Positioning Fix

## Overview

This implementation fixes multiple layout issues:
1. **Layout jumping bug** (completed) - Anchor-based positioning for pre-created groups
2. **Vertical node overlap** (completed) - Dynamic stack layout using actual heights
3. **Edge label occlusion** (completed) - Safe zone margins for edge labels
4. **Column collision** (completed) - Column width tracking for horizontal spacing
5. **First node header overflow** (NEW) - Group header height clearance for first row nodes

## Tasks

- [x] 1. Add Anchor State to StreamingNodeCreator
  - [x] 1.1 Define AnchorState interface and add private field
    - Add `AnchorState` interface with `anchorX`, `anchorY`, `anchorLocked`, `minRowSeen`, `minColSeen`
    - Add `private anchorState: AnchorState | null = null` field to class
    - _Requirements: 1.1_

  - [x] 1.2 Modify setPreCreatedGroup to capture anchor position
    - Capture `group.x` and `group.y` as anchor coordinates
    - Set `anchorLocked = true` to prevent modifications
    - Initialize `minRowSeen` and `minColSeen` to 0
    - _Requirements: 1.1, 1.2_

- [x] 2. Implement Anchor-Based Position Calculation
  - [x] 2.1 Create calculateNodePositionInPreCreatedGroup method
    - Implement the position formula: `x = anchorX + padding + (normalizedCol * cellWidth)`
    - Handle coordinate normalization for negative values
    - Track min row/col seen for normalization
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Write property test for position calculation formula
    - **Property 2: Position Calculation Round-Trip**
    - **Validates: Requirements 2.1**

  - [x] 2.3 Modify createNodeDirectly to use anchor-based positioning
    - Check if node belongs to pre-created group
    - Call `calculateNodePositionInPreCreatedGroup` instead of `calculatePositionFromRelations`
    - Preserve existing fallback behavior for non-group nodes
    - _Requirements: 2.1, 2.3_

  - [x] 2.4 Write property test for node position stability
    - **Property 3: Node Position Stability Under Streaming**
    - **Validates: Requirements 2.3, 5.2**

- [x] 3. Checkpoint - Verify anchor-based positioning works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Modify Group Bounds Update Logic
  - [x] 4.1 Update updateGroupBounds to preserve anchor position
    - Only modify width/height when expanding for positive coordinates
    - When negative coordinates appear, shift anchor and reposition all nodes
    - Maintain 2-pixel tolerance for minor adjustments
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 4.2 Write property test for anchor preservation
    - **Property 1: Anchor Preservation Invariant**
    - **Validates: Requirements 1.1, 1.2, 1.3, 3.2**

  - [x] 4.3 Write property test for group bounds containment
    - **Property 4: Group Bounds Containment**
    - **Validates: Requirements 3.1**

  - [x] 4.4 Write property test for relative position preservation
    - **Property 5: Relative Position Preservation**
    - **Validates: Requirements 3.3**

- [x] 5. Update Node Creation Flow for Pre-Created Groups
  - [x] 5.1 Modify createNodeFromXML to detect pre-created group context
    - Check if `nodeXML.groupId` matches `preCreatedGroupSemanticId`
    - Route to anchor-based positioning when in pre-created group context
    - _Requirements: 2.1_

  - [x] 5.2 Modify updatePartialNode to preserve position during content updates
    - Ensure position is not recalculated when only content changes
    - Only update text and height, not x/y coordinates
    - _Requirements: 5.2_

- [x] 6. Checkpoint - Full integration test
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Handle Edge Cases
  - [x] 7.1 Add coordinate clamping for extreme values
    - Clamp row/col to [-100, 100] range
    - Log warning for out-of-range values
    - _Requirements: 2.1_

  - [x] 7.2 Add fallback for missing anchor state
    - Fall back to `calculatePositionFromRelations` when anchor is null
    - Log warning for debugging
    - _Requirements: 2.1_

  - [x] 7.3 Write unit tests for edge cases
    - Test negative coordinates positioning
    - Test coordinate clamping
    - Test fallback behavior
    - _Requirements: 2.2_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Add Layout Tracking State (NEW)
  - [x] 9.1 Define layout tracking interfaces
    - Add `ColumnNodeInfo` interface with nodeId, row, y, actualHeight
    - Add `ColumnTrack` interface with col, nodes[], maxWidth
    - Add `NodeActualSize` interface with width, height
    - Add `LAYOUT_CONSTANTS` with VERTICAL_GAP (40), HORIZONTAL_GAP (40), EDGE_LABEL_SAFE_ZONE (40)
    - _Requirements: 6.4, 8.2_

  - [x] 9.2 Add layout tracking fields to StreamingNodeCreator
    - Add `private columnTracks: Map<number, ColumnTrack>`
    - Add `private nodeActualSizes: Map<string, NodeActualSize>`
    - Initialize in constructor and clear in setPreCreatedGroup
    - _Requirements: 6.4, 8.2_

- [-] 10. Implement Dynamic Vertical Stack Layout (NEW)
  - [x] 10.1 Enhance calculateNodePositionInPreCreatedGroup for dynamic Y positioning
    - For row 0: use anchorY + padding + topSafeZone
    - For row > 0: use prevNode.y + prevNode.actualHeight + VERTICAL_GAP
    - Look up previous node from columnTracks
    - _Requirements: 6.1_

  - [x] 10.2 Implement registerNodeInColumn helper method
    - Create column track if not exists
    - Add/update node entry in column track
    - Sort nodes by row
    - _Requirements: 6.4_

  - [x] 10.3 Implement repositionNodesInColumn method
    - Find all nodes below the changed row
    - Recalculate Y positions using dynamic stack formula
    - Update canvas node positions
    - _Requirements: 6.2_

  - [x] 10.4 Write property test for vertical stack layout
    - **Property 6: Vertical Stack Layout**
    - **Validates: Requirements 6.1, 6.3**

  - [x] 10.5 Write property test for dynamic height tracking
    - **Property 7: Dynamic Height Tracking and Repositioning**
    - **Validates: Requirements 6.2, 6.4**

- [x] 11. Checkpoint - Verify vertical stack layout works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement Edge Label Safe Zone (NEW)
  - [x] 12.1 Enhance AnchorState to include edgeDirection
    - Add `edgeDirection: 'left' | 'top' | 'right' | 'bottom'` field
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 12.2 Modify setPreCreatedGroup to accept and store edge direction
    - Add edgeDirection parameter (default: 'left')
    - Store in anchorState
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 12.3 Update generateGroupWithAI to pass edge direction
    - Determine edge direction from fromSide/toSide calculation
    - Pass to setPreCreatedGroup
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 12.4 Apply safe zone in calculateNodePositionInPreCreatedGroup
    - Calculate topSafeZone based on edgeDirection === 'top'
    - Calculate leftSafeZone based on edgeDirection === 'left'
    - Add safe zones to position calculation
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 12.5 Write property test for edge label safe zone
    - **Property 8: Edge Label Safe Zone**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**

- [-] 13. Implement Horizontal Column Spacing (NEW)
  - [x] 13.1 Track column widths in columnTracks
    - Update maxWidth when node is registered
    - Use actual node width if larger than default
    - _Requirements: 8.2, 8.3_

  - [x] 13.2 Enhance calculateNodePositionInPreCreatedGroup for dynamic X positioning
    - Sum column widths for columns 0 to col-1
    - Add HORIZONTAL_GAP between each column
    - _Requirements: 8.1_

  - [x] 13.3 Update node width tracking when content changes
    - Track actual width in nodeActualSizes
    - Update column maxWidth if node width increases
    - _Requirements: 8.2_

  - [ ] 13.4 Write property test for horizontal column spacing
    - **Property 9: Horizontal Column Spacing**
    - **Validates: Requirements 8.1, 8.3, 8.4**

- [x] 14. Integrate Dynamic Layout with Content Updates (NEW)
  - [x] 14.1 Modify updatePartialNode to trigger repositioning
    - Calculate new height after content update
    - Update nodeActualSizes and columnTracks
    - Call repositionNodesInColumn if height changed
    - _Requirements: 6.2_

  - [x] 14.2 Update group bounds after repositioning
    - Call updateGroupBounds after repositionNodesInColumn
    - Ensure group expands to fit repositioned nodes
    - _Requirements: 3.1_

  - [x] 14.3 Write unit tests for content growth scenarios
    - Test single node height growth
    - Test multiple nodes in column with growth
    - Test multi-column layout with growth
    - _Requirements: 6.2, 6.4_

- [x] 15. Final checkpoint - Ensure all layout tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Fix Anchor Immutability During Streaming (CRITICAL - Jitter Fix)
  - [x] 16.1 Modify updateGroupBoundsPreservingAnchor to never change x/y
    - Remove any code that modifies group.x or group.y
    - Only allow modifications to group.width and group.height
    - Ensure group can only expand downward and rightward
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 16.2 Add anchor immutability assertion in updateGroupBounds
    - Add debug assertion to verify anchor position never changes
    - Log warning if anchor drift is detected
    - _Requirements: 9.1_

  - [x] 16.3 Write property test for anchor immutability
    - **Property 10: Anchor Immutability During Streaming**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 17. Fix Real-Time Reflow on Content Growth (CRITICAL - Overlap Fix)
  - [x] 17.1 Ensure updatePartialNode triggers repositioning correctly
    - Verify height change detection is working
    - Ensure repositionNodesInColumn is called when height increases
    - Verify nodes below are pushed down by the correct delta
    - _Requirements: 10.1, 10.2_

  - [x] 17.2 Fix Y-position calculation to use accumulated heights
    - Ensure calculateNodePositionInPreCreatedGroup uses dynamic stack formula
    - Remove any fixed grid height calculations
    - Verify Y = prevNode.y + prevNode.actualHeight + VERTICAL_GAP
    - _Requirements: 10.3_

  - [x] 17.3 Batch reflow operations within single animation frame
    - Ensure repositionNodesInColumn calls requestFrame only once at the end
    - Batch multiple height changes if they occur in same frame
    - _Requirements: 10.4, 10.5_

  - [x] 17.4 Write unit tests for reflow scenarios
    - Test single node height growth pushes down nodes below
    - Test multiple nodes growing in sequence
    - Test multi-column layout with independent column reflows
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 18. Ensure Node Visual Clarity
  - [x] 18.1 Verify all created nodes have background color
    - Check createNodeDirectly sets color property
    - Ensure default color is applied if type-based color is not available
    - _Requirements: 11.1_

  - [x] 18.2 Add overlap detection and correction
    - Add validation after repositioning to detect any remaining overlaps
    - Correct overlaps by pushing nodes down if detected
    - Log warning if overlap correction is needed
    - _Requirements: 11.3_

- [x] 19. Final Integration Testing
  - [x] 19.1 Test streaming with varying content lengths
    - Simulate AI streaming with short, medium, and long content
    - Verify no jitter during streaming
    - Verify no overlap at any point
    - _Requirements: 9.1, 10.1, 11.2_

  - [x] 19.2 Test multi-column layouts during streaming
    - Verify columns remain independent
    - Verify horizontal spacing is maintained
    - _Requirements: 8.1, 8.4_

- [x] 20. Final checkpoint - All critical fixes verified
  - Ensure all tests pass, ask the user if questions arise.

- [x] 21. Fix Group Header Height Clearance (CRITICAL - First Node Overflow Fix)
  - [x] 21.1 Add GROUP_HEADER_HEIGHT and PADDING constants to LAYOUT_CONSTANTS
    - Add `GROUP_HEADER_HEIGHT: 40` to LAYOUT_CONSTANTS
    - Add `PADDING_TOP: 20` to LAYOUT_CONSTANTS
    - Add `PADDING_BOTTOM: 20` to LAYOUT_CONSTANTS
    - _Requirements: 12.5_

  - [x] 21.2 Update calculateNodePositionInPreCreatedGroup for first row header clearance
    - Change first row Y formula from `anchorY + padding + topSafeZone` to `anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone`
    - Ensure this formula is applied immediately on first token arrival
    - Apply same margin to all nodes in row 0
    - _Requirements: 12.1, 12.2, 12.6_

  - [x] 21.3 Update updateGroupBoundsPreservingAnchor for immediate container expansion
    - Ensure group height expands immediately when first node is created
    - Formula: `group.height = max(MinHeight, node.relativeY + node.height + PADDING_BOTTOM)`
    - Prevent group from shrinking during initial streaming phase
    - _Requirements: 12.3, 12.4_

  - [x] 21.4 Write property test for group header height clearance
    - **Property 12: Group Header Height Clearance**
    - Test that first row nodes satisfy: `node.y >= group.y + GROUP_HEADER_HEIGHT + PADDING_TOP`
    - Test that group height satisfies: `group.height >= (node.y - group.y) + node.height + PADDING_BOTTOM`
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6**

  - [x] 21.5 Write unit tests for first node positioning scenarios
    - Test first node in single-column layout clears header
    - Test first node in multi-column layout (all row-0 nodes clear header)
    - Test group bounds expand immediately on first node creation
    - Test group doesn't shrink during streaming
    - _Requirements: 12.1, 12.3, 12.4, 12.6_

- [x] 22. Final checkpoint - Group Header Height Clearance verified
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks 1-8 are completed (original anchor positioning fix)
- Tasks 9-15 are completed (dynamic layout features)
- Tasks 16-20 are completed (jitter and overlap fixes)
- Tasks 21-22 are NEW (Group Header Height Clearance fix)
- All tasks are required (comprehensive testing enabled)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
