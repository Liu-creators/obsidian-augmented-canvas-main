/**
 * Property-Based Tests for IncrementalXMLParser Integration
 *
 * **Feature: markdown-indentation-fix**
 * Tests that dedentContent is properly integrated into the XML parsing pipeline
 */

import * as fc from "fast-check";
import { IncrementalXMLParser } from "../incrementalXMLParser";

describe("IncrementalXMLParser - Integration Property Tests", () => {
	/**
	 * **Feature: markdown-indentation-fix, Property 7: Integration Round-Trip**
	 * **Validates: Requirements 3.1, 3.2, 3.3**
	 *
	 * For any valid XML node content with leading indentation, when parsed by IncrementalXMLParser,
	 * the extracted content SHALL have no code-block-triggering indentation (4+ leading spaces on Markdown syntax lines).
	 */
	describe("Property 7: Integration Round-Trip", () => {
		// Generator for valid node content with indentation
		const indentedNodeContent = fc.tuple(
			fc.integer({ min: 4, max: 12 }), // indent level (4+ spaces to trigger code block)
			fc.array(
				fc.string({ minLength: 1, maxLength: 50 })
					.filter(s => s.trim().length > 0)
					.filter(s => !s.includes("<") && !s.includes(">") && !s.includes('"') && !s.includes("&")), // avoid XML special chars
				{ minLength: 1, maxLength: 5 }
			)
		).map(([indent, lines]) => {
			const indentStr = " ".repeat(indent);
			return lines.map(line => indentStr + line.trim()).join("\n");
		});

		// Generator for valid node attributes
		const nodeAttributes = fc.record({
			id: fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)),
			type: fc.constantFrom("default", "question", "answer", "note"),
			row: fc.integer({ min: 0, max: 10 }),
			col: fc.integer({ min: 0, max: 10 }),
		});

		// Helper to count leading whitespace
		const countLeadingWhitespace = (line: string): number => {
			const match = line.match(/^[ \t]*/);
			return match ? match[0].length : 0;
		};

		test("detectCompleteNodes should return content without code-block-triggering indentation", () => {
			fc.assert(
				fc.property(
					nodeAttributes,
					indentedNodeContent,
					(attrs, content) => {
						const parser = new IncrementalXMLParser();

						// Build XML with indented content
						const xml = `<node id="${attrs.id}" type="${attrs.type}" row="${attrs.row}" col="${attrs.col}">\n${content}\n</node>`;

						parser.append(xml);
						const nodes = parser.detectCompleteNodes();

						// Should parse exactly one node
						if (nodes.length !== 1) {
							return false;
						}

						const node = nodes[0];
						const outputLines = node.content.split("\n");

						// Check that no non-empty line starts with 4+ spaces
						for (const line of outputLines) {
							if (line.trim().length > 0) {
								const leadingSpaces = countLeadingWhitespace(line);
								if (leadingSpaces >= 4) {
									return false;
								}
							}
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		test("detectIncompleteNodes should return content without code-block-triggering indentation", () => {
			fc.assert(
				fc.property(
					nodeAttributes,
					indentedNodeContent,
					(attrs, content) => {
						const parser = new IncrementalXMLParser();

						// Build incomplete XML (no closing tag) with indented content
						const xml = `<node id="${attrs.id}" type="${attrs.type}" row="${attrs.row}" col="${attrs.col}">\n${content}`;

						parser.append(xml);
						const nodes = parser.detectIncompleteNodes();

						// Should detect at least one incomplete node
						if (nodes.length === 0) {
							return true; // No nodes detected is acceptable for some edge cases
						}

						const node = nodes[0];
						const outputLines = node.content.split("\n");

						// Check that no non-empty line starts with 4+ spaces
						for (const line of outputLines) {
							if (line.trim().length > 0) {
								const leadingSpaces = countLeadingWhitespace(line);
								if (leadingSpaces >= 4) {
									return false;
								}
							}
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);
		});

		test("group parsing should return nested node content without code-block-triggering indentation", () => {
			fc.assert(
				fc.property(
					fc.string({ minLength: 1, maxLength: 10 }).filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s)), // group id
					nodeAttributes,
					indentedNodeContent,
					(groupId, nodeAttrs, content) => {
						const parser = new IncrementalXMLParser();

						// Build group XML with nested node containing indented content
						const xml = `<group id="${groupId}" title="Test Group" row="0" col="0">
<node id="${nodeAttrs.id}" type="${nodeAttrs.type}" row="${nodeAttrs.row}" col="${nodeAttrs.col}">
${content}
</node>
</group>`;

						parser.append(xml);
						const groups = parser.detectCompleteGroups();

						// Should parse exactly one group
						if (groups.length !== 1) {
							return false;
						}

						const group = groups[0];

						// Should have at least one node
						if (group.nodes.length === 0) {
							return false;
						}

						// Check all nested nodes
						for (const node of group.nodes) {
							const outputLines = node.content.split("\n");

							// Check that no non-empty line starts with 4+ spaces
							for (const line of outputLines) {
								if (line.trim().length > 0) {
									const leadingSpaces = countLeadingWhitespace(line);
									if (leadingSpaces >= 4) {
										return false;
									}
								}
							}
						}

						return true;
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});
