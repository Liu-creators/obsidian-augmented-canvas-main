import { IncrementalXMLParser } from "../incrementalXMLParser";

describe("IncrementalXMLParser - sanitizeContent Edge Cases", () => {
	let parser: IncrementalXMLParser;

	beforeEach(() => {
		parser = new IncrementalXMLParser();
	});

	// _Requirements: 3.1, 3.2, 3.3, 5.1, 5.2_

	it("should return empty string unchanged", () => {
		expect(parser.sanitizeContent("")).toBe("");
	});

	it("should preserve content with '< ' (space after less-than)", () => {
		expect(parser.sanitizeContent("a < b")).toBe("a < b");
		expect(parser.sanitizeContent("x < y < z")).toBe("x < y < z");
		expect(parser.sanitizeContent("if (a < b)")).toBe("if (a < b)");
	});

	it("should preserve content with '<5' (digit after less-than)", () => {
		expect(parser.sanitizeContent("x<5")).toBe("x<5");
		expect(parser.sanitizeContent("value<10")).toBe("value<10");
		expect(parser.sanitizeContent("a<1 and b<2")).toBe("a<1 and b<2");
	});

	it("should handle Unicode content with partial tags", () => {
		expect(parser.sanitizeContent("中文</")).toBe("中文");
		expect(parser.sanitizeContent("日本語<")).toBe("日本語");
		expect(parser.sanitizeContent("한국어</node")).toBe("한국어");
		expect(parser.sanitizeContent("Ελληνικά</gr")).toBe("Ελληνικά");
		expect(parser.sanitizeContent("العربية<tag")).toBe("العربية");
	});

	it("should preserve Unicode content without partial tags", () => {
		expect(parser.sanitizeContent("中文内容")).toBe("中文内容");
		expect(parser.sanitizeContent("日本語テキスト")).toBe("日本語テキスト");
		expect(parser.sanitizeContent("한국어 텍스트")).toBe("한국어 텍스트");
	});
});

describe("IncrementalXMLParser - Chunk Boundary Scenarios", () => {
	let parser: IncrementalXMLParser;

	beforeEach(() => {
		parser = new IncrementalXMLParser();
	});

	// _Requirements: 3.1, 3.2, 3.3_

	it("should handle chunk ending with '</' followed by chunk starting with 'node>'", () => {
		// Simulate streaming: first chunk ends with partial closing tag
		parser.append('<node id="n1" type="concept" row="0" col="0">');
		parser.append("Content text</");
		
		let incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(1);
		expect(incomplete[0].content).toBe("Content text");
		expect(incomplete[0].content).not.toContain("</");

		// Second chunk completes the closing tag
		parser.append("node>");
		const complete = parser.detectCompleteNodes();
		expect(complete.length).toBe(1);
		expect(complete[0].content).toBe("Content text");
	});

	it("should handle chunk ending with '<' followed by chunk starting with '/node>'", () => {
		parser.append('<node id="n1" type="concept" row="0" col="0">');
		parser.append("Some content<");
		
		let incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(1);
		expect(incomplete[0].content).toBe("Some content");
		expect(incomplete[0].content).not.toContain("<");

		parser.append("/node>");
		const complete = parser.detectCompleteNodes();
		expect(complete.length).toBe(1);
		expect(complete[0].content).toBe("Some content");
	});

	it("should handle chunk ending with '</no' followed by chunk starting with 'de>'", () => {
		parser.append('<node id="n1" type="concept" row="0" col="0">');
		parser.append("成本控制：优化Token使用。</no");
		
		let incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(1);
		expect(incomplete[0].content).toBe("成本控制：优化Token使用。");
		expect(incomplete[0].content).not.toContain("</no");

		parser.append("de>");
		const complete = parser.detectCompleteNodes();
		expect(complete.length).toBe(1);
		expect(complete[0].content).toBe("成本控制：优化Token使用。");
	});

	it("should handle multiple chunks with progressive partial tag buildup", () => {
		parser.append('<node id="n1" type="concept" row="0" col="0">');
		parser.append("Text content");
		
		let incomplete = parser.detectIncompleteNodes();
		expect(incomplete[0].content).toBe("Text content");

		parser.append("<");
		incomplete = parser.detectIncompleteNodes();
		expect(incomplete[0].content).toBe("Text content");

		parser.append("/");
		incomplete = parser.detectIncompleteNodes();
		expect(incomplete[0].content).toBe("Text content");

		parser.append("n");
		incomplete = parser.detectIncompleteNodes();
		expect(incomplete[0].content).toBe("Text content");

		parser.append("ode>");
		const complete = parser.detectCompleteNodes();
		expect(complete.length).toBe(1);
		expect(complete[0].content).toBe("Text content");
	});
});

describe("IncrementalXMLParser - Partial Nodes", () => {
	let parser: IncrementalXMLParser;

	beforeEach(() => {
		parser = new IncrementalXMLParser();
	});

	it("should detect incomplete nodes as they are being streamed", () => {
		parser.append('<node id="n1" type="concept" title="Test Node" row="0" col="1">');
		parser.append("This is some ");
		
		let incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(1);
		expect(incomplete[0].id).toBe("n1");
		expect(incomplete[0].content).toBe("This is some");

		parser.append("content that is still being streamed");
		incomplete = parser.detectIncompleteNodes();
		expect(incomplete[0].content).toBe("This is some content that is still being streamed");
	});

	it("should detect groupId for nodes inside an unclosed group", () => {
		parser.append('<group id="g1" title="Test Group" row="0" col="1">');
		parser.append('  <node id="n1" type="concept" row="0" col="0">');
		parser.append("Node inside group");
		
		let incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(1);
		expect(incomplete[0].id).toBe("n1");
		expect(incomplete[0].groupId).toBe("g1");
		expect(incomplete[0].content).toBe("Node inside group");
	});

	it("should detect incomplete groups", () => {
		parser.append('<group id="g1" title="Streaming Group" row="0" col="1">');
		parser.append('  <node id="n1"');
		
		let incompleteGroups = parser.detectIncompleteGroups();
		expect(incompleteGroups.length).toBe(1);
		expect(incompleteGroups[0].id).toBe("g1");
		expect(incompleteGroups[0].title).toBe("Streaming Group");
	});

	it("should not return incomplete nodes if they are already completed", () => {
		parser.append('<node id="n1" type="concept" row="0" col="1">Complete node</node>');
		
		// detectCompleteNodes marks it as processed
		const complete = parser.detectCompleteNodes();
		expect(complete.length).toBe(1);
		
		const incomplete = parser.detectIncompleteNodes();
		expect(incomplete.length).toBe(0);
	});
});
