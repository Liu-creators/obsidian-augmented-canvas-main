# Design Document: Markdown Indentation Fix

## Overview

This design addresses the Markdown rendering issue where content inside canvas nodes is incorrectly rendered as code blocks due to leading indentation (4+ spaces) in the incoming XML/string data from AI responses.

The solution implements a `dedentContent` function that normalizes text indentation before the content reaches the Markdown renderer. This function will be integrated into the existing `IncrementalXMLParser` content extraction pipeline.

## Architecture

The fix follows a simple pipeline approach:

```
AI Response → XML Parser → dedentContent() → Node Content → Markdown Renderer
```

The `dedentContent` function is a pure utility function that:
1. Analyzes all lines to find the minimum common indentation
2. Removes that common indentation from all non-empty lines
3. Preserves relative indentation for nested structures
4. Returns normalized content safe for Markdown rendering

## Components and Interfaces

### dedentContent Function

Location: `src/utils/incrementalXMLParser.ts` (as a method on IncrementalXMLParser class)

```typescript
/**
 * Dedent content by removing common leading whitespace from all lines.
 * This prevents Markdown from interpreting indented content as code blocks.
 * 
 * @param content - Raw content that may have leading indentation
 * @returns Content with common leading whitespace removed
 */
public dedentContent(content: string): string
```

### Integration Points

The `dedentContent` method will be called in these locations within `IncrementalXMLParser`:

1. `parseNodeElement()` - When extracting content from complete `<node>` elements
2. `parseNodeElementFromDOM()` - When parsing nodes from DOM elements
3. `detectIncompleteNodes()` - When extracting partial content during streaming

## Data Models

### Input/Output Contract

```typescript
interface DedentResult {
  /** The dedented content string */
  content: string;
  /** Number of spaces removed from each line (for debugging) */
  indentRemoved: number;
}
```

For simplicity, the function returns just the string, but internally tracks the indent level removed.

### Line Classification

Lines are classified for processing:
- **Empty lines**: Lines with only whitespace - preserved but not counted for minimum indent calculation
- **Content lines**: Lines with non-whitespace content - used for minimum indent calculation
- **Markdown syntax lines**: Lines starting with `#`, `*`, `-`, `+`, `>`, or digits followed by `.` - must not have code-block-triggering indentation

## Algorithm

```
function dedentContent(content: string): string
  1. If content is empty or has no newlines, return trimmed content
  2. Split content into lines
  3. Find minimum indentation:
     - For each non-empty line, count leading whitespace (spaces and tabs)
     - Track the minimum count across all non-empty lines
  4. Remove minimum indentation from each line:
     - For empty lines, preserve them as-is
     - For content lines, remove exactly minIndent characters from start
  5. Join lines and return
```

### Pseudocode

```
FUNCTION dedentContent(content: string) -> string:
    IF content is empty:
        RETURN ""
    
    lines = content.split('\n')
    
    IF lines.length == 1:
        RETURN lines[0].trimStart()
    
    // Find minimum indentation (ignoring empty lines)
    minIndent = INFINITY
    FOR each line in lines:
        IF line has non-whitespace content:
            indent = count leading whitespace in line
            minIndent = MIN(minIndent, indent)
    
    IF minIndent == INFINITY OR minIndent == 0:
        RETURN content  // No dedent needed
    
    // Remove common indentation
    result = []
    FOR each line in lines:
        IF line is empty or whitespace-only:
            result.push(line)
        ELSE:
            result.push(line.substring(minIndent))
    
    RETURN result.join('\n')
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: No Code-Block-Triggering Indentation

*For any* multi-line content string where all lines have 4+ leading spaces, the `dedentContent` function SHALL return content where no line starts with 4+ spaces (unless it's intentionally a code block with backticks).

**Validates: Requirements 1.2, 2.1, 2.2, 2.3**

### Property 2: Relative Indentation Preservation

*For any* multi-line content string with varying indentation levels, the `dedentContent` function SHALL preserve the relative indentation differences between lines. If line A has N more spaces than line B in the input, line A SHALL have N more spaces than line B in the output.

**Validates: Requirements 1.3, 2.4**

### Property 3: Empty Line Preservation

*For any* content string containing empty lines (lines with only whitespace or no characters), the `dedentContent` function SHALL preserve the same number of empty lines in the same positions in the output.

**Validates: Requirements 1.4**

### Property 4: Idempotence

*For any* content string, applying `dedentContent` twice SHALL produce the same result as applying it once: `dedentContent(dedentContent(x)) === dedentContent(x)`.

**Validates: Requirements 1.5, 3.4**

### Property 5: Tab Handling

*For any* content string containing tab characters as leading whitespace, the `dedentContent` function SHALL treat tabs equivalently to spaces for the purpose of calculating minimum indentation.

**Validates: Requirements 4.4**

### Property 6: Never Throws

*For any* input string (including malformed, extremely long, or containing special characters), the `dedentContent` function SHALL never throw an exception and SHALL always return a string.

**Validates: Requirements 4.5**

### Property 7: Integration Round-Trip

*For any* valid XML node content with leading indentation, when parsed by `IncrementalXMLParser`, the extracted content SHALL have no code-block-triggering indentation (4+ leading spaces on Markdown syntax lines).

**Validates: Requirements 3.1, 3.2, 3.3**

## Error Handling

The `dedentContent` function is designed to be fail-safe:

1. **Empty input**: Returns empty string
2. **Single line**: Returns trimmed line
3. **No common indent**: Returns original content unchanged
4. **Malformed content**: Returns original content (never throws)

All error conditions result in graceful degradation rather than exceptions.

## Testing Strategy

### Unit Tests

Unit tests will cover specific examples and edge cases:
- Empty string input
- Single line input
- Content with no indentation
- Content with uniform indentation
- Content with mixed indentation
- Content with empty lines interspersed
- Content with tab characters
- Content with Markdown headers, lists, bold text
- Very long content (performance sanity check)

### Property-Based Tests

Property-based tests will use `fast-check` to verify the correctness properties:
- Minimum 100 iterations per property test
- Custom generators for multi-line content with various indentation patterns
- Each test tagged with: **Feature: markdown-indentation-fix, Property N: [property text]**

### Integration Tests

Integration tests will verify the end-to-end flow:
- XML parsing with indented content produces correctly dedented nodes
- Streaming updates maintain dedented content
- Real-world AI response examples render correctly
