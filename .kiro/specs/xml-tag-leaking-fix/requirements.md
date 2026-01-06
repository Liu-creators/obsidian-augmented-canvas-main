# Requirements Document

## Introduction

This document specifies the requirements for fixing the "Tag Leaking" bug in the XML stream parser. When the AI streams back XML content, some nodes display closing tag artifacts (specifically `</` or `</no`) at the very end of their text content. This occurs because the stream parser treats partial closing tags as part of the text content before the full tag has been completely buffered or matched.

## Glossary

- **IncrementalXMLParser**: The parser class that processes XML chunks as they arrive during streaming, detecting complete and incomplete XML elements.
- **Partial_Tag**: An incomplete XML tag fragment such as `<`, `</`, `</n`, `</no`, `</nod`, or `</node` that appears at the end of a text buffer before the full closing tag is received.
- **Content_Buffer**: The accumulated text content of a node being parsed during streaming.
- **Chunk_Boundary**: The point where a streaming chunk ends, which may occur in the middle of an XML tag.
- **Sanitized_Content**: Text content that has been cleaned of any partial tag artifacts before being displayed to the user.
- **Tag_Lookahead**: A buffering mechanism that holds potentially incomplete tag characters until the next chunk arrives to determine if they form a valid tag.

## Requirements

### Requirement 1: Partial Tag Detection at Content End

**User Story:** As a user viewing streamed content, I want the parser to detect partial closing tags at the end of content, so that I never see XML tag fragments in the displayed text.

#### Acceptance Criteria

1. WHEN the Content_Buffer ends with `<` THEN THE IncrementalXMLParser SHALL NOT include the `<` character in the Sanitized_Content
2. WHEN the Content_Buffer ends with `</` THEN THE IncrementalXMLParser SHALL NOT include the `</` characters in the Sanitized_Content
3. WHEN the Content_Buffer ends with `</` followed by 1-10 alphanumeric characters (e.g., `</n`, `</no`, `</nod`, `</node`) THEN THE IncrementalXMLParser SHALL NOT include these characters in the Sanitized_Content
4. WHEN the Content_Buffer ends with a complete closing tag (e.g., `</node>`) THEN THE IncrementalXMLParser SHALL NOT include the closing tag in the Sanitized_Content

### Requirement 2: Content Sanitization Function

**User Story:** As a developer, I want a dedicated sanitization function that removes partial tags from content, so that the cleaning logic is centralized and testable.

#### Acceptance Criteria

1. THE IncrementalXMLParser SHALL provide a `sanitizeContent` function that removes trailing partial tags from a string
2. WHEN `sanitizeContent` receives content ending with `<` THEN THE function SHALL return the content without the trailing `<`
3. WHEN `sanitizeContent` receives content ending with `</` THEN THE function SHALL return the content without the trailing `</`
4. WHEN `sanitizeContent` receives content ending with `</` followed by partial tag name characters THEN THE function SHALL return the content without the partial tag
5. WHEN `sanitizeContent` receives content with no trailing partial tags THEN THE function SHALL return the content unchanged
6. THE `sanitizeContent` function SHALL use the regex pattern `/<\/?[a-zA-Z]*$/` to match and remove trailing partial tags

### Requirement 3: Chunk Boundary Handling

**User Story:** As a user, I want the parser to correctly handle XML tags split across chunk boundaries, so that content is always displayed cleanly regardless of how the stream is chunked.

#### Acceptance Criteria

1. WHEN a stream chunk ends with `</` and the next chunk starts with `node>` THEN THE IncrementalXMLParser SHALL correctly identify `</node>` as a closing tag and exclude it from content
2. WHEN a stream chunk ends with `<` and the next chunk starts with `/node>` THEN THE IncrementalXMLParser SHALL correctly identify `</node>` as a closing tag and exclude it from content
3. WHEN a stream chunk ends with `</no` and the next chunk starts with `de>` THEN THE IncrementalXMLParser SHALL correctly identify `</node>` as a closing tag and exclude it from content
4. WHEN content is extracted from incomplete nodes THEN THE IncrementalXMLParser SHALL apply sanitization before returning the content

### Requirement 4: Integration with Incomplete Node Detection

**User Story:** As a developer, I want the `detectIncompleteNodes` method to automatically sanitize content, so that partial tags are never exposed to the UI layer.

#### Acceptance Criteria

1. WHEN `detectIncompleteNodes` extracts content from an incomplete node THEN THE IncrementalXMLParser SHALL sanitize the content before including it in the returned NodeXML object
2. WHEN `detectIncompleteNodes` finds content ending with partial tags THEN THE returned NodeXML.content SHALL NOT contain any partial tag characters
3. THE `detectIncompleteNodes` method SHALL call `sanitizeContent` on all extracted content before returning

### Requirement 5: Preservation of Valid Content

**User Story:** As a user, I want the sanitization to only remove actual partial tags, so that legitimate content containing `<` characters (like mathematical expressions or code) is preserved when appropriate.

#### Acceptance Criteria

1. WHEN content contains `<` followed by a space (e.g., `a < b`) THEN THE IncrementalXMLParser SHALL preserve the `<` character in Sanitized_Content
2. WHEN content contains `<` followed by a digit (e.g., `x<5`) THEN THE IncrementalXMLParser SHALL preserve the `<` character in Sanitized_Content
3. WHEN content ends with `<` at the very end of the buffer THEN THE IncrementalXMLParser SHALL remove it (as it could be the start of a tag)
4. WHEN content ends with `</` at the very end of the buffer THEN THE IncrementalXMLParser SHALL remove it (as it is definitely a partial closing tag)

### Requirement 6: Performance Considerations

**User Story:** As a developer, I want the sanitization to be efficient, so that it does not impact streaming performance.

#### Acceptance Criteria

1. THE `sanitizeContent` function SHALL execute in O(n) time complexity where n is the length of the content string
2. THE `sanitizeContent` function SHALL use a single regex replacement operation
3. WHEN processing streaming chunks THEN THE IncrementalXMLParser SHALL apply sanitization only once per content extraction, not on every character
