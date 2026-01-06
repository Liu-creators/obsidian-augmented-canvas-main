# Requirements Document

## Introduction

This feature addresses a Markdown rendering issue where content inside canvas nodes is incorrectly rendered as code blocks due to leading indentation (4+ spaces) in the incoming XML/string data. The fix implements a dedent/normalization logic to sanitize text content before it reaches the Markdown renderer.

## Glossary

- **Content_Sanitizer**: The component responsible for normalizing text content by removing problematic leading whitespace
- **Markdown_Renderer**: The Obsidian component that renders Markdown text inside canvas nodes
- **Dedent**: The process of removing common leading whitespace from multi-line text
- **Code_Block**: A Markdown element triggered by 4+ spaces or tab indentation at line start
- **Node_Content**: The text content extracted from XML nodes that will be displayed in canvas nodes

## Requirements

### Requirement 1: Content Dedent Function

**User Story:** As a user, I want my node content to render correctly as Markdown, so that bold headers and bullet points display properly instead of appearing as code blocks.

#### Acceptance Criteria

1. THE Content_Sanitizer SHALL provide a `dedentContent` function that normalizes multi-line text indentation
2. WHEN the `dedentContent` function receives text with lines having 4+ leading spaces, THE Content_Sanitizer SHALL remove the common leading whitespace from all lines
3. WHEN the `dedentContent` function receives text with mixed indentation levels, THE Content_Sanitizer SHALL preserve relative indentation between lines while removing the minimum common indent
4. WHEN the `dedentContent` function receives text with empty lines, THE Content_Sanitizer SHALL preserve empty lines without treating them as having zero indentation
5. WHEN the `dedentContent` function receives text with no leading whitespace, THE Content_Sanitizer SHALL return the text unchanged

### Requirement 2: Markdown-Aware Line Processing

**User Story:** As a user, I want Markdown syntax elements like headers and list items to be recognized correctly, so that formatting is preserved.

#### Acceptance Criteria

1. WHEN a line starts with Markdown header syntax (`#`, `##`, etc.) after whitespace removal, THE Content_Sanitizer SHALL ensure the line has no leading spaces
2. WHEN a line starts with Markdown list syntax (`*`, `-`, `+`, or numbered lists) after whitespace removal, THE Content_Sanitizer SHALL ensure the line has no leading spaces that would trigger code block rendering
3. WHEN a line starts with Markdown bold/italic syntax (`**`, `*`, `__`, `_`) after whitespace removal, THE Content_Sanitizer SHALL ensure the line has no leading spaces that would trigger code block rendering
4. WHEN a line is intentionally indented for nested list items (2-3 spaces), THE Content_Sanitizer SHALL preserve that relative indentation

### Requirement 3: Integration with XML Parser

**User Story:** As a developer, I want the dedent logic integrated into the content extraction pipeline, so that all node content is automatically sanitized.

#### Acceptance Criteria

1. WHEN the IncrementalXMLParser extracts content from a `<node>` element, THE Content_Sanitizer SHALL apply dedent processing before returning the content
2. WHEN the IncrementalXMLParser detects incomplete nodes during streaming, THE Content_Sanitizer SHALL apply dedent processing to partial content
3. WHEN content is updated during streaming via `updatePartialNode`, THE Content_Sanitizer SHALL apply dedent processing to the new content
4. THE Content_Sanitizer SHALL NOT modify content that is already properly formatted (no excessive leading whitespace)

### Requirement 4: Edge Case Handling

**User Story:** As a user, I want the dedent logic to handle various edge cases gracefully, so that my content is never corrupted.

#### Acceptance Criteria

1. WHEN the `dedentContent` function receives an empty string, THE Content_Sanitizer SHALL return an empty string
2. WHEN the `dedentContent` function receives a single-line string, THE Content_Sanitizer SHALL trim leading whitespace from that line
3. WHEN the `dedentContent` function receives text with only whitespace lines, THE Content_Sanitizer SHALL return an empty string or preserve the structure appropriately
4. WHEN the `dedentContent` function receives text with tab characters, THE Content_Sanitizer SHALL treat tabs as whitespace for dedent calculation
5. IF the dedent processing encounters an error, THEN THE Content_Sanitizer SHALL return the original content unchanged and log a warning

### Requirement 5: Performance Considerations

**User Story:** As a user, I want the dedent processing to be fast, so that streaming content updates remain smooth.

#### Acceptance Criteria

1. THE Content_Sanitizer SHALL process content in O(n) time complexity where n is the content length
2. THE Content_Sanitizer SHALL avoid creating unnecessary intermediate string copies during processing
3. WHEN processing streaming updates, THE Content_Sanitizer SHALL complete dedent processing within 1ms for typical node content sizes (under 10KB)
