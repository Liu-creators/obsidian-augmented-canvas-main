# Implementation Plan: Markdown Indentation Fix

## Overview

This plan implements the `dedentContent` function in the `IncrementalXMLParser` class and integrates it into the content extraction pipeline to fix Markdown rendering issues caused by leading indentation.

## Tasks

- [x] 1. Implement dedentContent function
  - [x] 1.1 Add `dedentContent` method to `IncrementalXMLParser` class in `src/utils/incrementalXMLParser.ts`
    - Implement algorithm to find minimum common indentation across non-empty lines
    - Remove common indentation from all lines while preserving empty lines
    - Handle edge cases: empty string, single line, tabs, no indentation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.2 Write property test for no code-block-triggering indentation
    - **Property 1: No Code-Block-Triggering Indentation**
    - **Validates: Requirements 1.2, 2.1, 2.2, 2.3**

  - [x] 1.3 Write property test for relative indentation preservation
    - **Property 2: Relative Indentation Preservation**
    - **Validates: Requirements 1.3, 2.4**

  - [x] 1.4 Write property test for empty line preservation
    - **Property 3: Empty Line Preservation**
    - **Validates: Requirements 1.4**

  - [x] 1.5 Write property test for idempotence
    - **Property 4: Idempotence**
    - **Validates: Requirements 1.5, 3.4**

- [x] 2. Integrate dedentContent into XML parser
  - [x] 2.1 Update `parseNodeElement` method to apply dedent to extracted content
    - Call `dedentContent` on the textContent before returning NodeXML
    - _Requirements: 3.1_

  - [x] 2.2 Update `parseNodeElementFromDOM` method to apply dedent to extracted content
    - Call `dedentContent` on the textContent before returning NodeXML
    - _Requirements: 3.1_

  - [x] 2.3 Update `detectIncompleteNodes` method to apply dedent to partial content
    - Call `dedentContent` after `sanitizeContent` in the streaming path
    - _Requirements: 3.2_

  - [x] 2.4 Write property test for integration round-trip
    - **Property 7: Integration Round-Trip**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Additional property tests
  - [x] 4.1 Write property test for tab handling
    - **Property 5: Tab Handling**
    - **Validates: Requirements 4.4**

  - [x] 4.2 Write property test for never throws
    - **Property 6: Never Throws**
    - **Validates: Requirements 4.5**

- [x] 5. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property tests are required for comprehensive coverage
- The `dedentContent` function is added to `IncrementalXMLParser` to keep related sanitization logic together (alongside existing `sanitizeContent`)
- Property tests use `fast-check` library (already in project dependencies)
- Each property test should run minimum 100 iterations
