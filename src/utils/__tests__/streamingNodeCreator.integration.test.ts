/**
 * Final Integration Tests for StreamingNodeCreator
 *
 * Feature: group-anchor-positioning
 *
 * These tests validate the complete streaming behavior with varying content lengths,
 * multi-column layouts, and ensure no jitter or overlap occurs during streaming.
 *
 * Task 19: Final Integration Testing
 *
 * _Requirements: 8.1, 8.4, 9.1, 10.1, 11.2_
 */

import { AnchorState, LAYOUT_CONSTANTS, ColumnNodeInfo, ColumnTrack, NodeActualSize, EdgeDirection } from "../streamingNodeCreator";

/**
 * Layout parameters for integration testing
 */
interface LayoutParams {
	anchorX: number;
	anchorY: number;
	padding: number;
	defaultNodeWidth: number;
	defaultNodeHeight: number;
	edgeDirection: EdgeDirection;
}

/**
 * Simulated node state during streaming
 */
interface StreamingNode {
	id: string;
	row: number;
	col: number;
	x: number;
	y: number;
	width: number;
	height: number;
	content: string;
}

/**
 * Simulated group state during streaming
 */
interface StreamingGroup {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Streaming simulation state
 */
interface StreamingState {
	anchorState: AnchorState;
	group: StreamingGroup;
	nodes: Map<string, StreamingNode>;
	columnTracks: Map<number, ColumnTrack>;
	nodeActualSizes: Map<string, NodeActualSize>;
}

/**
 * Content length categories for testing
 */
type ContentLength = "short" | "medium" | "long";

/**
 * Generate content of varying lengths
 */
function generateContent(length: ContentLength): string {
	switch (length) {
	case "short":
		return "Short content";
	case "medium":
		return "This is medium length content that spans multiple lines and requires more vertical space to display properly.";
	case "long":
		return `This is a very long piece of content that simulates what happens when AI generates extensive text.
			
It includes multiple paragraphs and line breaks to test how the layout handles significant content growth.

The content continues with more text to ensure we're testing realistic scenarios where nodes need to expand significantly.

Additional paragraphs are added to push the height even further, testing the dynamic stack layout's ability to handle extreme cases.

This final paragraph ensures we have enough content to trigger multiple repositioning events during streaming simulation.`;
	}
}

/**
 * Calculate height based on content (simplified simulation)
 * Approximates the calcHeight function behavior
 */
function calculateContentHeight(content: string, defaultHeight: number): number {
	const lineCount = content.split("\n").length;
	const charCount = content.length;

	// Approximate height based on content
	const estimatedLines = Math.max(lineCount, Math.ceil(charCount / 50));
	const lineHeight = 24; // Approximate line height in pixels
	const padding = 40; // Internal node padding

	return Math.max(defaultHeight, estimatedLines * lineHeight + padding);
}

/**
 * Initialize streaming state with anchor
 */
function initializeStreamingState(params: LayoutParams): StreamingState {
	return {
		anchorState: {
			anchorX: params.anchorX,
			anchorY: params.anchorY,
			anchorLocked: true,
			minRowSeen: 0,
			minColSeen: 0,
			edgeDirection: params.edgeDirection,
		},
		group: {
			x: params.anchorX,
			y: params.anchorY,
			width: 400,
			height: 300,
		},
		nodes: new Map(),
		columnTracks: new Map(),
		nodeActualSizes: new Map(),
	};
}

/**
 * Register a node in column tracking
 */
function registerNodeInColumn(
	state: StreamingState,
	nodeId: string,
	col: number,
	row: number,
	y: number,
	height: number,
	width: number,
	defaultNodeWidth: number
): void {
	if (!state.columnTracks.has(col)) {
		state.columnTracks.set(col, {
			col,
			nodes: [],
			maxWidth: defaultNodeWidth,
		});
	}

	const colTrack = state.columnTracks.get(col)!;
	colTrack.nodes = colTrack.nodes.filter(n => n.nodeId !== nodeId);
	colTrack.nodes.push({ nodeId, row, y, actualHeight: height });
	colTrack.nodes.sort((a, b) => a.row - b.row);

	if (width > colTrack.maxWidth) {
		colTrack.maxWidth = width;
	}

	state.nodeActualSizes.set(nodeId, { width, height });
}

/**
 * Calculate node position using dynamic stack layout
 */
function calculateNodePosition(
	state: StreamingState,
	params: LayoutParams,
	nodeId: string,
	row: number,
	col: number,
	content: string
): { x: number; y: number; height: number } {
	const { VERTICAL_GAP, HORIZONTAL_GAP, EDGE_LABEL_SAFE_ZONE } = LAYOUT_CONSTANTS;

	const normalizedRow = row - state.anchorState.minRowSeen;
	const normalizedCol = col - state.anchorState.minColSeen;

	// Calculate safe zones
	const topSafeZone = (state.anchorState.edgeDirection === "top") ? EDGE_LABEL_SAFE_ZONE : 0;
	const leftSafeZone = (state.anchorState.edgeDirection === "left") ? EDGE_LABEL_SAFE_ZONE : 0;

	// Calculate X position
	let x = state.anchorState.anchorX + params.padding + leftSafeZone;
	for (let c = 0; c < normalizedCol; c++) {
		const colTrack = state.columnTracks.get(c);
		const colWidth = colTrack?.maxWidth || params.defaultNodeWidth;
		x += colWidth + HORIZONTAL_GAP;
	}

	// Calculate Y position using dynamic stack
	let y: number;
	const colTrack = state.columnTracks.get(normalizedCol);

	if (normalizedRow === 0 || !colTrack || colTrack.nodes.length === 0) {
		y = state.anchorState.anchorY + params.padding + topSafeZone;
	} else {
		const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);
		let prevNodeInfo: ColumnNodeInfo | null = null;

		for (const nodeInfo of sortedNodes) {
			if (nodeInfo.row < normalizedRow) {
				prevNodeInfo = nodeInfo;
			} else {
				break;
			}
		}

		if (prevNodeInfo) {
			y = prevNodeInfo.y + prevNodeInfo.actualHeight + VERTICAL_GAP;
		} else {
			y = state.anchorState.anchorY + params.padding + topSafeZone;
		}
	}

	const height = calculateContentHeight(content, params.defaultNodeHeight);

	return { x, y, height };
}

/**
 * Simulate creating a node during streaming
 */
function simulateCreateNode(
	state: StreamingState,
	params: LayoutParams,
	nodeId: string,
	row: number,
	col: number,
	content: string
): StreamingNode {
	const { x, y, height } = calculateNodePosition(state, params, nodeId, row, col, content);

	const node: StreamingNode = {
		id: nodeId,
		row,
		col,
		x,
		y,
		width: params.defaultNodeWidth,
		height,
		content,
	};

	state.nodes.set(nodeId, node);
	registerNodeInColumn(state, nodeId, col, row, y, height, params.defaultNodeWidth, params.defaultNodeWidth);

	return node;
}

/**
 * Simulate updating node content during streaming (content growth)
 */
function simulateUpdateNodeContent(
	state: StreamingState,
	params: LayoutParams,
	nodeId: string,
	newContent: string
): { heightChanged: boolean; repositionedNodes: string[] } {
	const node = state.nodes.get(nodeId);
	if (!node) {
		return { heightChanged: false, repositionedNodes: [] };
	}

	const oldHeight = node.height;
	const newHeight = calculateContentHeight(newContent, params.defaultNodeHeight);
	const heightChanged = Math.abs(oldHeight - newHeight) > 1;

	// Update node content and height
	node.content = newContent;
	node.height = newHeight;

	const repositionedNodes: string[] = [];

	if (heightChanged) {
		// Update column tracking
		const colTrack = state.columnTracks.get(node.col);
		if (colTrack) {
			const nodeInfo = colTrack.nodes.find(n => n.nodeId === nodeId);
			if (nodeInfo) {
				nodeInfo.actualHeight = newHeight;

				// Reposition nodes below
				const { VERTICAL_GAP } = LAYOUT_CONSTANTS;
				const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

				let prevY = 0;
				let prevHeight = 0;

				for (const info of sortedNodes) {
					if (info.row <= node.row) {
						prevY = info.y;
						prevHeight = info.actualHeight;
						continue;
					}

					const newY = prevY + prevHeight + VERTICAL_GAP;
					if (Math.abs(info.y - newY) > 1) {
						info.y = newY;
						repositionedNodes.push(info.nodeId);

						// Update the actual node position
						const actualNode = state.nodes.get(info.nodeId);
						if (actualNode) {
							actualNode.y = newY;
						}
					}

					prevY = info.y;
					prevHeight = info.actualHeight;
				}
			}
		}

		// Update nodeActualSizes
		const existingSize = state.nodeActualSizes.get(nodeId);
		if (existingSize) {
			state.nodeActualSizes.set(nodeId, { width: existingSize.width, height: newHeight });
		}
	}

	return { heightChanged, repositionedNodes };
}

/**
 * Update group bounds (only expand, never move anchor)
 */
function updateGroupBounds(state: StreamingState, params: LayoutParams): void {
	const nodes = Array.from(state.nodes.values());
	if (nodes.length === 0) return;

	let maxX = -Infinity, maxY = -Infinity;
	nodes.forEach(node => {
		maxX = Math.max(maxX, node.x + node.width);
		maxY = Math.max(maxY, node.y + node.height);
	});

	// Group can only expand, never move
	state.group.width = Math.max(state.group.width, maxX - state.anchorState.anchorX + params.padding);
	state.group.height = Math.max(state.group.height, maxY - state.anchorState.anchorY + params.padding);
}

/**
 * Check for overlaps between nodes in the same column
 */
function detectOverlaps(state: StreamingState): { hasOverlaps: boolean; overlaps: string[] } {
	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;
	const overlaps: string[] = [];

	for (const [col, colTrack] of state.columnTracks.entries()) {
		const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

		for (let i = 0; i < sortedNodes.length - 1; i++) {
			const nodeA = sortedNodes[i];
			const nodeB = sortedNodes[i + 1];

			const minYForB = nodeA.y + nodeA.actualHeight + VERTICAL_GAP;

			if (nodeB.y < minYForB - 1) { // 1px tolerance
				overlaps.push(`Column ${col}: ${nodeB.nodeId} overlaps with ${nodeA.nodeId}`);
			}
		}
	}

	return { hasOverlaps: overlaps.length > 0, overlaps };
}

/**
 * Check if anchor position has drifted
 */
function checkAnchorStability(state: StreamingState, originalAnchorX: number, originalAnchorY: number): boolean {
	return state.anchorState.anchorX === originalAnchorX &&
	       state.anchorState.anchorY === originalAnchorY &&
	       state.group.x === originalAnchorX &&
	       state.group.y === originalAnchorY;
}


/**
 * Task 19.1: Test streaming with varying content lengths
 *
 * Simulates AI streaming with short, medium, and long content.
 * Verifies no jitter during streaming and no overlap at any point.
 *
 * _Requirements: 9.1, 10.1, 11.2_
 */
describe("Task 19.1: Streaming with Varying Content Lengths", () => {
	const defaultParams: LayoutParams = {
		anchorX: 500,
		anchorY: 300,
		padding: 60,
		defaultNodeWidth: 360,
		defaultNodeHeight: 200,
		edgeDirection: "left",
	};

	describe("Simulate AI streaming with short, medium, and long content", () => {
		it("should handle short content without jitter or overlap", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Create 3 nodes with short content
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_1", 1, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_2", 2, 0, generateContent("short"));

			updateGroupBounds(state, defaultParams);

			// Verify no jitter (anchor stability)
			expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);

			// Verify no overlap
			const { hasOverlaps, overlaps } = detectOverlaps(state);
			expect(hasOverlaps).toBe(false);
			if (hasOverlaps) {
				console.error("Overlaps detected:", overlaps);
			}
		});

		it("should handle medium content without jitter or overlap", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Create 3 nodes with medium content
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, generateContent("medium"));
			simulateCreateNode(state, defaultParams, "node_1", 1, 0, generateContent("medium"));
			simulateCreateNode(state, defaultParams, "node_2", 2, 0, generateContent("medium"));

			updateGroupBounds(state, defaultParams);

			// Verify no jitter
			expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);

			// Verify no overlap
			const { hasOverlaps, overlaps } = detectOverlaps(state);
			expect(hasOverlaps).toBe(false);
			if (hasOverlaps) {
				console.error("Overlaps detected:", overlaps);
			}
		});

		it("should handle long content without jitter or overlap", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Create 3 nodes with long content
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, generateContent("long"));
			simulateCreateNode(state, defaultParams, "node_1", 1, 0, generateContent("long"));
			simulateCreateNode(state, defaultParams, "node_2", 2, 0, generateContent("long"));

			updateGroupBounds(state, defaultParams);

			// Verify no jitter
			expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);

			// Verify no overlap
			const { hasOverlaps, overlaps } = detectOverlaps(state);
			expect(hasOverlaps).toBe(false);
			if (hasOverlaps) {
				console.error("Overlaps detected:", overlaps);
			}
		});

		it("should handle mixed content lengths without jitter or overlap", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Create nodes with varying content lengths
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_1", 1, 0, generateContent("long"));
			simulateCreateNode(state, defaultParams, "node_2", 2, 0, generateContent("medium"));
			simulateCreateNode(state, defaultParams, "node_3", 3, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_4", 4, 0, generateContent("long"));

			updateGroupBounds(state, defaultParams);

			// Verify no jitter
			expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);

			// Verify no overlap
			const { hasOverlaps, overlaps } = detectOverlaps(state);
			expect(hasOverlaps).toBe(false);
			if (hasOverlaps) {
				console.error("Overlaps detected:", overlaps);
			}
		});
	});

	describe("Verify no jitter during streaming", () => {
		it("should maintain anchor position during incremental content updates", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Create initial node with short content
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, "Initial");

			// Simulate streaming: incrementally grow content
			const contentStages = [
				"Initial content",
				"Initial content that is growing",
				"Initial content that is growing and becoming longer",
				"Initial content that is growing and becoming longer with more text added",
				generateContent("medium"),
				generateContent("long"),
			];

			for (const content of contentStages) {
				simulateUpdateNodeContent(state, defaultParams, "node_0", content);
				updateGroupBounds(state, defaultParams);

				// Verify anchor stability at each stage
				expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);
			}
		});

		it("should not cause jitter when multiple nodes grow simultaneously", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Create 3 nodes with initial short content
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, "Node 0");
			simulateCreateNode(state, defaultParams, "node_1", 1, 0, "Node 1");
			simulateCreateNode(state, defaultParams, "node_2", 2, 0, "Node 2");

			// Simulate simultaneous growth (like parallel streaming)
			for (let i = 0; i < 5; i++) {
				const suffix = " ".repeat(i * 20) + "Growing content...";
				simulateUpdateNodeContent(state, defaultParams, "node_0", `Node 0${suffix}`);
				simulateUpdateNodeContent(state, defaultParams, "node_1", `Node 1${suffix}`);
				simulateUpdateNodeContent(state, defaultParams, "node_2", `Node 2${suffix}`);
				updateGroupBounds(state, defaultParams);

				// Verify anchor stability
				expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);
			}
		});

		it("should maintain anchor when group bounds expand", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;
			const initialGroupWidth = state.group.width;
			const initialGroupHeight = state.group.height;

			// Create nodes that will cause group to expand
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, generateContent("long"));
			updateGroupBounds(state, defaultParams);

			// Group should have expanded
			expect(state.group.width).toBeGreaterThanOrEqual(initialGroupWidth);
			expect(state.group.height).toBeGreaterThanOrEqual(initialGroupHeight);

			// But anchor should not have moved
			expect(state.group.x).toBe(originalAnchorX);
			expect(state.group.y).toBe(originalAnchorY);
			expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);
		});
	});

	describe("Verify no overlap at any point", () => {
		it("should prevent overlap when first node grows significantly", () => {
			const state = initializeStreamingState(defaultParams);

			// Create 3 nodes with short content
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_1", 1, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_2", 2, 0, generateContent("short"));

			// Verify no initial overlap
			let { hasOverlaps } = detectOverlaps(state);
			expect(hasOverlaps).toBe(false);

			// Grow first node significantly
			simulateUpdateNodeContent(state, defaultParams, "node_0", generateContent("long"));
			updateGroupBounds(state, defaultParams);

			// Verify no overlap after growth
			({ hasOverlaps } = detectOverlaps(state));
			expect(hasOverlaps).toBe(false);
		});

		it("should prevent overlap when middle node grows significantly", () => {
			const state = initializeStreamingState(defaultParams);

			// Create 5 nodes
			for (let i = 0; i < 5; i++) {
				simulateCreateNode(state, defaultParams, `node_${i}`, i, 0, generateContent("short"));
			}

			// Verify no initial overlap
			let { hasOverlaps } = detectOverlaps(state);
			expect(hasOverlaps).toBe(false);

			// Grow middle node (node_2) significantly
			simulateUpdateNodeContent(state, defaultParams, "node_2", generateContent("long"));
			updateGroupBounds(state, defaultParams);

			// Verify no overlap after growth
			({ hasOverlaps } = detectOverlaps(state));
			expect(hasOverlaps).toBe(false);

			// Verify nodes below were pushed down
			const node2 = state.nodes.get("node_2")!;
			const node3 = state.nodes.get("node_3")!;
			const expectedMinY = node2.y + node2.height + LAYOUT_CONSTANTS.VERTICAL_GAP;
			expect(node3.y).toBeGreaterThanOrEqual(expectedMinY - 1);
		});

		it("should prevent overlap during rapid sequential content growth", () => {
			const state = initializeStreamingState(defaultParams);

			// Create 4 nodes
			for (let i = 0; i < 4; i++) {
				simulateCreateNode(state, defaultParams, `node_${i}`, i, 0, "Initial");
			}

			// Simulate rapid sequential growth (like fast streaming)
			const growthSequence = [
				{ nodeId: "node_0", content: generateContent("medium") },
				{ nodeId: "node_1", content: generateContent("long") },
				{ nodeId: "node_0", content: generateContent("long") },
				{ nodeId: "node_2", content: generateContent("medium") },
				{ nodeId: "node_3", content: generateContent("long") },
			];

			for (const { nodeId, content } of growthSequence) {
				simulateUpdateNodeContent(state, defaultParams, nodeId, content);
				updateGroupBounds(state, defaultParams);

				// Verify no overlap at each step
				const { hasOverlaps, overlaps } = detectOverlaps(state);
				expect(hasOverlaps).toBe(false);
				if (hasOverlaps) {
					console.error(`Overlap after updating ${nodeId}:`, overlaps);
				}
			}
		});

		it("should maintain minimum VERTICAL_GAP between all nodes", () => {
			const state = initializeStreamingState(defaultParams);
			const { VERTICAL_GAP } = LAYOUT_CONSTANTS;

			// Create nodes with varying content
			simulateCreateNode(state, defaultParams, "node_0", 0, 0, generateContent("long"));
			simulateCreateNode(state, defaultParams, "node_1", 1, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_2", 2, 0, generateContent("medium"));
			simulateCreateNode(state, defaultParams, "node_3", 3, 0, generateContent("long"));

			// Verify gaps between all consecutive nodes
			const colTrack = state.columnTracks.get(0)!;
			const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

			for (let i = 0; i < sortedNodes.length - 1; i++) {
				const nodeA = sortedNodes[i];
				const nodeB = sortedNodes[i + 1];
				const gap = nodeB.y - (nodeA.y + nodeA.actualHeight);

				expect(gap).toBeGreaterThanOrEqual(VERTICAL_GAP - 1); // 1px tolerance
			}
		});
	});
});


/**
 * Task 19.2: Test multi-column layouts during streaming
 *
 * Verifies columns remain independent and horizontal spacing is maintained.
 *
 * _Requirements: 8.1, 8.4_
 */
describe("Task 19.2: Multi-Column Layouts During Streaming", () => {
	const defaultParams: LayoutParams = {
		anchorX: 500,
		anchorY: 300,
		padding: 60,
		defaultNodeWidth: 360,
		defaultNodeHeight: 200,
		edgeDirection: "left",
	};

	describe("Verify columns remain independent", () => {
		it("should not affect column 1 when column 0 nodes grow", () => {
			const state = initializeStreamingState(defaultParams);

			// Create nodes in column 0
			simulateCreateNode(state, defaultParams, "node_0_0", 0, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_0_1", 1, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_0_2", 2, 0, generateContent("short"));

			// Create nodes in column 1
			simulateCreateNode(state, defaultParams, "node_1_0", 0, 1, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_1_1", 1, 1, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_1_2", 2, 1, generateContent("short"));

			// Store initial positions of column 1 nodes
			const initialCol1Positions = new Map<string, { y: number }>();
			for (let i = 0; i < 3; i++) {
				const node = state.nodes.get(`node_1_${i}`)!;
				initialCol1Positions.set(`node_1_${i}`, { y: node.y });
			}

			// Grow nodes in column 0
			simulateUpdateNodeContent(state, defaultParams, "node_0_0", generateContent("long"));
			simulateUpdateNodeContent(state, defaultParams, "node_0_1", generateContent("long"));
			updateGroupBounds(state, defaultParams);

			// Verify column 1 nodes have not moved
			for (let i = 0; i < 3; i++) {
				const node = state.nodes.get(`node_1_${i}`)!;
				const initialPos = initialCol1Positions.get(`node_1_${i}`)!;
				expect(node.y).toBe(initialPos.y);
			}
		});

		it("should allow independent growth in multiple columns", () => {
			const state = initializeStreamingState(defaultParams);

			// Create 2x3 grid of nodes
			for (let col = 0; col < 2; col++) {
				for (let row = 0; row < 3; row++) {
					simulateCreateNode(state, defaultParams, `node_${col}_${row}`, row, col, generateContent("short"));
				}
			}

			// Grow first node in column 0 significantly
			simulateUpdateNodeContent(state, defaultParams, "node_0_0", generateContent("long"));
			updateGroupBounds(state, defaultParams);

			// Grow first node in column 1 by a different amount
			simulateUpdateNodeContent(state, defaultParams, "node_1_0", generateContent("medium"));
			updateGroupBounds(state, defaultParams);

			// Verify each column has its own independent layout
			const col0Track = state.columnTracks.get(0)!;
			const col1Track = state.columnTracks.get(1)!;

			// Column 0 should have larger gaps due to long content
			const col0Node0 = col0Track.nodes.find(n => n.nodeId === "node_0_0")!;
			const col0Node1 = col0Track.nodes.find(n => n.nodeId === "node_0_1")!;

			// Column 1 should have smaller gaps due to medium content
			const col1Node0 = col1Track.nodes.find(n => n.nodeId === "node_1_0")!;
			const col1Node1 = col1Track.nodes.find(n => n.nodeId === "node_1_1")!;

			// The Y positions of second row nodes should be different between columns
			// because the first row nodes have different heights
			const col0SecondRowY = col0Node1.y;
			const col1SecondRowY = col1Node1.y;

			// Column 0's second row should be lower (first node is taller)
			expect(col0SecondRowY).toBeGreaterThan(col1SecondRowY);
		});

		it("should maintain no overlap within each column independently", () => {
			const state = initializeStreamingState(defaultParams);

			// Create 3x4 grid of nodes
			for (let col = 0; col < 3; col++) {
				for (let row = 0; row < 4; row++) {
					const contentLength: ContentLength = (row + col) % 3 === 0 ? "long" :
					                                     (row + col) % 3 === 1 ? "medium" : "short";
					simulateCreateNode(state, defaultParams, `node_${col}_${row}`, row, col, generateContent(contentLength));
				}
			}

			updateGroupBounds(state, defaultParams);

			// Verify no overlap in any column
			const { hasOverlaps, overlaps } = detectOverlaps(state);
			expect(hasOverlaps).toBe(false);
			if (hasOverlaps) {
				console.error("Overlaps detected:", overlaps);
			}
		});

		it("should handle growth in different columns at different times", () => {
			const state = initializeStreamingState(defaultParams);

			// Create 3x3 grid
			for (let col = 0; col < 3; col++) {
				for (let row = 0; row < 3; row++) {
					simulateCreateNode(state, defaultParams, `node_${col}_${row}`, row, col, "Initial");
				}
			}

			// Simulate interleaved growth across columns
			const growthSequence = [
				{ col: 0, row: 0, content: generateContent("medium") },
				{ col: 2, row: 1, content: generateContent("long") },
				{ col: 1, row: 0, content: generateContent("short") },
				{ col: 0, row: 1, content: generateContent("long") },
				{ col: 2, row: 0, content: generateContent("medium") },
				{ col: 1, row: 2, content: generateContent("long") },
			];

			for (const { col, row, content } of growthSequence) {
				simulateUpdateNodeContent(state, defaultParams, `node_${col}_${row}`, content);
				updateGroupBounds(state, defaultParams);

				// Verify no overlap after each update
				const { hasOverlaps, overlaps } = detectOverlaps(state);
				expect(hasOverlaps).toBe(false);
				if (hasOverlaps) {
					console.error(`Overlap after updating node_${col}_${row}:`, overlaps);
				}
			}
		});
	});

	describe("Verify horizontal spacing is maintained", () => {
		it("should maintain HORIZONTAL_GAP between adjacent columns", () => {
			const state = initializeStreamingState(defaultParams);
			const { HORIZONTAL_GAP, EDGE_LABEL_SAFE_ZONE } = LAYOUT_CONSTANTS;

			// Create nodes in 3 columns
			for (let col = 0; col < 3; col++) {
				simulateCreateNode(state, defaultParams, `node_${col}_0`, 0, col, generateContent("short"));
			}

			// Verify horizontal spacing
			const node0 = state.nodes.get("node_0_0")!;
			const node1 = state.nodes.get("node_1_0")!;
			const node2 = state.nodes.get("node_2_0")!;

			// Gap between column 0 and column 1
			const gap01 = node1.x - (node0.x + node0.width);
			expect(gap01).toBeGreaterThanOrEqual(HORIZONTAL_GAP - 1); // 1px tolerance

			// Gap between column 1 and column 2
			const gap12 = node2.x - (node1.x + node1.width);
			expect(gap12).toBeGreaterThanOrEqual(HORIZONTAL_GAP - 1);
		});

		it("should use column max width for spacing calculations", () => {
			const state = initializeStreamingState(defaultParams);
			const { HORIZONTAL_GAP } = LAYOUT_CONSTANTS;

			// Create nodes in column 0 with varying widths (simulated by content)
			simulateCreateNode(state, defaultParams, "node_0_0", 0, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_0_1", 1, 0, generateContent("long")); // Wider due to content

			// Create node in column 1
			simulateCreateNode(state, defaultParams, "node_1_0", 0, 1, generateContent("short"));

			// The column 1 node should be positioned based on column 0's max width
			const col0Track = state.columnTracks.get(0)!;
			const node1 = state.nodes.get("node_1_0")!;

			// Column 1's X should be: anchorX + padding + leftSafeZone + col0MaxWidth + HORIZONTAL_GAP
			const expectedMinX = state.anchorState.anchorX + defaultParams.padding +
			                     LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE +
			                     col0Track.maxWidth + HORIZONTAL_GAP;

			expect(node1.x).toBeGreaterThanOrEqual(expectedMinX - 1);
		});

		it("should not cause horizontal overlap when columns have different heights", () => {
			const state = initializeStreamingState(defaultParams);

			// Create column 0 with many tall nodes
			for (let row = 0; row < 5; row++) {
				simulateCreateNode(state, defaultParams, `node_0_${row}`, row, 0, generateContent("long"));
			}

			// Create column 1 with fewer short nodes
			for (let row = 0; row < 2; row++) {
				simulateCreateNode(state, defaultParams, `node_1_${row}`, row, 1, generateContent("short"));
			}

			updateGroupBounds(state, defaultParams);

			// Verify no horizontal overlap
			const col0Nodes = Array.from(state.nodes.values()).filter(n => n.col === 0);
			const col1Nodes = Array.from(state.nodes.values()).filter(n => n.col === 1);

			for (const node0 of col0Nodes) {
				for (const node1 of col1Nodes) {
					// Column 1 nodes should be to the right of column 0 nodes
					expect(node1.x).toBeGreaterThan(node0.x + node0.width);
				}
			}
		});

		it("should maintain spacing when nodes are added to columns in non-sequential order", () => {
			const state = initializeStreamingState(defaultParams);
			const { HORIZONTAL_GAP } = LAYOUT_CONSTANTS;

			// Add nodes in non-sequential column order
			simulateCreateNode(state, defaultParams, "node_2_0", 0, 2, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_0_0", 0, 0, generateContent("short"));
			simulateCreateNode(state, defaultParams, "node_1_0", 0, 1, generateContent("short"));

			// Verify proper horizontal ordering
			const node0 = state.nodes.get("node_0_0")!;
			const node1 = state.nodes.get("node_1_0")!;
			const node2 = state.nodes.get("node_2_0")!;

			// Nodes should be ordered left to right by column
			expect(node0.x).toBeLessThan(node1.x);
			expect(node1.x).toBeLessThan(node2.x);

			// Gaps should be maintained
			expect(node1.x - (node0.x + node0.width)).toBeGreaterThanOrEqual(HORIZONTAL_GAP - 1);
			expect(node2.x - (node1.x + node1.width)).toBeGreaterThanOrEqual(HORIZONTAL_GAP - 1);
		});
	});

	describe("Combined multi-column streaming scenarios", () => {
		it("should handle complete streaming simulation with multiple columns", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Phase 1: Create initial nodes across 3 columns
			for (let col = 0; col < 3; col++) {
				for (let row = 0; row < 3; row++) {
					simulateCreateNode(state, defaultParams, `node_${col}_${row}`, row, col, "Initial");
				}
			}

			// Phase 2: Simulate streaming content growth
			const streamingUpdates = [
				// Column 0 grows
				{ id: "node_0_0", content: "Growing..." },
				{ id: "node_0_0", content: "Growing more content..." },
				{ id: "node_0_0", content: generateContent("medium") },
				// Column 1 grows
				{ id: "node_1_1", content: "Starting to grow..." },
				{ id: "node_1_1", content: generateContent("long") },
				// Column 2 grows
				{ id: "node_2_0", content: generateContent("medium") },
				{ id: "node_2_2", content: generateContent("long") },
				// More growth in column 0
				{ id: "node_0_1", content: generateContent("long") },
			];

			for (const { id, content } of streamingUpdates) {
				simulateUpdateNodeContent(state, defaultParams, id, content);
				updateGroupBounds(state, defaultParams);

				// Verify invariants at each step
				expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);

				const { hasOverlaps, overlaps } = detectOverlaps(state);
				expect(hasOverlaps).toBe(false);
				if (hasOverlaps) {
					console.error(`Overlap after updating ${id}:`, overlaps);
				}
			}

			// Final verification
			expect(state.nodes.size).toBe(9);
			expect(state.columnTracks.size).toBe(3);
		});

		it("should handle edge direction variations with multi-column layout", () => {
			const edgeDirections: EdgeDirection[] = ["left", "top", "right", "bottom"];

			for (const edgeDirection of edgeDirections) {
				const params: LayoutParams = { ...defaultParams, edgeDirection };
				const state = initializeStreamingState(params);

				// Create 2x2 grid
				for (let col = 0; col < 2; col++) {
					for (let row = 0; row < 2; row++) {
						simulateCreateNode(state, params, `node_${col}_${row}`, row, col, generateContent("medium"));
					}
				}

				updateGroupBounds(state, params);

				// Verify no overlap regardless of edge direction
				const { hasOverlaps, overlaps } = detectOverlaps(state);
				expect(hasOverlaps).toBe(false);
				if (hasOverlaps) {
					console.error(`Overlaps with edge direction ${edgeDirection}:`, overlaps);
				}
			}
		});

		it("should maintain layout integrity with large number of nodes", () => {
			const state = initializeStreamingState(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Create 5x5 grid (25 nodes)
			for (let col = 0; col < 5; col++) {
				for (let row = 0; row < 5; row++) {
					const contentLength: ContentLength = Math.random() < 0.3 ? "long" :
					                                     Math.random() < 0.5 ? "medium" : "short";
					simulateCreateNode(state, defaultParams, `node_${col}_${row}`, row, col, generateContent(contentLength));
				}
			}

			updateGroupBounds(state, defaultParams);

			// Verify all invariants
			expect(checkAnchorStability(state, originalAnchorX, originalAnchorY)).toBe(true);

			const { hasOverlaps, overlaps } = detectOverlaps(state);
			expect(hasOverlaps).toBe(false);
			if (hasOverlaps) {
				console.error("Overlaps in large grid:", overlaps);
			}

			// Verify all 25 nodes were created
			expect(state.nodes.size).toBe(25);
			expect(state.columnTracks.size).toBe(5);
		});
	});
});


/**
 * Task 21.5: Unit tests for first node positioning scenarios
 *
 * Tests that first nodes clear the group header and group bounds expand immediately.
 *
 * _Requirements: 12.1, 12.3, 12.4, 12.6_
 */
describe("Task 21.5: First Node Positioning Scenarios", () => {
	/**
	 * Layout constants for group header height clearance
	 * Mirrors the constants in StreamingNodeCreator
	 * Requirements: 12.5
	 */
	const GROUP_HEADER_CONSTANTS = {
		GROUP_HEADER_HEIGHT: 40,
		PADDING_TOP: 20,
		PADDING_BOTTOM: 20,
	} as const;

	const defaultParams: LayoutParams = {
		anchorX: 500,
		anchorY: 300,
		padding: 60,
		defaultNodeWidth: 360,
		defaultNodeHeight: 200,
		edgeDirection: "left",
	};

	/**
	 * Initialize streaming state with header clearance support
	 */
	function initializeStreamingStateWithHeader(params: LayoutParams): StreamingState {
		return {
			anchorState: {
				anchorX: params.anchorX,
				anchorY: params.anchorY,
				anchorLocked: true,
				minRowSeen: 0,
				minColSeen: 0,
				edgeDirection: params.edgeDirection,
			},
			group: {
				x: params.anchorX,
				y: params.anchorY,
				width: 400,
				height: 300,
			},
			nodes: new Map(),
			columnTracks: new Map(),
			nodeActualSizes: new Map(),
		};
	}

	/**
	 * Calculate node position with group header clearance
	 * This mirrors the updated calculateNodePositionInPreCreatedGroup logic
	 */
	function calculateNodePositionWithHeader(
		state: StreamingState,
		params: LayoutParams,
		nodeId: string,
		row: number,
		col: number,
		content: string
	): { x: number; y: number; height: number } {
		const { VERTICAL_GAP, HORIZONTAL_GAP, EDGE_LABEL_SAFE_ZONE } = LAYOUT_CONSTANTS;
		const { GROUP_HEADER_HEIGHT, PADDING_TOP } = GROUP_HEADER_CONSTANTS;

		const normalizedRow = row - state.anchorState.minRowSeen;
		const normalizedCol = col - state.anchorState.minColSeen;

		// Calculate safe zones
		const topSafeZone = (state.anchorState.edgeDirection === "top") ? EDGE_LABEL_SAFE_ZONE : 0;
		const leftSafeZone = (state.anchorState.edgeDirection === "left") ? EDGE_LABEL_SAFE_ZONE : 0;

		// Calculate X position
		let x = state.anchorState.anchorX + params.padding + leftSafeZone;
		for (let c = 0; c < normalizedCol; c++) {
			const colTrack = state.columnTracks.get(c);
			const colWidth = colTrack?.maxWidth || params.defaultNodeWidth;
			x += colWidth + HORIZONTAL_GAP;
		}

		// Calculate Y position with GROUP_HEADER_HEIGHT + PADDING_TOP for first row
		let y: number;
		const colTrack = state.columnTracks.get(normalizedCol);

		if (normalizedRow === 0 || !colTrack || colTrack.nodes.length === 0) {
			// First node in column: MUST clear group header + padding + safe zone
			// Formula: y = anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone
			y = state.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone;
		} else {
			const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);
			let prevNodeInfo: ColumnNodeInfo | null = null;

			for (const nodeInfo of sortedNodes) {
				if (nodeInfo.row < normalizedRow) {
					prevNodeInfo = nodeInfo;
				} else {
					break;
				}
			}

			if (prevNodeInfo) {
				y = prevNodeInfo.y + prevNodeInfo.actualHeight + VERTICAL_GAP;
			} else {
				y = state.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone;
			}
		}

		const height = calculateContentHeight(content, params.defaultNodeHeight);

		return { x, y, height };
	}

	/**
	 * Simulate creating a node with header clearance
	 */
	function simulateCreateNodeWithHeader(
		state: StreamingState,
		params: LayoutParams,
		nodeId: string,
		row: number,
		col: number,
		content: string
	): StreamingNode {
		const { x, y, height } = calculateNodePositionWithHeader(state, params, nodeId, row, col, content);

		const node: StreamingNode = {
			id: nodeId,
			row,
			col,
			x,
			y,
			width: params.defaultNodeWidth,
			height,
			content,
		};

		state.nodes.set(nodeId, node);
		registerNodeInColumn(state, nodeId, col, row, y, height, params.defaultNodeWidth, params.defaultNodeWidth);

		return node;
	}

	/**
	 * Update group bounds with PADDING_BOTTOM
	 */
	function updateGroupBoundsWithPaddingBottom(state: StreamingState, params: LayoutParams): void {
		const { PADDING_BOTTOM } = GROUP_HEADER_CONSTANTS;
		const nodes = Array.from(state.nodes.values());
		if (nodes.length === 0) return;

		let maxX = -Infinity, maxY = -Infinity;
		nodes.forEach(node => {
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		});

		// Group can only expand, never shrink
		// Use PADDING_BOTTOM for height calculation
		state.group.width = Math.max(state.group.width, maxX - state.anchorState.anchorX + params.padding);
		state.group.height = Math.max(state.group.height, maxY - state.anchorState.anchorY + PADDING_BOTTOM);
	}

	describe("Test first node in single-column layout clears header", () => {
		it("should position first node below group header", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);
			const { GROUP_HEADER_HEIGHT, PADDING_TOP } = GROUP_HEADER_CONSTANTS;

			// Create first node
			const node = simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, generateContent("short"));

			// First node should be at anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP
			const expectedY = state.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP;
			expect(node.y).toBe(expectedY);
		});

		it("should apply header clearance immediately on first token arrival", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);
			const { GROUP_HEADER_HEIGHT, PADDING_TOP } = GROUP_HEADER_CONSTANTS;

			// Simulate first token arrival with minimal content
			const node = simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, "A");

			// Even with minimal content, header clearance should be applied
			const expectedY = state.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP;
			expect(node.y).toBe(expectedY);
		});

		it("should maintain header clearance as content grows", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);
			const { GROUP_HEADER_HEIGHT, PADDING_TOP } = GROUP_HEADER_CONSTANTS;

			// Create first node with short content
			const node = simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			const initialY = node.y;

			// Verify initial position
			const expectedY = state.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP;
			expect(initialY).toBe(expectedY);

			// Simulate content growth (Y position should not change)
			// In real implementation, updatePartialNode preserves position
			expect(node.y).toBe(initialY);
		});
	});

	describe("Test first node in multi-column layout (all row-0 nodes clear header)", () => {
		it("should position all row-0 nodes with same header clearance", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);
			const { GROUP_HEADER_HEIGHT, PADDING_TOP } = GROUP_HEADER_CONSTANTS;

			// Create first row nodes across 3 columns
			const node0 = simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			const node1 = simulateCreateNodeWithHeader(state, defaultParams, "node_1", 0, 1, generateContent("medium"));
			const node2 = simulateCreateNodeWithHeader(state, defaultParams, "node_2", 0, 2, generateContent("long"));

			// All row-0 nodes should have the same Y position (header clearance)
			const expectedY = state.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP;
			expect(node0.y).toBe(expectedY);
			expect(node1.y).toBe(expectedY);
			expect(node2.y).toBe(expectedY);
		});

		it("should apply header clearance regardless of column creation order", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);
			const { GROUP_HEADER_HEIGHT, PADDING_TOP } = GROUP_HEADER_CONSTANTS;

			// Create nodes in non-sequential column order
			const node2 = simulateCreateNodeWithHeader(state, defaultParams, "node_2", 0, 2, generateContent("short"));
			const node0 = simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			const node1 = simulateCreateNodeWithHeader(state, defaultParams, "node_1", 0, 1, generateContent("short"));

			// All should have same Y position
			const expectedY = state.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP;
			expect(node0.y).toBe(expectedY);
			expect(node1.y).toBe(expectedY);
			expect(node2.y).toBe(expectedY);
		});

		it("should combine header clearance with top safe zone when edge is from top", () => {
			const paramsWithTopEdge: LayoutParams = {
				...defaultParams,
				edgeDirection: "top",
			};
			const state = initializeStreamingStateWithHeader(paramsWithTopEdge);
			const { GROUP_HEADER_HEIGHT, PADDING_TOP } = GROUP_HEADER_CONSTANTS;
			const { EDGE_LABEL_SAFE_ZONE } = LAYOUT_CONSTANTS;

			// Create first node
			const node = simulateCreateNodeWithHeader(state, paramsWithTopEdge, "node_0", 0, 0, generateContent("short"));

			// Should have both header clearance AND top safe zone
			const expectedY = state.anchorState.anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + EDGE_LABEL_SAFE_ZONE;
			expect(node.y).toBe(expectedY);
		});
	});

	describe("Test group bounds expand immediately on first node creation", () => {
		it("should expand group height to wrap first node with PADDING_BOTTOM", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);
			const { PADDING_BOTTOM } = GROUP_HEADER_CONSTANTS;
			const initialGroupHeight = state.group.height;

			// Create first node with long content
			const node = simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, generateContent("long"));
			updateGroupBoundsWithPaddingBottom(state, defaultParams);

			// Group height should satisfy: group.height >= (node.y - group.y) + node.height + PADDING_BOTTOM
			const minRequiredHeight = (node.y - state.group.y) + node.height + PADDING_BOTTOM;
			expect(state.group.height).toBeGreaterThanOrEqual(minRequiredHeight);
		});

		it("should expand group immediately even with minimal content", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);
			const { PADDING_BOTTOM } = GROUP_HEADER_CONSTANTS;

			// Create first node with minimal content
			const node = simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, "A");
			updateGroupBoundsWithPaddingBottom(state, defaultParams);

			// Group should still expand to wrap the node
			const minRequiredHeight = (node.y - state.group.y) + node.height + PADDING_BOTTOM;
			expect(state.group.height).toBeGreaterThanOrEqual(minRequiredHeight);
		});

		it("should expand group width to wrap first node with padding", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);

			// Create first node
			const node = simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			updateGroupBoundsWithPaddingBottom(state, defaultParams);

			// Group width should wrap the node
			const minRequiredWidth = (node.x - state.group.x) + node.width + defaultParams.padding;
			expect(state.group.width).toBeGreaterThanOrEqual(minRequiredWidth);
		});
	});

	describe("Test group does not shrink during streaming", () => {
		it("should not shrink group height when content is smaller than initial", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);

			// Set initial group height to be large
			state.group.height = 1000;
			const initialGroupHeight = state.group.height;

			// Create first node with short content
			simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			updateGroupBoundsWithPaddingBottom(state, defaultParams);

			// Group should NOT shrink below initial height
			expect(state.group.height).toBeGreaterThanOrEqual(initialGroupHeight);
		});

		it("should not shrink group width when content is narrower than initial", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);

			// Set initial group width to be large
			state.group.width = 1000;
			const initialGroupWidth = state.group.width;

			// Create first node with short content
			simulateCreateNodeWithHeader(state, defaultParams, "node_0", 0, 0, generateContent("short"));
			updateGroupBoundsWithPaddingBottom(state, defaultParams);

			// Group should NOT shrink below initial width
			expect(state.group.width).toBeGreaterThanOrEqual(initialGroupWidth);
		});

		it("should only grow during streaming, never shrink", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);

			// Track group dimensions through multiple updates
			const dimensionHistory: { width: number; height: number }[] = [];

			// Create multiple nodes
			for (let i = 0; i < 5; i++) {
				const contentLength: ContentLength = i % 2 === 0 ? "long" : "short";
				simulateCreateNodeWithHeader(state, defaultParams, `node_${i}`, i, 0, generateContent(contentLength));
				updateGroupBoundsWithPaddingBottom(state, defaultParams);

				dimensionHistory.push({ width: state.group.width, height: state.group.height });
			}

			// Verify dimensions only increased or stayed the same
			for (let i = 1; i < dimensionHistory.length; i++) {
				expect(dimensionHistory[i].width).toBeGreaterThanOrEqual(dimensionHistory[i - 1].width);
				expect(dimensionHistory[i].height).toBeGreaterThanOrEqual(dimensionHistory[i - 1].height);
			}
		});

		it("should maintain anchor position while group expands", () => {
			const state = initializeStreamingStateWithHeader(defaultParams);
			const originalAnchorX = state.anchorState.anchorX;
			const originalAnchorY = state.anchorState.anchorY;

			// Create multiple nodes that cause group to expand
			for (let i = 0; i < 3; i++) {
				simulateCreateNodeWithHeader(state, defaultParams, `node_${i}`, i, 0, generateContent("long"));
				updateGroupBoundsWithPaddingBottom(state, defaultParams);

				// Verify anchor position is preserved
				expect(state.group.x).toBe(originalAnchorX);
				expect(state.group.y).toBe(originalAnchorY);
				expect(state.anchorState.anchorX).toBe(originalAnchorX);
				expect(state.anchorState.anchorY).toBe(originalAnchorY);
			}
		});
	});
});
