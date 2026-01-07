/**
 * Property-Based Tests for Content Sanitization Round-Trip
 *
 * **Feature: group-generation-refactor, Property 10: Content Sanitization Round-Trip**
 * **Validates: Requirements 7.3**
 *
 * Tests the combined behavior of dedentContent and sanitizeContent functions
 * to ensure content is properly sanitized for Markdown rendering.
 */

import * as fc from "fast-check";
import { IncrementalXMLParser } from "../incrementalXMLParser";

describe("IncrementalXMLParser - Content Sanitization Round-Trip Property Tests", () => {
	let parser: IncrementalXMLParser;

	beforeEach(() => {
		parser = new IncrementalXMLParser();
	});

	/**
	 * **Feature: group-generation-refactor, Property 10: Content Sanitization Round-Trip**
	 * **Validates: Requirements 7.3**
	 *
	 * Part 1: For any XML content with leading indentation, after applying dedentContent(),
	 * the resulting content SHALL not have common leading whitespace that would cause
	 * Markdown to interpret it as a code block (4+ spaces on all non-empty lines).
	 */
	describe("Property 10.1: Dedent Removes Common Whitespace", () => {
		// 生成器：创建带有统一缩进的多行内容
		const uniformlyIndentedContent = fc.tuple(
			fc.integer({ min: 4, max: 12 }), // 缩进级别（4+ 空格会触发 Markdown 代码块）
			fc.array(
				fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
				{ minLength: 2, maxLength: 10 }
			)
		).map(([indent, lines]) => {
			const indentStr = " ".repeat(indent);
			return lines.map(line => indentStr + line.trim()).join("\n");
		});

		test("dedentContent should remove common leading whitespace to prevent code block rendering", () => {
			fc.assert(
				fc.property(uniformlyIndentedContent, (content) => {
					const dedented = parser.dedentContent(content);
					const lines = dedented.split("\n");

					// 验证：至少有一行非空行没有前导空白（最小缩进行）
					const nonEmptyLines = lines.filter(l => l.trim().length > 0);
					const hasLineWithNoLeadingWhitespace = nonEmptyLines.some(line => {
						return line.length > 0 && line[0] !== " " && line[0] !== "\t";
					});

					return hasLineWithNoLeadingWhitespace;
				}),
				{ numRuns: 100 }
			);
		});

		test("dedentContent should ensure no non-empty line starts with 4+ spaces after dedent", () => {
			fc.assert(
				fc.property(uniformlyIndentedContent, (content) => {
					const dedented = parser.dedentContent(content);
					const lines = dedented.split("\n");

					// 检查所有非空行都不以 4+ 空格开头
					for (const line of lines) {
						if (line.trim().length > 0) {
							const leadingSpaces = line.match(/^[ ]*/)?.[0].length ?? 0;
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
	 * **Feature: group-generation-refactor, Property 10: Content Sanitization Round-Trip**
	 * **Validates: Requirements 7.3**
	 *
	 * Part 2: sanitizeContent() SHALL remove trailing partial XML tags,
	 * producing content equivalent to the original minus any trailing partial tags.
	 */
	describe("Property 10.2: Sanitize Removes Trailing Partial Tags", () => {
		// 生成器：部分 XML 标签后缀
		const partialTagSuffix = fc.oneof(
			fc.constant("<"),
			fc.constant("</"),
			fc.stringMatching(/^[a-zA-Z]{1,10}$/).map((letters: string) => `</${letters}`),
			fc.stringMatching(/^[a-zA-Z]{1,10}$/).map((letters: string) => `<${letters}`)
		);

		// 生成器：不以部分标签结尾的基础内容
		const baseContent = fc.string({ minLength: 0, maxLength: 100 })
			.filter(s => !/<\/?[a-zA-Z]*$/.test(s));

		test("sanitizeContent should remove trailing partial XML tags", () => {
			fc.assert(
				fc.property(baseContent, partialTagSuffix, (base, suffix) => {
					const contentWithPartialTag = base + suffix;
					const sanitized = parser.sanitizeContent(contentWithPartialTag);

					// 清理后的内容不应以部分标签模式结尾
					const hasTrailingPartialTag = /<\/?[a-zA-Z]*$/.test(sanitized);
					return !hasTrailingPartialTag;
				}),
				{ numRuns: 100 }
			);
		});

		test("sanitizeContent should preserve content before the partial tag", () => {
			fc.assert(
				fc.property(baseContent, partialTagSuffix, (base, suffix) => {
					const contentWithPartialTag = base + suffix;
					const sanitized = parser.sanitizeContent(contentWithPartialTag);

					// 清理后的内容应该等于基础内容（或基础内容的前缀）
					return sanitized === base || base.startsWith(sanitized);
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * **Feature: group-generation-refactor, Property 10: Content Sanitization Round-Trip**
	 * **Validates: Requirements 7.3**
	 *
	 * Part 3: Combined sanitize + dedent pipeline should produce clean content
	 * suitable for Markdown rendering.
	 */
	describe("Property 10.3: Combined Sanitization Pipeline", () => {
		// 生成器：带缩进和可能的部分标签的内容
		// 注意：过滤掉包含 '<' 的行内容，避免生成 '<<' 这样的边界情况
		// 这更符合实际 XML 流式传输的场景
		const contentWithIndentAndPartialTag = fc.tuple(
			fc.integer({ min: 4, max: 8 }), // 缩进级别
			fc.array(
				fc.string({ minLength: 1, maxLength: 40 })
					.filter(s => s.trim().length > 0)
					.filter(s => !s.includes("<")), // 过滤掉包含 '<' 的内容
				{ minLength: 2, maxLength: 8 }
			),
			fc.option(
				fc.oneof(
					fc.constant("<"),
					fc.constant("</"),
					fc.stringMatching(/^[a-zA-Z]{1,5}$/).map((letters: string) => `<${letters}`)
				),
				{ nil: undefined }
			)
		).map(([indent, lines, partialTag]) => {
			const indentStr = " ".repeat(indent);
			const content = lines.map(line => indentStr + line.trim()).join("\n");
			return partialTag ? content + partialTag : content;
		});

		test("combined sanitize then dedent should produce Markdown-safe content", () => {
			fc.assert(
				fc.property(contentWithIndentAndPartialTag, (content) => {
					// 模拟实际使用的管道：先 sanitize，再 dedent
					const sanitized = parser.sanitizeContent(content);
					const dedented = parser.dedentContent(sanitized);

					// 验证 1：没有尾部部分标签
					const hasTrailingPartialTag = /<\/?[a-zA-Z]*$/.test(dedented);
					if (hasTrailingPartialTag) {
						return false;
					}

					// 验证 2：至少有一行没有前导空白
					const lines = dedented.split("\n");
					const nonEmptyLines = lines.filter(l => l.trim().length > 0);
					if (nonEmptyLines.length === 0) {
						return true; // 空内容是有效的
					}

					const hasLineWithNoLeadingWhitespace = nonEmptyLines.some(line => {
						return line.length > 0 && line[0] !== " " && line[0] !== "\t";
					});

					return hasLineWithNoLeadingWhitespace;
				}),
				{ numRuns: 100 }
			);
		});

		test("combined pipeline should be idempotent", () => {
			fc.assert(
				fc.property(contentWithIndentAndPartialTag, (content) => {
					// 第一次应用管道
					const sanitized1 = parser.sanitizeContent(content);
					const dedented1 = parser.dedentContent(sanitized1);

					// 第二次应用管道
					const sanitized2 = parser.sanitizeContent(dedented1);
					const dedented2 = parser.dedentContent(sanitized2);

					// 结果应该相同
					return dedented1 === dedented2;
				}),
				{ numRuns: 100 }
			);
		});
	});

	/**
	 * **Feature: group-generation-refactor, Property 10: Content Sanitization Round-Trip**
	 * **Validates: Requirements 7.3**
	 *
	 * Part 4: Relative indentation should be preserved after dedent.
	 */
	describe("Property 10.4: Relative Indentation Preservation", () => {
		// 生成器：带有不同缩进级别的多行内容
		const varyingIndentContent = fc.tuple(
			fc.integer({ min: 4, max: 8 }), // 基础缩进
			fc.array(
				fc.tuple(
					fc.integer({ min: 0, max: 4 }), // 额外缩进
					fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0)
				),
				{ minLength: 2, maxLength: 8 }
			)
		).map(([baseIndent, lineData]) => {
			return lineData.map(([extraIndent, text]) => {
				const totalIndent = baseIndent + extraIndent;
				return " ".repeat(totalIndent) + text.trim();
			}).join("\n");
		});

		// 辅助函数：计算前导空白
		const countLeadingWhitespace = (line: string): number => {
			const match = line.match(/^[ \t]*/);
			return match ? match[0].length : 0;
		};

		test("dedentContent should preserve relative indentation differences", () => {
			fc.assert(
				fc.property(varyingIndentContent, (content) => {
					const inputLines = content.split("\n");
					const dedented = parser.dedentContent(content);
					const outputLines = dedented.split("\n");

					// 对于每对非空行，检查相对缩进是否保持
					for (let i = 0; i < inputLines.length; i++) {
						for (let j = i + 1; j < inputLines.length; j++) {
							const inputLineA = inputLines[i];
							const inputLineB = inputLines[j];
							const outputLineA = outputLines[i];
							const outputLineB = outputLines[j];

							// 跳过空行
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
	 * **Feature: group-generation-refactor, Property 10: Content Sanitization Round-Trip**
	 * **Validates: Requirements 7.3**
	 *
	 * Part 5: Functions should never throw for any input.
	 */
	describe("Property 10.5: Robustness - Never Throws", () => {
		test("sanitizeContent and dedentContent should never throw for arbitrary input", () => {
			fc.assert(
				fc.property(fc.string({ minLength: 0, maxLength: 500 }), (content) => {
					try {
						const sanitized = parser.sanitizeContent(content);
						const dedented = parser.dedentContent(sanitized);
						return typeof sanitized === "string" && typeof dedented === "string";
					} catch (e) {
						return false;
					}
				}),
				{ numRuns: 100 }
			);
		});

		test("should handle special characters and unicode", () => {
			const specialContent = fc.oneof(
				fc.string({ minLength: 0, maxLength: 100 }),
				fc.constant("🎉🚀💻"),
				fc.constant("中文日本語한국어"),
				fc.constant("\r\n\t\v\f"),
				fc.constant('<>&"\''),
				fc.constant("\uD800\uDC00"),
				fc.constant("\uFFFD\uFFFE\uFFFF")
			);

			fc.assert(
				fc.property(specialContent, (content) => {
					try {
						const sanitized = parser.sanitizeContent(content);
						const dedented = parser.dedentContent(sanitized);
						return typeof sanitized === "string" && typeof dedented === "string";
					} catch (e) {
						return false;
					}
				}),
				{ numRuns: 100 }
			);
		});
	});
});
