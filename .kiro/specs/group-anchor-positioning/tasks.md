# Implementation Plan: Group Anchor Positioning Fix

## Overview

This implementation fixes the "layout jumping" bug by introducing anchor-based positioning for nodes within pre-created groups. The changes are localized to `StreamingNodeCreator` class, with minimal impact on other components.

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

## Notes

- All tasks are required (comprehensive testing enabled)
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The fix is localized to `StreamingNodeCreator` - no changes needed to `generateGroup.ts` or other files
