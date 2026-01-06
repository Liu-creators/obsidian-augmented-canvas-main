# Implementation Plan: XML Tag Leaking Fix

## Overview

This implementation plan addresses the Tag Leaking bug by adding a content sanitization layer to the `IncrementalXMLParser` class. The fix is minimal and focused: add a `sanitizeContent` method and integrate it into `detectIncompleteNodes`.

## Tasks

- [x] 1. Implement sanitizeContent function
  - Add `sanitizeContent(content: string): string` method to `IncrementalXMLParser` class
  - Use regex pattern `/<\/?[a-zA-Z]*$/` to remove trailing partial tags
  - Add JSDoc documentation explaining the function's purpose and edge cases
  - _Requirements: 2.1, 2.6_

- [x] 1.1 Write property test for trailing partial tag removal
  - **Property 1: Trailing Partial Tag Removal**
  - Generate random content strings with partial tag suffixes (`<`, `</`, `</xxx`)
  - Verify sanitized output does not contain trailing partial tags
  - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 2.4**

- [x] 1.2 Write property test for content preservation
  - **Property 2: Content Preservation for Non-Tag Characters**
  - Generate random content strings without partial tag patterns
  - Include strings with `< ` (space), `<5` (digit), etc.
  - Verify content is returned unchanged
  - **Validates: Requirements 2.5, 5.1, 5.2**

- [x] 1.3 Write property test for sanitization idempotence
  - **Property 3: Sanitization Idempotence**
  - Generate random content strings
  - Verify `sanitizeContent(sanitizeContent(x)) === sanitizeContent(x)`
  - **Validates: Requirements 2.1, 6.2**

- [x] 2. Integrate sanitization into detectIncompleteNodes
  - Modify `detectIncompleteNodes` method in `IncrementalXMLParser`
  - Apply `sanitizeContent` to extracted content before creating NodeXML objects
  - Ensure sanitization is applied after trimming but before returning
  - _Requirements: 3.4, 4.1, 4.2, 4.3_

- [x] 2.1 Write property test for detectIncompleteNodes sanitization
  - **Property 4: detectIncompleteNodes Content Sanitization**
  - Generate random XML streams with incomplete nodes containing partial tags
  - Verify returned NodeXML.content contains no trailing partial tag characters
  - **Validates: Requirements 3.4, 4.1, 4.2**

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3.1 Write unit tests for edge cases
  - Test empty string input
  - Test content with `< ` (space after less-than)
  - Test content with `<5` (digit after less-than)
  - Test Unicode content with partial tags (e.g., `中文</`)
  - Test chunk boundary scenarios (simulated streaming)
  - _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2_

- [x] 4. Final checkpoint - Verify fix resolves the bug
  - Run existing integration tests
  - Manually verify the fix with the original bug scenario
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including tests are required for comprehensive coverage
- The fix is intentionally minimal - only modifying `IncrementalXMLParser`
- Property tests use fast-check library (already available in the project)
- Each property test should run minimum 100 iterations
