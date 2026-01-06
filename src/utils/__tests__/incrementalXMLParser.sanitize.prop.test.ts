/**
 * Property-Based Tests for IncrementalXMLParser.sanitizeContent
 * 
 * **Feature: xml-tag-leaking-fix**
 * Tests the sanitization of trailing partial XML tags from content strings
 */

import * as fc from "fast-check";
import { IncrementalXMLParser } from "../incrementalXMLParser";

describe("IncrementalXMLParser - sanitizeContent Property Tests", () => {
	let parser: IncrementalXMLParser;

	beforeEach(() => {
		parser = new IncrementalXMLParser();
	});

	/**
	 * **Feature: xml-tag-leaking-fix, Property 1: Trailing Partial Tag Removal**
	 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 2.4**
	 * 
	 * For any content string ending with a partial XML tag pattern,
	 * the sanitizeContent function SHALL return the content with the trailing partial tag removed.
	 */
	describe("Property 1: Trailing Partial Tag Removal", () => {
		// Generator for partial tag suffixes
		const partialTagSuffix = fc.oneof(
			fc.constant("<"),
			fc.constant("</"),
			fc.stringMatching(/^[a-zA-Z]{1,10}$/).map((letters: string) => `</${letters}`),
			fc.stringMatching(/^[a-zA-Z]{1,10}$/).map((letters: string) => `<${letters}`)
		);

		// Generator for base content (without trailing partial tags)
		const baseContent = fc.string({ minLength: 0, maxLength: 100 })
			.filter(s => !/<\/?[a-zA-Z]*$/.test(s));

		it("should remove trailing partial tags from content", () => {
			fc.assert(
				fc.property(baseContent, partialTagSuffix, (base, suffix) => {
					const contentWithPartialTag = base + suffix;
					const sanitized = parser.sanitizeContent(contentWithPartialTag);
					
					// The sanitized content should not end with a partial tag pattern
					const hasTrailingPartialTag = /<\/?[a-zA-Z]*$/.test(sanitized);
					return !hasTrailingPartialTag;
				}),
				{ numRuns: 100 }
			);
		});

		it("should preserve content before the partial tag", () => {
			fc.assert(
				fc.property(baseContent, partialTagSuffix, (base, suffix) => {
					const contentWithPartialTag = base + suffix;
					const sanitized = parser.sanitizeContent(contentWithPartialTag);
					
					// The sanitized content should start with the base content
					return sanitized === base || base.startsWith(sanitized);
				}),
				{ numRuns: 100 }
			);
		});
	});


	/**
	 * **Feature: xml-tag-leaking-fix, Property 2: Content Preservation for Non-Tag Characters**
	 * **Validates: Requirements 2.5, 5.1, 5.2**
	 * 
	 * For any content string that does NOT end with a partial XML tag pattern,
	 * the sanitizeContent function SHALL return the content unchanged.
	 */
	describe("Property 2: Content Preservation for Non-Tag Characters", () => {
		// Generator for content that should be preserved (no trailing partial tags)
		const preservedContent = fc.oneof(
			// Regular strings without < at end
			fc.string({ minLength: 0, maxLength: 100 }).filter(s => !/<\/?[a-zA-Z]*$/.test(s)),
			// Strings with < followed by space (e.g., "a < b")
			fc.string({ minLength: 0, maxLength: 50 }).map(s => s + "< "),
			// Strings with < followed by digit (e.g., "x<5")
			fc.tuple(fc.string({ minLength: 0, maxLength: 50 }), fc.integer({ min: 0, max: 9 }))
				.map(([s, d]) => s + "<" + d),
			// Strings with < followed by special chars
			fc.tuple(fc.string({ minLength: 0, maxLength: 50 }), fc.constantFrom("!", "@", "#", "$", "%", "^", "&", "*", "(", ")"))
				.map(([s, c]) => s + "<" + c)
		);

		it("should return content unchanged when no trailing partial tag exists", () => {
			fc.assert(
				fc.property(preservedContent, (content) => {
					const sanitized = parser.sanitizeContent(content);
					return sanitized === content;
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * **Feature: xml-tag-leaking-fix, Property 3: Sanitization Idempotence**
	 * **Validates: Requirements 2.1, 6.2**
	 * 
	 * For any content string, applying sanitizeContent twice SHALL produce
	 * the same result as applying it once.
	 */
	describe("Property 3: Sanitization Idempotence", () => {
		it("should be idempotent: sanitizeContent(sanitizeContent(x)) === sanitizeContent(x)", () => {
			fc.assert(
				fc.property(fc.string({ minLength: 0, maxLength: 200 }), (content) => {
					const once = parser.sanitizeContent(content);
					const twice = parser.sanitizeContent(once);
					return once === twice;
				}),
				{ numRuns: 100 }
			);
		});
	});
});
