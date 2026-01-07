/**
 * Tests for groupGenerator utility functions
 */

import { parseNodesFromMarkdown, calculateSmartLayout } from "../groupGenerator";

describe("parseNodesFromMarkdown", () => {
	it("should parse nodes with ### headers", () => {
		const markdown = `### Node 1
Content for node 1

### Node 2
Content for node 2

### Node 3
Content for node 3`;

		const result = parseNodesFromMarkdown(markdown);
		expect(result.nodes.length).toBe(3);
		expect(result.nodes[0].title).toBe("Node 1");
		expect(result.nodes[0].content).toBe("Content for node 1");
	});

	it("should parse nodes with --- separators", () => {
		const markdown = `First node content

---

Second node content

---

Third node content`;

		const result = parseNodesFromMarkdown(markdown);
		expect(result.nodes.length).toBe(3);
		expect(result.nodes[0].content).toBe("First node content");
	});

	it("should handle single node without separators", () => {
		const markdown = "This is a single node without any separators.";
		const result = parseNodesFromMarkdown(markdown);
		expect(result.nodes.length).toBe(1);
	});

	it("should handle empty content", () => {
		const result = parseNodesFromMarkdown("");
		expect(result.nodes.length).toBe(0);
	});

	it("should preserve markdown formatting in content", () => {
		const markdown = `### Introduction
This is the introduction with **bold** and *italic* text.

It has multiple paragraphs.

### Key Concepts
- Bullet point 1
- Bullet point 2
- Bullet point 3

### Conclusion
Final thoughts here.`;

		const result = parseNodesFromMarkdown(markdown);
		expect(result.nodes.length).toBe(3);
		expect(result.nodes[0].title).toBe("Introduction");
		expect(result.nodes[0].content).toContain("multiple paragraphs");
	});

	it("should only parse nodes with content", () => {
		const markdown = `### Node 1

### Node 2

### Node 3
Content only in the third node`;

		const result = parseNodesFromMarkdown(markdown);
		expect(result.nodes.length).toBe(1);
	});
});

describe("calculateSmartLayout", () => {
	it("should generate horizontal layout for 2 nodes", () => {
		const contents = ["Short content", "Another short content"];
		const layouts = calculateSmartLayout(contents);

		expect(layouts.length).toBe(2);
		expect(layouts[0].x).toBe(0);
		expect(layouts[1].x).toBe(400); // width (360) + spacing (40)
	});

	it("should generate 2x2 grid for 4 nodes", () => {
		const contents = ["Node 1", "Node 2", "Node 3", "Node 4"];
		const layouts = calculateSmartLayout(contents);

		expect(layouts.length).toBe(4);
		expect(layouts[2].x).toBe(0); // Third node wraps to new row
		expect(layouts[2].y).toBeGreaterThan(layouts[0].y);
	});

	it("should generate 2x3 grid for 6 nodes", () => {
		const contents = ["N1", "N2", "N3", "N4", "N5", "N6"];
		const layouts = calculateSmartLayout(contents);
		expect(layouts.length).toBe(6);
	});

	it("should generate 3 column grid for 8 nodes", () => {
		const contents = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"];
		const layouts = calculateSmartLayout(contents);

		expect(layouts.length).toBe(8);
		expect(layouts[3].x).toBe(0); // Fourth node wraps (3 columns)
	});

	it("should calculate taller height for longer content", () => {
		const contents = [
			"Short",
			"This is a much longer content that should result in a taller node with more text that wraps around multiple lines.",
			"Medium length content here"
		];
		const layouts = calculateSmartLayout(contents);

		expect(layouts.length).toBe(3);
		// All nodes in same row should have same height (row max)
		expect(layouts[0].height).toBe(layouts[1].height);
	});

	it("should respect custom options", () => {
		const contents = ["Node 1", "Node 2"];
		const layouts = calculateSmartLayout(contents, {
			nodeWidth: 500,
			nodeSpacing: 60
		});

		expect(layouts[0].width).toBe(500);
		expect(layouts[1].x).toBe(560); // 500 + 60
	});
});
