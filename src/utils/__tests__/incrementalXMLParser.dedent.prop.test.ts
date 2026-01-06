/**
 * Property-Based Tests for IncrementalXMLParser.dedentContent
 * 
 * **Feature: markdown-indentation-fix**
 * Tests the dedentation of content to prevent Markdown code block rendering issues
 */

import * as fc from "fast-check";
import { IncrementalXMLParser } from "../incrementalXMLParser";

describe("IncrementalXMLParser - dedentContent Property Tests", () => {
	let parser: IncrementalXMLParser;

	beforeEach(() => {
		parser = new IncrementalXMLParser();
	});

	/**
	 * **Feature: markdown-indentation-fix, Property 1: No Code-Block-Triggering Indentation**
	 * **Validates: Requirements 1.2, 2.1, 2.2, 2.3**
	 * 
	 * For any multi-line content string where all lines have 4+ leading spaces,
	 * the dedentContent function SHALL return content where no line starts with 4+ spaces.
	 */
	describe("Property 1: No Code-Block-Triggering Indentation", () => {
		// Generator for multi-line content with uniform indentation (4+ spaces)
		const indentedMultiLineContent = fc.tuple(
			fc.integer({ min: 4, max: 12 }), // indent level (4+ spaces)
			fc.array(
				fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
				{ minLength: 2, maxLength: 10 }
			)
		).map(([indent, lines]) => {
			const indentStr = ' '.repeat(indent);
			return lines.map(line => indentStr + line.trim()).join('\n');
		});

		test("should ensure no line starts with 4+ spaces after dedent", () => {
			fc.assert(
				fc.property(indentedMultiLineContent, (content) => {
					const dedented = parser.dedentContent(content);
					const lines = dedented.split('\n');
					
					// Check that no non-empty line starts with 4+ spaces
					for (const line of lines) {
						if (line.trim().length > 0) {
							const leadingSpaces = line.match(/^[ \t]*/)?.[0].length ?? 0;
							if (leadingSpaces >= 4) {
								return false;
							}
						}
					}
					return true;
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * **Feature: markdown-indentation-fix, Property 2: Relative Indentation Preservation**
	 * **Validates: Requirements 1.3, 2.4**
	 * 
	 * For any multi-line content string with varying indentation levels,
	 * the dedentContent function SHALL preserve the relative indentation differences between lines.
	 * If line A has N more spaces than line B in the input, line A SHALL have N more spaces than line B in the output.
	 */
	describe("Property 2: Relative Indentation Preservation", () => {
		// Generator for multi-line content with varying indentation
		const varyingIndentContent = fc.tuple(
			fc.integer({ min: 4, max: 8 }), // base indent
			fc.array(
				fc.tuple(
					fc.integer({ min: 0, max: 4 }), // additional indent (0-4 extra spaces)
					fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
				),
				{ minLength: 2, maxLength: 8 }
			)
		).map(([baseIndent, lineData]) => {
			return lineData.map(([extraIndent, text]) => {
				const totalIndent = baseIndent + extraIndent;
				return ' '.repeat(totalIndent) + text.trim();
			}).join('\n');
		});

		// Helper to count leading whitespace
		const countLeadingWhitespace = (line: string): number => {
			const match = line.match(/^[ \t]*/);
			return match ? match[0].length : 0;
		};

		test("should preserve relative indentation differences between lines", () => {
			fc.assert(
				fc.property(varyingIndentContent, (content) => {
					const inputLines = content.split('\n');
					const dedented = parser.dedentContent(content);
					const outputLines = dedented.split('\n');
					
					// For each pair of non-empty lines, check that relative indent is preserved
					for (let i = 0; i < inputLines.length; i++) {
						for (let j = i + 1; j < inputLines.length; j++) {
							const inputLineA = inputLines[i];
							const inputLineB = inputLines[j];
							const outputLineA = outputLines[i];
							const outputLineB = outputLines[j];
							
							// Skip empty lines
							if (inputLineA.trim().length === 0 || inputLineB.trim().length === 0) {
								continue;
							}
							
							const inputDiff = countLeadingWhitespace(inputLineA) - countLeadingWhitespace(inputLineB);
							const outputDiff = countLeadingWhitespace(outputLineA) - countLeadingWhitespace(outputLineB);
							
							if (inputDiff !== outputDiff) {
								return false;
							}
						}
					}
					return true;
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * **Feature: markdown-indentation-fix, Property 3: Empty Line Preservation**
	 * **Validates: Requirements 1.4**
	 * 
	 * For any content string containing empty lines (lines with only whitespace or no characters),
	 * the dedentContent function SHALL preserve the same number of empty lines in the same positions in the output.
	 */
	describe("Property 3: Empty Line Preservation", () => {
		// Generator for content with interspersed empty lines
		const contentWithEmptyLines = fc.tuple(
			fc.integer({ min: 4, max: 8 }), // base indent
			fc.array(
				fc.oneof(
					// Non-empty line
					fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0).map(s => ({ type: 'content' as const, text: s })),
					// Empty line (truly empty)
					fc.constant({ type: 'empty' as const, text: '' }),
					// Whitespace-only line
					fc.integer({ min: 1, max: 5 }).map(n => ({ type: 'whitespace' as const, text: ' '.repeat(n) }))
				),
				{ minLength: 3, maxLength: 10 }
			)
		).filter(([_, lines]) => {
			// Ensure at least one content line and one empty/whitespace line
			const hasContent = lines.some(l => l.type === 'content');
			const hasEmpty = lines.some(l => l.type === 'empty' || l.type === 'whitespace');
			return hasContent && hasEmpty;
		}).map(([baseIndent, lines]) => {
			return lines.map(line => {
				if (line.type === 'content') {
					return ' '.repeat(baseIndent) + line.text.trim();
				}
				return line.text; // empty or whitespace-only
			}).join('\n');
		});

		test("should preserve the same number of empty/whitespace lines", () => {
			fc.assert(
				fc.property(contentWithEmptyLines, (content) => {
					const inputLines = content.split('\n');
					const dedented = parser.dedentContent(content);
					const outputLines = dedented.split('\n');
					
					// Count empty/whitespace lines in input and output
					const inputEmptyCount = inputLines.filter(l => l.trim().length === 0).length;
					const outputEmptyCount = outputLines.filter(l => l.trim().length === 0).length;
					
					// Same number of lines overall
					if (inputLines.length !== outputLines.length) {
						return false;
					}
					
					// Same number of empty lines
					if (inputEmptyCount !== outputEmptyCount) {
						return false;
					}
					
					// Empty lines should be in the same positions
					for (let i = 0; i < inputLines.length; i++) {
						const inputIsEmpty = inputLines[i].trim().length === 0;
						const outputIsEmpty = outputLines[i].trim().length === 0;
						if (inputIsEmpty !== outputIsEmpty) {
							return false;
						}
					}
					
					return true;
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * **Feature: markdown-indentation-fix, Property 4: Idempotence**
	 * **Validates: Requirements 1.5, 3.4**
	 * 
	 * For any content string, applying dedentContent twice SHALL produce
	 * the same result as applying it once: dedentContent(dedentContent(x)) === dedentContent(x).
	 */
	describe("Property 4: Idempotence", () => {
		test("should be idempotent: dedentContent(dedentContent(x)) === dedentContent(x)", () => {
			fc.assert(
				fc.property(fc.string({ minLength: 0, maxLength: 200 }), (content) => {
					const once = parser.dedentContent(content);
					const twice = parser.dedentContent(once);
					return once === twice;
				}),
				{ numRuns: 100 }
			);
		});

		// Also test with structured multi-line content
		test("should be idempotent for multi-line indented content", () => {
			const multiLineContent = fc.tuple(
				fc.integer({ min: 0, max: 10 }), // base indent
				fc.array(
					fc.tuple(
						fc.integer({ min: 0, max: 5 }), // extra indent
						fc.string({ minLength: 0, maxLength: 30 })
					),
					{ minLength: 1, maxLength: 10 }
				)
			).map(([baseIndent, lines]) => {
				return lines.map(([extra, text]) => ' '.repeat(baseIndent + extra) + text).join('\n');
			});

			fc.assert(
				fc.property(multiLineContent, (content) => {
					const once = parser.dedentContent(content);
					const twice = parser.dedentContent(once);
					return once === twice;
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * **Feature: markdown-indentation-fix, Property 5: Tab Handling**
	 * **Validates: Requirements 4.4**
	 * 
	 * For any content string containing tab characters as leading whitespace,
	 * the dedentContent function SHALL treat tabs equivalently to spaces for
	 * the purpose of calculating minimum indentation.
	 */
	describe("Property 5: Tab Handling", () => {
		// Generator for content with tab indentation
		const tabIndentedContent = fc.tuple(
			fc.integer({ min: 1, max: 4 }), // number of tabs for base indent
			fc.array(
				fc.tuple(
					fc.integer({ min: 0, max: 2 }), // extra tabs
					fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
				),
				{ minLength: 2, maxLength: 8 }
			)
		).map(([baseTabs, lines]) => {
			return lines.map(([extraTabs, text]) => {
				const totalTabs = baseTabs + extraTabs;
				return '\t'.repeat(totalTabs) + text.trim();
			}).join('\n');
		});

		test("should treat tabs as whitespace for dedent calculation", () => {
			fc.assert(
				fc.property(tabIndentedContent, (content) => {
					const dedented = parser.dedentContent(content);
					const lines = dedented.split('\n');
					
					// At least one non-empty line should have no leading whitespace
					// (the line with minimum indentation)
					const hasLineWithNoLeadingWhitespace = lines.some(line => {
						if (line.trim().length === 0) return false;
						return line.length > 0 && line[0] !== ' ' && line[0] !== '\t';
					});
					
					return hasLineWithNoLeadingWhitespace;
				}),
				{ numRuns: 100 }
			);
		});

		// Generator for mixed tabs and spaces
		const mixedWhitespaceContent = fc.tuple(
			fc.integer({ min: 2, max: 6 }), // base indent (in characters)
			fc.array(
				fc.tuple(
					fc.integer({ min: 0, max: 3 }), // extra indent
					fc.boolean(), // use tabs (true) or spaces (false) for base
					fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
				),
				{ minLength: 2, maxLength: 6 }
			)
		).map(([baseIndent, lines]) => {
			return lines.map(([extraIndent, useTabs, text]) => {
				const totalIndent = baseIndent + extraIndent;
				const whitespace = useTabs ? '\t'.repeat(totalIndent) : ' '.repeat(totalIndent);
				return whitespace + text.trim();
			}).join('\n');
		});

		test("should handle mixed tabs and spaces", () => {
			fc.assert(
				fc.property(mixedWhitespaceContent, (content) => {
					const dedented = parser.dedentContent(content);
					
					// Should not throw and should return a string
					if (typeof dedented !== 'string') {
						return false;
					}
					
					// The result should have fewer or equal leading whitespace characters
					// on the line with minimum indentation
					const inputLines = content.split('\n').filter(l => l.trim().length > 0);
					const outputLines = dedented.split('\n').filter(l => l.trim().length > 0);
					
					if (inputLines.length !== outputLines.length) {
						return false;
					}
					
					// At least one line should have reduced or zero leading whitespace
					const countLeading = (line: string) => {
						let count = 0;
						for (const char of line) {
							if (char === ' ' || char === '\t') count++;
							else break;
						}
						return count;
					};
					
					const minInputIndent = Math.min(...inputLines.map(countLeading));
					const minOutputIndent = Math.min(...outputLines.map(countLeading));
					
					// Output min indent should be 0 (fully dedented) or less than input
					return minOutputIndent === 0 || minOutputIndent < minInputIndent;
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * **Feature: markdown-indentation-fix, Property 6: Never Throws**
	 * **Validates: Requirements 4.5**
	 * 
	 * For any input string (including malformed, extremely long, or containing special characters),
	 * the dedentContent function SHALL never throw an exception and SHALL always return a string.
	 */
	describe("Property 6: Never Throws", () => {
		test("should never throw for arbitrary string input", () => {
			fc.assert(
				fc.property(fc.string({ minLength: 0, maxLength: 500 }), (content) => {
					try {
						const result = parser.dedentContent(content);
						return typeof result === 'string';
					} catch (e) {
						return false; // Should never reach here
					}
				}),
				{ numRuns: 100 }
			);
		});

		test("should never throw for strings with special characters", () => {
			// Generator for strings with special/unicode characters
			const specialCharContent = fc.tuple(
				fc.integer({ min: 0, max: 8 }), // leading spaces
				fc.oneof(
					fc.string({ minLength: 0, maxLength: 50 }),
					fc.constant('\0\x00\x01\x02'), // null and control characters
					fc.constant('🎉🚀💻'), // emojis
					fc.constant('中文日本語한국어'), // CJK characters
					fc.constant('\r\n\t\v\f'), // various whitespace
					fc.constant('\\n\\t\\r'), // escaped sequences as literals
					fc.constant('<>&"\''), // XML/HTML special chars
					fc.constant('\uD800\uDC00'), // surrogate pairs
					fc.constant('\uFFFD\uFFFE\uFFFF'), // special unicode
				)
			).map(([spaces, text]) => ' '.repeat(spaces) + text);

			fc.assert(
				fc.property(
					fc.array(specialCharContent, { minLength: 1, maxLength: 10 }),
					(lines) => {
						const content = lines.join('\n');
						try {
							const result = parser.dedentContent(content);
							return typeof result === 'string';
						} catch (e) {
							return false;
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		test("should never throw for edge case inputs", () => {
			const edgeCases = [
				'', // empty string
				' ', // single space
				'\t', // single tab
				'\n', // single newline
				'\n\n\n', // multiple newlines
				'   \n   \n   ', // only whitespace
				'\t\t\t\n\t\t\t', // only tabs
				'a', // single character
				'    a', // single indented character
				'\t\ta', // tab-indented single character
				'no indent\n    indented\nno indent again', // mixed
				'    '.repeat(1000), // very long whitespace
				'a'.repeat(10000), // very long content
				'\u0000\u0001\u0002', // control characters
				'\uFFFD\uFFFE\uFFFF', // special unicode
			];

			for (const input of edgeCases) {
				try {
					const result = parser.dedentContent(input);
					if (typeof result !== 'string') {
						throw new Error(`Expected string, got ${typeof result}`);
					}
				} catch (e) {
					// This should never happen
					throw new Error(`dedentContent threw for input: ${JSON.stringify(input)}`);
				}
			}
		});
	});
});