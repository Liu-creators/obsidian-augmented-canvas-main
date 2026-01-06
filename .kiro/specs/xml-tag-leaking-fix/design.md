# Design Document: XML Tag Leaking Fix

## Overview

This design addresses the "Tag Leaking" bug in the XML stream parser where partial closing tags (like `</` or `</no`) appear at the end of node text content during streaming. The fix introduces a content sanitization layer that removes trailing partial XML tags before content is displayed to users.

The root cause is that during streaming, the parser extracts content from incomplete nodes before the full closing tag has arrived. When a chunk boundary falls in the middle of a closing tag (e.g., `...text</` arrives, then `node>` arrives later), the partial tag `</` is incorrectly included in the content.

## Architecture

The solution adds a sanitization layer to the `IncrementalXMLParser` class:

```
┌─────────────────────────────────────────────────────────────┐
│                    Streaming Input                          │
│  "...成本控制：优化Token使用。</no"  (chunk boundary)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              IncrementalXMLParser                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  detectIncompleteNodes()                             │   │
│  │  - Extract content from incomplete <node> elements   │   │
│  │  - Content: "成本控制：优化Token使用。</no"          │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
│                              ▼                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  sanitizeContent()                                   │   │
│  │  - Apply regex: /<\/?[a-zA-Z]*$/                     │   │
│  │  - Remove trailing partial tags                      │   │
│  │  - Output: "成本控制：优化Token使用。"               │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Clean Content Output                     │
│  NodeXML { content: "成本控制：优化Token使用。" }           │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### sanitizeContent Function

A new public method added to `IncrementalXMLParser`:

```typescript
/**
 * Sanitize content by removing trailing partial XML tags
 * 
 * Handles these cases:
 * - Trailing `<` (start of potential tag)
 * - Trailing `</` (start of closing tag)
 * - Trailing `</xxx` (partial closing tag name)
 * - Trailing `<xxx` (partial opening tag name)
 * 
 * @param content - Raw content that may contain partial tags
 * @returns Sanitized content with trailing partial tags removed
 */
public sanitizeContent(content: string): string {
    // Remove trailing partial tags using regex
    // Pattern: < optionally followed by / optionally followed by letters at end of string
    return content.replace(/<\/?[a-zA-Z]*$/, '');
}
```

### Modified detectIncompleteNodes Method

The existing `detectIncompleteNodes` method is modified to apply sanitization:

```typescript
public detectIncompleteNodes(): NodeXML[] {
    const nodes: NodeXML[] = [];
    const unprocessed = this.getUnprocessedContent();
    
    // ... existing parsing logic ...
    
    // Before: content was returned as-is
    // After: content is sanitized before being added to node
    const rawContent = nextTagStart === -1 
        ? afterTag.trim() 
        : afterTag.substring(0, nextTagStart).trim();
    
    // NEW: Apply sanitization to remove partial tags
    const content = this.sanitizeContent(rawContent);
    
    const node: NodeXML = {
        id,
        type,
        title,
        row,
        col,
        content,  // Now sanitized
    };
    
    // ... rest of method ...
}
```

## Data Models

No new data models are required. The existing `NodeXML` interface remains unchanged:

```typescript
interface NodeXML {
    id: string;
    type: NodeType;
    title?: string;
    row: number;
    col: number;
    content: string;  // Now guaranteed to be sanitized
    groupId?: string;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Trailing Partial Tag Removal

*For any* content string ending with a partial XML tag pattern (`<`, `</`, `</x`, `</xx`, etc.), the `sanitizeContent` function SHALL return the content with the trailing partial tag removed.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 2.4**

### Property 2: Content Preservation for Non-Tag Characters

*For any* content string that does NOT end with a partial XML tag pattern (including strings with `<` followed by space, digit, or other non-letter characters), the `sanitizeContent` function SHALL return the content unchanged.

**Validates: Requirements 2.5, 5.1, 5.2**

### Property 3: Sanitization Idempotence

*For any* content string, applying `sanitizeContent` twice SHALL produce the same result as applying it once: `sanitizeContent(sanitizeContent(x)) === sanitizeContent(x)`.

**Validates: Requirements 2.1, 6.2**

### Property 4: detectIncompleteNodes Content Sanitization

*For any* XML stream containing incomplete nodes with partial closing tags at chunk boundaries, the `detectIncompleteNodes` method SHALL return NodeXML objects with sanitized content that contains no trailing partial tag characters.

**Validates: Requirements 3.4, 4.1, 4.2**

## Error Handling

The sanitization function is designed to be fail-safe:

1. **Empty string input**: Returns empty string (no-op)
2. **No partial tags**: Returns input unchanged
3. **Multiple partial tags**: Only removes the trailing one (regex anchored to end)
4. **Unicode content**: Regex only matches ASCII letters, preserving all Unicode content

```typescript
// Edge cases handled:
sanitizeContent("")           // Returns ""
sanitizeContent("hello")      // Returns "hello"
sanitizeContent("a < b")      // Returns "a < b" (space after <)
sanitizeContent("x<5")        // Returns "x<5" (digit after <)
sanitizeContent("text<")      // Returns "text"
sanitizeContent("text</")     // Returns "text"
sanitizeContent("text</node") // Returns "text"
sanitizeContent("中文</")     // Returns "中文"
```

## Testing Strategy

### Unit Tests

Unit tests verify specific examples and edge cases:

1. **Basic sanitization cases**:
   - Content ending with `<`
   - Content ending with `</`
   - Content ending with `</node`
   - Content ending with `</group`

2. **Preservation cases**:
   - Content with `< ` (space after)
   - Content with `<5` (digit after)
   - Content with no partial tags
   - Empty string

3. **Integration cases**:
   - `detectIncompleteNodes` with partial tags at chunk boundary
   - Multiple chunks simulating real streaming

### Property-Based Tests

Property-based tests verify universal properties across many generated inputs using fast-check:

1. **Property 1 test**: Generate random strings + random partial tag suffixes, verify removal
2. **Property 2 test**: Generate random strings without partial tag patterns, verify preservation
3. **Property 3 test**: Generate random strings, verify idempotence
4. **Property 4 test**: Generate random XML streams with incomplete nodes, verify sanitization

Each property test should run minimum 100 iterations.

Test annotations format:
```typescript
// **Feature: xml-tag-leaking-fix, Property 1: Trailing Partial Tag Removal**
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 2.4**
```
