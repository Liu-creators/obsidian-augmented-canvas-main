/**
 * Property-Based Tests for IncrementalXMLParser.detectIncompleteNodes Content Sanitization
 * 
 * **Feature: xml-tag-leaking-fix, Property 4: detectIncompleteNodes Content Sanitization**
 * **Validates: Requirements 3.4, 4.1, 4.2**
 * 
 * For any XML stream containing incomplete nodes with partial closing tags at chunk boundaries,
 * the detectIncompleteNodes method SHALL return NodeXML objects with sanitized content
 * that contains no trailing partial tag characters.
 */

import * as fc from "fast-check";
import { IncrementalXMLParser } from "../incrementalXMLParser";

describe("IncrementalXMLParser - detectIncompleteNodes Content Sanitization Property Tests", () => {
	/**
	 * **Feature: xml-tag-leaking-fix, Property 4: detectIncompleteNodes Content Sanitization**
	 * **Validates: Requirements 3.4, 4.1, 4.2**
	 */
	describe("Property 4: detectIncompleteNodes Content Sanitization", () => {
		// Generator for valid node IDs
		const nodeId = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,10}$/);
		
		// Generator for valid node types
		const nodeType = fc.constantFrom("concept", "question", "answer", "default", "note");
		
		// Generator for row/col values
		const rowCol = fc.integer({ min: 0, max: 10 });
		
		// Generator for base content (text without partial tags)
		const baseContent = fc.string({ minLength: 1, maxLength: 50 })
			.filter(s => !/<\/?[a-zA-Z]*$/.test(s) && !s.includes("<") && !s.includes(">"));
		
		// Generator for partial tag suffixes that simulate chunk boundary issues
		const partialTagSuffix = fc.oneof(
			fc.constant("<"),
			fc.constant("</"),
			fc.stringMatching(/^[a-zA-Z]{1,6}$/).map((letters: string) => `</${letters}`),
			fc.stringMatching(/^[a-zA-Z]{1,6}$/).map((letters: string) => `<${letters}`)
		);

		// Regex pattern for detecting trailing partial tags
		const trailingPartialTagPattern = /<\/?[a-zA-Z]*$/;

		it("should return NodeXML.content without trailing partial tag characters", () => {
			fc.assert(
				fc.property(
					nodeId,
					nodeType,
					rowCol,
					rowCol,
					baseContent,
					partialTagSuffix,
					(id, type, row, col, content, suffix) => {
						const parser = new IncrementalXMLParser();
						
						// Construct an incomplete node XML with content ending in a partial tag
						// This simulates a chunk boundary falling in the middle of a closing tag
						const contentWithPartialTag = content + suffix;
						const incompleteXml = `<node id="${id}" type="${type}" row="${row}" col="${col}">${contentWithPartialTag}`;
						
						parser.append(incompleteXml);
						
						const incompleteNodes = parser.detectIncompleteNodes();
						
						// Should detect exactly one incomplete node
						if (incompleteNodes.length !== 1) {
							return false;
						}
						
						const node = incompleteNodes[0];
						
						// The content should NOT contain trailing partial tag characters
						const hasTrailingPartialTag = trailingPartialTagPattern.test(node.content);
						
						return !hasTrailingPartialTag;
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should preserve content before the partial tag in detectIncompleteNodes", () => {
			fc.assert(
				fc.property(
					nodeId,
					nodeType,
					rowCol,
					rowCol,
					baseContent,
					partialTagSuffix,
					(id, type, row, col, content, suffix) => {
						const parser = new IncrementalXMLParser();
						
						const contentWithPartialTag = content + suffix;
						const incompleteXml = `<node id="${id}" type="${type}" row="${row}" col="${col}">${contentWithPartialTag}`;
						
						parser.append(incompleteXml);
						
						const incompleteNodes = parser.detectIncompleteNodes();
						
						if (incompleteNodes.length !== 1) {
							return false;
						}
						
						const node = incompleteNodes[0];
						
						// The sanitized content should be the base content (trimmed)
						// or start with the base content
						const trimmedContent = content.trim();
						return node.content === trimmedContent || 
							   trimmedContent.startsWith(node.content) ||
							   node.content.startsWith(trimmedContent);
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should handle multiple incomplete nodes with partial tags", () => {
			fc.assert(
				fc.property(
					fc.array(
						fc.tuple(nodeId, nodeType, rowCol, rowCol, baseContent, partialTagSuffix),
						{ minLength: 1, maxLength: 3 }
					),
					(nodeSpecs) => {
						const parser = new IncrementalXMLParser();
						
						// Build XML with multiple incomplete nodes
						let xml = "";
						const usedIds = new Set<string>();
						
						for (const [id, type, row, col, content, suffix] of nodeSpecs) {
							// Ensure unique IDs
							let uniqueId = id;
							let counter = 0;
							while (usedIds.has(uniqueId)) {
								uniqueId = `${id}${counter++}`;
							}
							usedIds.add(uniqueId);
							
							const contentWithPartialTag = content + suffix;
							xml += `<node id="${uniqueId}" type="${type}" row="${row}" col="${col}">${contentWithPartialTag}`;
						}
						
						parser.append(xml);
						
						const incompleteNodes = parser.detectIncompleteNodes();
						
						// All returned nodes should have sanitized content
						for (const node of incompleteNodes) {
							if (trailingPartialTagPattern.test(node.content)) {
								return false;
							}
						}
						
						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		it("should handle nodes inside groups with partial tags", () => {
			fc.assert(
				fc.property(
					nodeId,
					nodeId,
					nodeType,
					rowCol,
					rowCol,
					baseContent,
					partialTagSuffix,
					(groupId, nodeId, type, row, col, content, suffix) => {
						const parser = new IncrementalXMLParser();
						
						// Ensure different IDs for group and node
						const actualNodeId = groupId === nodeId ? `${nodeId}_node` : nodeId;
						
						const contentWithPartialTag = content + suffix;
						const incompleteXml = `<group id="${groupId}" title="Test Group" row="0" col="0"><node id="${actualNodeId}" type="${type}" row="${row}" col="${col}">${contentWithPartialTag}`;
						
						parser.append(incompleteXml);
						
						const incompleteNodes = parser.detectIncompleteNodes();
						
						// Should detect the incomplete node
						if (incompleteNodes.length !== 1) {
							return false;
						}
						
						const node = incompleteNodes[0];
						
						// The content should NOT contain trailing partial tag characters
						const hasTrailingPartialTag = trailingPartialTagPattern.test(node.content);
						
						// Should also have the correct groupId
						const hasCorrectGroupId = node.groupId === groupId;
						
						return !hasTrailingPartialTag && hasCorrectGroupId;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
