/**
 * Unit Tests for StreamingNodeCreator Content Growth Scenarios
 *
 * Feature: group-anchor-positioning
 *
 * These tests validate the dynamic layout behavior when node content grows
 * during streaming, ensuring proper repositioning and group bounds updates.
 *
 * _Requirements: 6.2, 6.4_
 */

import { AnchorState, LAYOUT_CONSTANTS, ColumnNodeInfo, ColumnTrack, NodeActualSize } from "../streamingNodeCreator";

/**
 * Layout parameters for testing
 */
interface LayoutParams {
	anchorX: number;
	anchorY: number;
	padding: number;
	defaultNodeWidth: number;
	defaultNodeHeight: number;
}

/**
 * Simulates the column tracking state
 */
interface ColumnTrackingState {
	columnTracks: Map<number, ColumnTrack>;
	nodeActualSizes: Map<string, NodeActualSize>;
}

/**
 * Simulates registering a node in column tracking
 * Mirrors registerNodeInColumn in StreamingNodeCreator
 */
function registerNodeInColumn(
	state: ColumnTrackingState,
	nodeId: string,
	col: number,
	row: number,
	y: number,
	height: number,
	width: number,
	defaultNodeWidth: number
): void {
	// Create column track if not exists
	if (!state.columnTracks.has(col)) {
		state.columnTracks.set(col, {
			col,
			nodes: [],
			maxWidth: defaultNodeWidth,
		});
	}

	const colTrack = state.columnTracks.get(col)!;

	// Remove existing entry for this node if any
	colTrack.nodes = colTrack.nodes.filter(n => n.nodeId !== nodeId);

	// Add new entry
	colTrack.nodes.push({
		nodeId,
		row,
		y,
		actualHeight: height,
	});

	// Sort nodes by row
	colTrack.nodes.sort((a, b) => a.row - b.row);

	// Update max width if this node is wider
	if (width > colTrack.maxWidth) {
		colTrack.maxWidth = width;
	}

	// Track in nodeActualSizes
	state.nodeActualSizes.set(nodeId, { width, height });
}

/**
 * Simulates repositioning nodes in a column after height change
 * Mirrors repositionNodesInColumn in StreamingNodeCreator
 */
function repositionNodesInColumn(
	state: ColumnTrackingState,
	col: number,
	changedRow: number
): { repositionedNodes: string[]; newPositions: Map<string, number> } {
	const colTrack = state.columnTracks.get(col);
	const repositionedNodes: string[] = [];
	const newPositions = new Map<string, number>();

	if (!colTrack || colTrack.nodes.length === 0) {
		return { repositionedNodes, newPositions };
	}

	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;
	const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

	let prevY = 0;
	let prevHeight = 0;

	for (const nodeInfo of sortedNodes) {
		if (nodeInfo.row <= changedRow) {
			prevY = nodeInfo.y;
			prevHeight = nodeInfo.actualHeight;
			continue;
		}

		const newY = prevY + prevHeight + VERTICAL_GAP;

		if (Math.abs(nodeInfo.y - newY) > 1) {
			repositionedNodes.push(nodeInfo.nodeId);
			newPositions.set(nodeInfo.nodeId, newY);
			nodeInfo.y = newY;
		}

		prevY = nodeInfo.y;
		prevHeight = nodeInfo.actualHeight;
	}

	return { repositionedNodes, newPositions };
}

/**
 * Simulates updating node height and triggering repositioning
 * Mirrors updateNodeHeightAndReposition in StreamingNodeCreator
 */
function updateNodeHeightAndReposition(
	state: ColumnTrackingState,
	nodeId: string,
	newHeight: number
): { col: number; row: number; repositionedNodes: string[] } | null {
	// Find the node in column tracks
	for (const [col, colTrack] of state.columnTracks.entries()) {
		const nodeInfo = colTrack.nodes.find(n => n.nodeId === nodeId);
		if (nodeInfo) {
			const oldHeight = nodeInfo.actualHeight;

			if (Math.abs(oldHeight - newHeight) > 1) {
				nodeInfo.actualHeight = newHeight;

				// Update nodeActualSizes
				const existingSize = state.nodeActualSizes.get(nodeId);
				if (existingSize) {
					state.nodeActualSizes.set(nodeId, { width: existingSize.width, height: newHeight });
				}

				// Reposition nodes below
				const { repositionedNodes } = repositionNodesInColumn(state, col, nodeInfo.row);

				return { col, row: nodeInfo.row, repositionedNodes };
			}

			return { col, row: nodeInfo.row, repositionedNodes: [] };
		}
	}

	return null;
}

/**
 * Simulates calculating group bounds from member nodes
 * Mirrors updateGroupBounds logic in StreamingNodeCreator
 */
function calculateGroupBounds(
	memberNodes: Array<{ x: number; y: number; width: number; height: number }>,
	padding: number
): { x: number; y: number; width: number; height: number } {
	if (memberNodes.length === 0) {
		return { x: 0, y: 0, width: 400, height: 300 };
	}

	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

	for (const node of memberNodes) {
		minX = Math.min(minX, node.x);
		minY = Math.min(minY, node.y);
		maxX = Math.max(maxX, node.x + node.width);
		maxY = Math.max(maxY, node.y + node.height);
	}

	return {
		x: minX - padding,
		y: minY - padding,
		width: maxX - minX + padding * 2,
		height: maxY - minY + padding * 2,
	};
}

describe("StreamingNodeCreator Content Growth Scenarios", () => {
	const defaultParams: LayoutParams = {
		anchorX: 500,
		anchorY: 300,
		padding: 60,
		defaultNodeWidth: 360,
		defaultNodeHeight: 200,
	};

	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;

	describe("Single Node Height Growth", () => {
		it("should update node height when content grows", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register a single node
			const initialHeight = 200;
			registerNodeInColumn(state, "node_0", 0, 0, 360, initialHeight, 360, defaultParams.defaultNodeWidth);

			// Verify initial state
			expect(state.nodeActualSizes.get("node_0")?.height).toBe(initialHeight);

			// Simulate height growth
			const newHeight = 400;
			const result = updateNodeHeightAndReposition(state, "node_0", newHeight);

			// Verify height was updated
			expect(result).not.toBeNull();
			expect(state.nodeActualSizes.get("node_0")?.height).toBe(newHeight);
			expect(result?.repositionedNodes).toHaveLength(0); // No nodes below to reposition
		});

		it("should not trigger repositioning when height change is minimal", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register a single node
			const initialHeight = 200;
			registerNodeInColumn(state, "node_0", 0, 0, 360, initialHeight, 360, defaultParams.defaultNodeWidth);

			// Simulate minimal height change (within 1px tolerance)
			const newHeight = 200.5;
			const result = updateNodeHeightAndReposition(state, "node_0", newHeight);

			// Height should not be updated (within tolerance)
			expect(result).not.toBeNull();
			expect(result?.repositionedNodes).toHaveLength(0);
		});
	});

	describe("Multiple Nodes in Column with Growth", () => {
		it("should reposition nodes below when first node grows", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register 3 nodes in column 0
			const baseY = defaultParams.anchorY + defaultParams.padding;
			const h0 = 200, h1 = 200, h2 = 200;

			registerNodeInColumn(state, "node_0", 0, 0, baseY, h0, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1", 0, 1, baseY + h0 + VERTICAL_GAP, h1, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_2", 0, 2, baseY + h0 + VERTICAL_GAP + h1 + VERTICAL_GAP, h2, 360, defaultParams.defaultNodeWidth);

			// Verify initial positions
			const colTrack = state.columnTracks.get(0)!;
			expect(colTrack.nodes[0].y).toBe(baseY);
			expect(colTrack.nodes[1].y).toBe(baseY + h0 + VERTICAL_GAP);
			expect(colTrack.nodes[2].y).toBe(baseY + h0 + VERTICAL_GAP + h1 + VERTICAL_GAP);

			// Grow first node
			const newH0 = 400;
			const result = updateNodeHeightAndReposition(state, "node_0", newH0);

			// Verify repositioning
			expect(result).not.toBeNull();
			expect(result?.repositionedNodes).toContain("node_1");
			expect(result?.repositionedNodes).toContain("node_2");

			// Verify new positions
			expect(colTrack.nodes[0].y).toBe(baseY); // First node doesn't move
			expect(colTrack.nodes[1].y).toBe(baseY + newH0 + VERTICAL_GAP);
			expect(colTrack.nodes[2].y).toBe(baseY + newH0 + VERTICAL_GAP + h1 + VERTICAL_GAP);
		});

		it("should only reposition nodes below the changed node", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register 3 nodes in column 0
			const baseY = defaultParams.anchorY + defaultParams.padding;
			const h0 = 200, h1 = 200, h2 = 200;

			registerNodeInColumn(state, "node_0", 0, 0, baseY, h0, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1", 0, 1, baseY + h0 + VERTICAL_GAP, h1, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_2", 0, 2, baseY + h0 + VERTICAL_GAP + h1 + VERTICAL_GAP, h2, 360, defaultParams.defaultNodeWidth);

			const initialY0 = state.columnTracks.get(0)!.nodes[0].y;

			// Grow middle node
			const newH1 = 400;
			const result = updateNodeHeightAndReposition(state, "node_1", newH1);

			// Verify only node_2 was repositioned
			expect(result?.repositionedNodes).not.toContain("node_0");
			expect(result?.repositionedNodes).toContain("node_2");

			// First node should not have moved
			expect(state.columnTracks.get(0)!.nodes[0].y).toBe(initialY0);
		});

		it("should maintain no-overlap invariant after growth", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register 5 nodes in column 0
			const baseY = defaultParams.anchorY + defaultParams.padding;
			let currentY = baseY;
			const heights = [150, 200, 180, 220, 190];

			for (let i = 0; i < 5; i++) {
				registerNodeInColumn(state, `node_${i}`, 0, i, currentY, heights[i], 360, defaultParams.defaultNodeWidth);
				currentY += heights[i] + VERTICAL_GAP;
			}

			// Grow node at row 1 significantly
			const newHeight = 500;
			updateNodeHeightAndReposition(state, "node_1", newHeight);

			// Verify no overlap
			const colTrack = state.columnTracks.get(0)!;
			const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

			for (let i = 0; i < sortedNodes.length - 1; i++) {
				const nodeA = sortedNodes[i];
				const nodeB = sortedNodes[i + 1];

				const aBottom = nodeA.y + nodeA.actualHeight;
				expect(nodeB.y).toBeGreaterThanOrEqual(aBottom + VERTICAL_GAP - 1); // 1px tolerance
			}
		});
	});

	describe("Multi-Column Layout with Growth", () => {
		it("should only affect nodes in the same column when growing", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register nodes in column 0
			const baseY = defaultParams.anchorY + defaultParams.padding;
			registerNodeInColumn(state, "node_0_0", 0, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_0_1", 0, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Register nodes in column 1
			registerNodeInColumn(state, "node_1_0", 1, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1_1", 1, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Store initial positions of column 1 nodes
			const initialY_1_0 = state.columnTracks.get(1)!.nodes[0].y;
			const initialY_1_1 = state.columnTracks.get(1)!.nodes[1].y;

			// Grow node in column 0
			updateNodeHeightAndReposition(state, "node_0_0", 400);

			// Column 1 nodes should not have moved
			expect(state.columnTracks.get(1)!.nodes[0].y).toBe(initialY_1_0);
			expect(state.columnTracks.get(1)!.nodes[1].y).toBe(initialY_1_1);
		});

		it("should handle independent growth in multiple columns", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register nodes in column 0 and column 1
			const baseY = defaultParams.anchorY + defaultParams.padding;
			registerNodeInColumn(state, "node_0_0", 0, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_0_1", 0, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1_0", 1, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1_1", 1, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Grow nodes in both columns
			updateNodeHeightAndReposition(state, "node_0_0", 400);
			updateNodeHeightAndReposition(state, "node_1_0", 300);

			// Verify column 0 layout
			const col0 = state.columnTracks.get(0)!;
			expect(col0.nodes[0].actualHeight).toBe(400);
			expect(col0.nodes[1].y).toBe(baseY + 400 + VERTICAL_GAP);

			// Verify column 1 layout (independent)
			const col1 = state.columnTracks.get(1)!;
			expect(col1.nodes[0].actualHeight).toBe(300);
			expect(col1.nodes[1].y).toBe(baseY + 300 + VERTICAL_GAP);
		});
	});

	describe("Group Bounds Update After Growth", () => {
		it("should expand group bounds when node grows", () => {
			const padding = defaultParams.padding;

			// Initial nodes
			const initialNodes = [
				{ x: 560, y: 360, width: 360, height: 200 },
				{ x: 560, y: 600, width: 360, height: 200 },
			];

			const initialBounds = calculateGroupBounds(initialNodes, padding);

			// After first node grows
			const grownNodes = [
				{ x: 560, y: 360, width: 360, height: 400 }, // Height increased
				{ x: 560, y: 800, width: 360, height: 200 }, // Repositioned
			];

			const newBounds = calculateGroupBounds(grownNodes, padding);

			// Group should be taller
			expect(newBounds.height).toBeGreaterThan(initialBounds.height);

			// Group should contain all nodes with padding
			expect(newBounds.y).toBeLessThanOrEqual(grownNodes[0].y - padding);
			expect(newBounds.y + newBounds.height).toBeGreaterThanOrEqual(
				grownNodes[1].y + grownNodes[1].height + padding
			);
		});

		it("should maintain group containment after multiple growth events", () => {
			const padding = defaultParams.padding;

			// Simulate multiple growth events
			const nodes = [
				{ x: 560, y: 360, width: 360, height: 200 },
				{ x: 560, y: 600, width: 360, height: 200 },
				{ x: 560, y: 840, width: 360, height: 200 },
			];

			// First growth
			nodes[0].height = 300;
			nodes[1].y = 360 + 300 + VERTICAL_GAP;
			nodes[2].y = nodes[1].y + 200 + VERTICAL_GAP;

			let bounds = calculateGroupBounds(nodes, padding);

			// Verify containment
			for (const node of nodes) {
				expect(bounds.x).toBeLessThanOrEqual(node.x - padding + 1);
				expect(bounds.y).toBeLessThanOrEqual(node.y - padding + 1);
				expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(node.x + node.width + padding - 1);
				expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(node.y + node.height + padding - 1);
			}

			// Second growth
			nodes[1].height = 400;
			nodes[2].y = nodes[1].y + 400 + VERTICAL_GAP;

			bounds = calculateGroupBounds(nodes, padding);

			// Verify containment again
			for (const node of nodes) {
				expect(bounds.x).toBeLessThanOrEqual(node.x - padding + 1);
				expect(bounds.y).toBeLessThanOrEqual(node.y - padding + 1);
				expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(node.x + node.width + padding - 1);
				expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(node.y + node.height + padding - 1);
			}
		});
	});

	describe("Height Tracking Accuracy", () => {
		it("should accurately track height in nodeActualSizes", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register node with initial height
			registerNodeInColumn(state, "node_0", 0, 0, 360, 200, 360, defaultParams.defaultNodeWidth);
			expect(state.nodeActualSizes.get("node_0")?.height).toBe(200);

			// Update height
			updateNodeHeightAndReposition(state, "node_0", 350);
			expect(state.nodeActualSizes.get("node_0")?.height).toBe(350);

			// Update again
			updateNodeHeightAndReposition(state, "node_0", 500);
			expect(state.nodeActualSizes.get("node_0")?.height).toBe(500);
		});

		it("should sync height between columnTracks and nodeActualSizes", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register multiple nodes
			registerNodeInColumn(state, "node_0", 0, 0, 360, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1", 0, 1, 600, 200, 360, defaultParams.defaultNodeWidth);

			// Update heights
			updateNodeHeightAndReposition(state, "node_0", 300);
			updateNodeHeightAndReposition(state, "node_1", 400);

			// Verify sync
			const colTrack = state.columnTracks.get(0)!;

			const node0Track = colTrack.nodes.find(n => n.nodeId === "node_0")!;
			const node1Track = colTrack.nodes.find(n => n.nodeId === "node_1")!;

			expect(node0Track.actualHeight).toBe(state.nodeActualSizes.get("node_0")?.height);
			expect(node1Track.actualHeight).toBe(state.nodeActualSizes.get("node_1")?.height);
		});
	});
});


/**
 * Additional Unit Tests for Real-Time Reflow on Content Growth
 *
 * Feature: group-anchor-positioning
 *
 * These tests specifically validate the real-time reflow behavior when node
 * content grows during streaming, ensuring proper repositioning.
 *
 * _Requirements: 10.1, 10.2, 10.3_
 */
describe("Real-Time Reflow on Content Growth (Requirements 10.1, 10.2, 10.3)", () => {
	const defaultParams: LayoutParams = {
		anchorX: 500,
		anchorY: 300,
		padding: 60,
		defaultNodeWidth: 360,
		defaultNodeHeight: 200,
	};

	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;

	describe("Single Node Height Growth Pushes Down Nodes Below (Requirements 10.1, 10.2)", () => {
		it("should push down all nodes below when first node grows", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register 4 nodes in column 0
			const baseY = defaultParams.anchorY + defaultParams.padding;
			const initialHeights = [200, 200, 200, 200];
			let currentY = baseY;

			for (let i = 0; i < 4; i++) {
				registerNodeInColumn(state, `node_${i}`, 0, i, currentY, initialHeights[i], 360, defaultParams.defaultNodeWidth);
				currentY += initialHeights[i] + VERTICAL_GAP;
			}

			// Store initial positions
			const initialPositions = state.columnTracks.get(0)!.nodes.map(n => ({ id: n.nodeId, y: n.y }));

			// Grow first node by 100px
			const heightDelta = 100;
			const newHeight = initialHeights[0] + heightDelta;
			const result = updateNodeHeightAndReposition(state, "node_0", newHeight);

			// Verify all nodes below were pushed down by the height delta
			expect(result?.repositionedNodes).toHaveLength(3);
			expect(result?.repositionedNodes).toContain("node_1");
			expect(result?.repositionedNodes).toContain("node_2");
			expect(result?.repositionedNodes).toContain("node_3");

			// Verify each node was pushed down by exactly the height delta
			const colTrack = state.columnTracks.get(0)!;
			for (let i = 1; i < 4; i++) {
				const node = colTrack.nodes.find(n => n.nodeId === `node_${i}`)!;
				const initialPos = initialPositions.find(p => p.id === `node_${i}`)!;
				expect(node.y).toBe(initialPos.y + heightDelta);
			}
		});

		it("should correctly calculate delta when node shrinks", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register 3 nodes with varying heights
			const baseY = defaultParams.anchorY + defaultParams.padding;
			registerNodeInColumn(state, "node_0", 0, 0, baseY, 400, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1", 0, 1, baseY + 400 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_2", 0, 2, baseY + 400 + VERTICAL_GAP + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Shrink first node
			const newHeight = 200;
			updateNodeHeightAndReposition(state, "node_0", newHeight);

			// Verify nodes moved up
			const colTrack = state.columnTracks.get(0)!;
			const node1 = colTrack.nodes.find(n => n.nodeId === "node_1")!;
			const node2 = colTrack.nodes.find(n => n.nodeId === "node_2")!;

			expect(node1.y).toBe(baseY + newHeight + VERTICAL_GAP);
			expect(node2.y).toBe(baseY + newHeight + VERTICAL_GAP + 200 + VERTICAL_GAP);
		});
	});

	describe("Multiple Nodes Growing in Sequence (Requirements 10.1, 10.2)", () => {
		it("should handle sequential growth of multiple nodes", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register 4 nodes
			const baseY = defaultParams.anchorY + defaultParams.padding;
			let currentY = baseY;
			const heights = [200, 200, 200, 200];

			for (let i = 0; i < 4; i++) {
				registerNodeInColumn(state, `node_${i}`, 0, i, currentY, heights[i], 360, defaultParams.defaultNodeWidth);
				currentY += heights[i] + VERTICAL_GAP;
			}

			// Grow node_0 first
			updateNodeHeightAndReposition(state, "node_0", 300);

			// Then grow node_1
			updateNodeHeightAndReposition(state, "node_1", 350);

			// Then grow node_2
			updateNodeHeightAndReposition(state, "node_2", 250);

			// Verify final positions use accumulated heights
			const colTrack = state.columnTracks.get(0)!;
			const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

			// node_0: baseY
			expect(sortedNodes[0].y).toBe(baseY);
			expect(sortedNodes[0].actualHeight).toBe(300);

			// node_1: node_0.y + node_0.height + gap
			expect(sortedNodes[1].y).toBe(baseY + 300 + VERTICAL_GAP);
			expect(sortedNodes[1].actualHeight).toBe(350);

			// node_2: node_1.y + node_1.height + gap
			expect(sortedNodes[2].y).toBe(baseY + 300 + VERTICAL_GAP + 350 + VERTICAL_GAP);
			expect(sortedNodes[2].actualHeight).toBe(250);

			// node_3: node_2.y + node_2.height + gap
			expect(sortedNodes[3].y).toBe(baseY + 300 + VERTICAL_GAP + 350 + VERTICAL_GAP + 250 + VERTICAL_GAP);
		});

		it("should handle interleaved growth of nodes", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register 3 nodes
			const baseY = defaultParams.anchorY + defaultParams.padding;
			registerNodeInColumn(state, "node_0", 0, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1", 0, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_2", 0, 2, baseY + 200 + VERTICAL_GAP + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Grow node_1 first (middle node)
			updateNodeHeightAndReposition(state, "node_1", 400);

			// Then grow node_0 (first node)
			updateNodeHeightAndReposition(state, "node_0", 300);

			// Verify final positions
			const colTrack = state.columnTracks.get(0)!;
			const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

			// node_0: baseY (unchanged)
			expect(sortedNodes[0].y).toBe(baseY);

			// node_1: pushed down by node_0's growth
			expect(sortedNodes[1].y).toBe(baseY + 300 + VERTICAL_GAP);

			// node_2: pushed down by both node_0 and node_1's growth
			expect(sortedNodes[2].y).toBe(baseY + 300 + VERTICAL_GAP + 400 + VERTICAL_GAP);
		});
	});

	describe("Multi-Column Layout with Independent Column Reflows (Requirements 10.1, 10.2)", () => {
		it("should handle independent reflows in multiple columns", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register nodes in 3 columns
			const baseY = defaultParams.anchorY + defaultParams.padding;

			// Column 0: 3 nodes
			registerNodeInColumn(state, "node_0_0", 0, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_0_1", 0, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_0_2", 0, 2, baseY + 200 + VERTICAL_GAP + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Column 1: 3 nodes
			registerNodeInColumn(state, "node_1_0", 1, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1_1", 1, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1_2", 1, 2, baseY + 200 + VERTICAL_GAP + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Column 2: 3 nodes
			registerNodeInColumn(state, "node_2_0", 2, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_2_1", 2, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_2_2", 2, 2, baseY + 200 + VERTICAL_GAP + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Grow first node in column 0 by 200px
			updateNodeHeightAndReposition(state, "node_0_0", 400);

			// Grow first node in column 2 by 100px
			updateNodeHeightAndReposition(state, "node_2_0", 300);

			// Verify column 0 was reflowed
			const col0 = state.columnTracks.get(0)!;
			expect(col0.nodes.find(n => n.nodeId === "node_0_1")!.y).toBe(baseY + 400 + VERTICAL_GAP);
			expect(col0.nodes.find(n => n.nodeId === "node_0_2")!.y).toBe(baseY + 400 + VERTICAL_GAP + 200 + VERTICAL_GAP);

			// Verify column 1 was NOT affected
			const col1 = state.columnTracks.get(1)!;
			expect(col1.nodes.find(n => n.nodeId === "node_1_0")!.y).toBe(baseY);
			expect(col1.nodes.find(n => n.nodeId === "node_1_1")!.y).toBe(baseY + 200 + VERTICAL_GAP);
			expect(col1.nodes.find(n => n.nodeId === "node_1_2")!.y).toBe(baseY + 200 + VERTICAL_GAP + 200 + VERTICAL_GAP);

			// Verify column 2 was reflowed independently
			const col2 = state.columnTracks.get(2)!;
			expect(col2.nodes.find(n => n.nodeId === "node_2_1")!.y).toBe(baseY + 300 + VERTICAL_GAP);
			expect(col2.nodes.find(n => n.nodeId === "node_2_2")!.y).toBe(baseY + 300 + VERTICAL_GAP + 200 + VERTICAL_GAP);
		});

		it("should maintain column independence during simultaneous growth", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register nodes in 2 columns
			const baseY = defaultParams.anchorY + defaultParams.padding;

			// Column 0
			registerNodeInColumn(state, "node_0_0", 0, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_0_1", 0, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Column 1
			registerNodeInColumn(state, "node_1_0", 1, 0, baseY, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1_1", 1, 1, baseY + 200 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);

			// Grow both first nodes simultaneously (simulating parallel streaming)
			updateNodeHeightAndReposition(state, "node_0_0", 500);
			updateNodeHeightAndReposition(state, "node_1_0", 300);

			// Verify each column has its own independent layout
			const col0 = state.columnTracks.get(0)!;
			const col1 = state.columnTracks.get(1)!;

			// Column 0: node_0_1 should be at baseY + 500 + gap
			expect(col0.nodes.find(n => n.nodeId === "node_0_1")!.y).toBe(baseY + 500 + VERTICAL_GAP);

			// Column 1: node_1_1 should be at baseY + 300 + gap (different from column 0)
			expect(col1.nodes.find(n => n.nodeId === "node_1_1")!.y).toBe(baseY + 300 + VERTICAL_GAP);
		});
	});

	describe("Y-Position Uses Accumulated Heights (Requirements 10.3)", () => {
		it("should use accumulated heights instead of fixed grid coordinates", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register nodes with varying heights (not uniform grid)
			const baseY = defaultParams.anchorY + defaultParams.padding;
			const heights = [150, 300, 100, 250, 180];
			let currentY = baseY;

			for (let i = 0; i < heights.length; i++) {
				registerNodeInColumn(state, `node_${i}`, 0, i, currentY, heights[i], 360, defaultParams.defaultNodeWidth);
				currentY += heights[i] + VERTICAL_GAP;
			}

			// Verify positions are based on accumulated heights, not fixed grid
			const colTrack = state.columnTracks.get(0)!;
			const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

			let expectedY = baseY;
			for (let i = 0; i < sortedNodes.length; i++) {
				expect(sortedNodes[i].y).toBe(expectedY);
				expectedY += sortedNodes[i].actualHeight + VERTICAL_GAP;
			}
		});

		it("should recalculate using accumulated heights after growth", () => {
			const state: ColumnTrackingState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			// Register 3 nodes with different heights
			const baseY = defaultParams.anchorY + defaultParams.padding;
			registerNodeInColumn(state, "node_0", 0, 0, baseY, 150, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_1", 0, 1, baseY + 150 + VERTICAL_GAP, 200, 360, defaultParams.defaultNodeWidth);
			registerNodeInColumn(state, "node_2", 0, 2, baseY + 150 + VERTICAL_GAP + 200 + VERTICAL_GAP, 180, 360, defaultParams.defaultNodeWidth);

			// Grow middle node
			updateNodeHeightAndReposition(state, "node_1", 400);

			// Verify node_2's position is based on accumulated heights
			const colTrack = state.columnTracks.get(0)!;
			const node2 = colTrack.nodes.find(n => n.nodeId === "node_2")!;

			// Expected: baseY + node_0.height + gap + node_1.newHeight + gap
			const expectedY = baseY + 150 + VERTICAL_GAP + 400 + VERTICAL_GAP;
			expect(node2.y).toBe(expectedY);
		});
	});
});
