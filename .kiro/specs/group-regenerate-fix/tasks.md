# Implementation Plan: Group Regenerate Fix

## Overview

This plan implements the polymorphic regeneration feature that handles both Node and Group targets. The implementation modifies `noteGenerator.ts` to detect target type and delegates to appropriate regeneration logic.

## Tasks

- [x] 1. Add type detection and routing logic to generateNote
  - [x] 1.1 Import `isGroup` and `getNodesInGroup` from groupUtils.ts into noteGenerator.ts
    - Add import statement at top of file
    - _Requirements: 1.1_
  - [x] 1.2 Add type check branch in generateNote() before setText() call
    - Check `if (isGroup(toNode))` before the existing `toNode.setText()` call
    - Route to new `regenerateGroup()` function for groups
    - Preserve existing `setText()` logic for non-group nodes
    - _Requirements: 1.2, 1.3, 2.1_
  - [x] 1.3 Write property test for routing correctness
    - **Property 2: Routing Correctness**
    - **Validates: Requirements 1.2, 1.3**

- [x] 2. Implement regenerateGroup function
  - [x] 2.1 Create regenerateGroup function skeleton in noteGenerator.ts
    - Function signature: `async function regenerateGroup(canvas, groupNode, fromNode, messages, settings, edgeLabel)`
    - Store group bounds (x, y, width, height) at start
    - _Requirements: 3.3_
  - [x] 2.2 Implement child node clearing with error recovery
    - Get child nodes using `getNodesInGroup()`
    - Store references before deletion
    - Use two-phase deletion: only delete after first successful AI chunk
    - _Requirements: 3.2, 4.2_
  - [x] 2.3 Implement AI streaming and node creation within group
    - Call `streamResponse()` with messages
    - Parse response using `parseNodesFromMarkdown()`
    - Create new nodes positioned within group bounds using `calculateSmartLayout()`
    - _Requirements: 3.4, 3.5, 3.6_
  - [x] 2.4 Implement connection creation between new child nodes
    - Parse connections from AI response
    - Create edges between child nodes using `addEdge()`
    - _Requirements: 3.7_
  - [x] 2.5 Write property test for Group setText avoidance
    - **Property 4: Group setText Avoidance (Core Bug Fix)**
    - **Validates: Requirements 3.1**
  - [x] 2.6 Write property test for group position preservation
    - **Property 5: Group Position/Dimension Preservation**
    - **Validates: Requirements 3.3**

- [x] 3. Checkpoint - Ensure core functionality works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement error handling
  - [x] 4.1 Add error handling for missing API key
    - Check `settings.apiKey` before AI call
    - Display notice if missing
    - _Requirements: 4.1_
  - [x] 4.2 Add error handling for AI streaming failures
    - Catch errors in streamResponse callback
    - Preserve original nodes if deletion hasn't occurred
    - Display error notice
    - _Requirements: 4.2, 4.3_
  - [x] 4.3 Write property test for error recovery content preservation
    - **Property 8: Error Recovery Content Preservation**
    - **Validates: Requirements 4.2**

- [x] 5. Wire up edge label prompt handling
  - [x] 5.1 Ensure edge label is passed through regenerateResponse to generateNote
    - Extract edge label from the edge object in handleRegenerateResponse
    - Pass to noteGenerator and generateNote
    - _Requirements: 5.1, 5.2_
  - [x] 5.2 Include edge label in AI messages for group regeneration
    - Add edge label as user message in buildMessages or regenerateGroup
    - _Requirements: 5.3_
  - [x] 5.3 Write property test for edge label prompt usage
    - **Property 7: Edge Label Prompt Usage**
    - **Validates: Requirements 3.4, 5.1, 5.3**

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The core bug fix is in task 1.2 (routing) and 2.1-2.3 (group regeneration without setText)
