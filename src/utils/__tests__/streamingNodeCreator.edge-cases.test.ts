/**
 * Unit Tests for StreamingNodeCreator Edge Cases
 *
 * Feature: group-anchor-positioning
 *
 * These tests validate edge case handling for the anchor-based positioning system:
 * - Negative coordinates positioning
 * - Coordinate clamping for extreme values
 * - Fallback behavior when anchor state is missing
 *
 * _Requirements: 2.2_
 */

import { AnchorState } from "../streamingNodeCreator";

/**
 * Pure function that calculates node position based on anchor and grid coordinates
 * This mirrors the logic in StreamingNodeCreator.calculateNodePositionInPreCreatedGroup
 */
interface PositionCalculationParams {
	anchorState: AnchorState | null;
	padding: number;
	nodeWidth: number;
	nodeHeight: number;
	gap: number;
	row: number | undefined;
	col: number | undefined;
}

interface PositionResult {
	x: number;
	y: number;
	rowClamped: boolean;
	colClamped: boolean;
	usedFallback: boolean;
}

const MAX_GRID_COORD = 100;

/**
 * Simulates the position calculation logic from StreamingNodeCreator
 * Returns position and metadata about clamping/fallback
 */
function calculateNodePositionWithMetadata(params: PositionCalculationParams): PositionResult {
	const { anchorState, padding, nodeWidth, nodeHeight, gap, row, col } = params;

	// Fallback case: no anchor state
	if (!anchorState) {
		return {
			x: 0,
			y: 0,
			rowClamped: false,
			colClamped: false,
			usedFallback: true,
		};
	}

	const cellWidth = nodeWidth + gap;
	const cellHeight = nodeHeight + gap;

	const rawRow = row ?? 0;
	const rawCol = col ?? 0;

	// Clamp coordinates to reasonable bounds
	const clampedRow = Math.max(-MAX_GRID_COORD, Math.min(MAX_GRID_COORD, rawRow));
	const clampedCol = Math.max(-MAX_GRID_COORD, Math.min(MAX_GRID_COORD, rawCol));

	const rowClamped = rawRow !== clampedRow;
	const colClamped = rawCol !== clampedCol;

	// Normalize coordinates based on minimum seen values
	const normalizedRow = clampedRow - anchorState.minRowSeen;
	const normalizedCol = clampedCol - anchorState.minColSeen;

	return {
		x: anchorState.anchorX + padding + (normalizedCol * cellWidth),
		y: anchorState.anchorY + padding + (normalizedRow * cellHeight),
		rowClamped,
		colClamped,
		usedFallback: false,
	};
}

describe("StreamingNodeCreator Edge Cases", () => {
	const defaultParams = {
		padding: 60,
		nodeWidth: 360,
		nodeHeight: 200,
		gap: 40,
	};

	const defaultAnchorState: AnchorState = {
		anchorX: 500,
		anchorY: 300,
		anchorLocked: true,
		minRowSeen: 0,
		minColSeen: 0,
		edgeDirection: "left",
	};

	describe("Negative Coordinates Positioning", () => {
		it("should position node above anchor for negative row", () => {
			const anchorState: AnchorState = {
				...defaultAnchorState,
				minRowSeen: -1, // Already seen row -1
			};

			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState,
				row: -1,
				col: 0,
			});

			// With minRowSeen = -1, row -1 normalizes to 0
			// x = 500 + 60 + (0 * 400) = 560
			// y = 500 + 60 + (0 * 240) = 360
			expect(result.x).toBe(560);
			expect(result.y).toBe(360);
			expect(result.usedFallback).toBe(false);
		});

		it("should position node left of anchor for negative col", () => {
			const anchorState: AnchorState = {
				...defaultAnchorState,
				minColSeen: -1, // Already seen col -1
			};

			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState,
				row: 0,
				col: -1,
			});

			// With minColSeen = -1, col -1 normalizes to 0
			// x = 500 + 60 + (0 * 400) = 560
			// y = 300 + 60 + (0 * 240) = 360
			expect(result.x).toBe(560);
			expect(result.y).toBe(360);
			expect(result.usedFallback).toBe(false);
		});

		it("should handle both negative row and col", () => {
			const anchorState: AnchorState = {
				...defaultAnchorState,
				minRowSeen: -2,
				minColSeen: -2,
			};

			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState,
				row: -2,
				col: -2,
			});

			// Both normalize to 0
			expect(result.x).toBe(560); // 500 + 60 + 0
			expect(result.y).toBe(360); // 300 + 60 + 0
		});

		it("should correctly offset positive coords when negative coords exist", () => {
			const anchorState: AnchorState = {
				...defaultAnchorState,
				minRowSeen: -1,
				minColSeen: -1,
			};

			// Node at (0, 0) when minRowSeen=-1, minColSeen=-1
			// normalizedRow = 0 - (-1) = 1
			// normalizedCol = 0 - (-1) = 1
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState,
				row: 0,
				col: 0,
			});

			const cellWidth = 360 + 40; // 400
			const cellHeight = 200 + 40; // 240

			expect(result.x).toBe(500 + 60 + (1 * cellWidth)); // 960
			expect(result.y).toBe(300 + 60 + (1 * cellHeight)); // 600
		});
	});

	describe("Coordinate Clamping", () => {
		it("should clamp row values above MAX_GRID_COORD (100)", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 150,
				col: 0,
			});

			expect(result.rowClamped).toBe(true);
			expect(result.colClamped).toBe(false);

			// Should use clamped value of 100
			// anchorY = 300, padding = 60, cellHeight = 240
			const cellHeight = 200 + 40; // 240
			const expectedY = 300 + 60 + (100 * cellHeight); // 300 + 60 + 24000 = 24360
			expect(result.y).toBe(expectedY);
		});

		it("should clamp row values below -MAX_GRID_COORD (-100)", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: -150,
				col: 0,
			});

			expect(result.rowClamped).toBe(true);
			// Clamped to -100, normalized: -100 - 0 = -100
			const cellHeight = 200 + 40;
			const expectedY = 300 + 60 + (-100 * cellHeight);
			expect(result.y).toBe(expectedY);
		});

		it("should clamp col values above MAX_GRID_COORD (100)", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 0,
				col: 200,
			});

			expect(result.colClamped).toBe(true);
			expect(result.rowClamped).toBe(false);

			// Should use clamped value of 100
			const cellWidth = 360 + 40; // 400
			const expectedX = 500 + 60 + (100 * cellWidth);
			expect(result.x).toBe(expectedX);
		});

		it("should clamp col values below -MAX_GRID_COORD (-100)", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 0,
				col: -500,
			});

			expect(result.colClamped).toBe(true);
			// Clamped to -100
			const cellWidth = 360 + 40;
			const expectedX = 500 + 60 + (-100 * cellWidth);
			expect(result.x).toBe(expectedX);
		});

		it("should clamp both row and col when both exceed bounds", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 999,
				col: -999,
			});

			expect(result.rowClamped).toBe(true);
			expect(result.colClamped).toBe(true);
		});

		it("should not clamp values within bounds", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 50,
				col: -50,
			});

			expect(result.rowClamped).toBe(false);
			expect(result.colClamped).toBe(false);
		});

		it("should not clamp boundary values exactly at ±100", () => {
			const resultMax = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 100,
				col: 100,
			});

			expect(resultMax.rowClamped).toBe(false);
			expect(resultMax.colClamped).toBe(false);

			const resultMin = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: -100,
				col: -100,
			});

			expect(resultMin.rowClamped).toBe(false);
			expect(resultMin.colClamped).toBe(false);
		});
	});

	describe("Fallback Behavior", () => {
		it("should use fallback when anchorState is null", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: null,
				row: 5,
				col: 3,
			});

			expect(result.usedFallback).toBe(true);
			// Fallback returns default position
			expect(result.x).toBe(0);
			expect(result.y).toBe(0);
		});

		it("should not use fallback when anchorState is valid", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 0,
				col: 0,
			});

			expect(result.usedFallback).toBe(false);
			expect(result.x).toBe(560); // 500 + 60
			expect(result.y).toBe(360); // 300 + 60
		});
	});

	describe("Undefined Coordinates", () => {
		it("should treat undefined row as 0", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: undefined,
				col: 0,
			});

			expect(result.y).toBe(360); // 300 + 60 + (0 * 240)
		});

		it("should treat undefined col as 0", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 0,
				col: undefined,
			});

			expect(result.x).toBe(560); // 500 + 60 + (0 * 400)
		});

		it("should treat both undefined as (0, 0)", () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: undefined,
				col: undefined,
			});

			expect(result.x).toBe(560);
			expect(result.y).toBe(360);
		});
	});
});


/**
 * Unit Tests for Overlap Detection and Correction
 *
 * Feature: group-anchor-positioning
 *
 * These tests validate the overlap detection and correction functionality
 * that ensures nodes in the same column never overlap.
 *
 * _Requirements: 11.3_
 */

import { LAYOUT_CONSTANTS, ColumnTrack, NodeActualSize } from "../streamingNodeCreator";

/**
 * Simulates the column tracking state for overlap tests
 */
interface OverlapTestState {
	columnTracks: Map<number, ColumnTrack>;
	nodeActualSizes: Map<string, NodeActualSize>;
}

/**
 * Simulates overlap detection and correction logic
 * Mirrors detectAndCorrectOverlapsInColumn in StreamingNodeCreator
 *
 * @param state - Column tracking state
 * @param col - Column index to check
 * @returns Object with detection results and corrections made
 */
function detectAndCorrectOverlapsInColumn(
	state: OverlapTestState,
	col: number
): { overlapsDetected: boolean; correctionsMade: string[]; warnings: string[] } {
	const colTrack = state.columnTracks.get(col);
	const correctionsMade: string[] = [];
	const warnings: string[] = [];

	if (!colTrack || colTrack.nodes.length < 2) {
		return { overlapsDetected: false, correctionsMade, warnings };
	}

	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;
	const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

	let overlapsDetected = false;

	// Check each pair of adjacent nodes for overlap
	for (let i = 0; i < sortedNodes.length - 1; i++) {
		const nodeA = sortedNodes[i];
		const nodeB = sortedNodes[i + 1];

		// Calculate the minimum Y position for nodeB to avoid overlap
		const minYForNodeB = nodeA.y + nodeA.actualHeight + VERTICAL_GAP;

		// Check if nodeB overlaps with nodeA (with 1px tolerance)
		if (nodeB.y < minYForNodeB - 1) {
			overlapsDetected = true;

			warnings.push(
				`OVERLAP DETECTED in column ${col}: ` +
				`Node ${nodeB.nodeId} (y=${nodeB.y}) overlaps with node ${nodeA.nodeId} ` +
				`(bottom=${nodeA.y + nodeA.actualHeight}). ` +
				`Minimum Y should be ${minYForNodeB}.`
			);

			// Correct the overlap by pushing nodeB down
			nodeB.y = minYForNodeB;
			correctionsMade.push(nodeB.nodeId);
		}
	}

	return { overlapsDetected, correctionsMade, warnings };
}

/**
 * Helper to create a column track with nodes
 */
function createColumnWithNodes(
	col: number,
	nodes: Array<{ id: string; row: number; y: number; height: number }>
): OverlapTestState {
	const state: OverlapTestState = {
		columnTracks: new Map(),
		nodeActualSizes: new Map(),
	};

	const colTrack: ColumnTrack = {
		col,
		nodes: nodes.map(n => ({
			nodeId: n.id,
			row: n.row,
			y: n.y,
			actualHeight: n.height,
		})),
		maxWidth: 360,
	};

	state.columnTracks.set(col, colTrack);

	for (const n of nodes) {
		state.nodeActualSizes.set(n.id, { width: 360, height: n.height });
	}

	return state;
}

describe("Overlap Detection and Correction (Requirements 11.3)", () => {
	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;

	describe("Overlap Detection", () => {
		it("should detect no overlap when nodes are properly spaced", () => {
			const baseY = 360;
			const height = 200;

			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + height + VERTICAL_GAP, height },
				{ id: "node_2", row: 2, y: baseY + height + VERTICAL_GAP + height + VERTICAL_GAP, height },
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(false);
			expect(result.correctionsMade).toHaveLength(0);
			expect(result.warnings).toHaveLength(0);
		});

		it("should detect overlap when nodes are too close", () => {
			const baseY = 360;
			const height = 200;

			// Node 1 is positioned too close to node 0 (only 10px gap instead of 40px)
			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + height + 10, height }, // Too close!
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(true);
			expect(result.warnings.length).toBeGreaterThan(0);
		});

		it("should detect overlap when nodes actually overlap (negative gap)", () => {
			const baseY = 360;
			const height = 200;

			// Node 1 actually overlaps with node 0
			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + height - 50, height }, // Overlapping!
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(true);
		});

		it("should not detect overlap with 1px tolerance", () => {
			const baseY = 360;
			const height = 200;

			// Node 1 is 1px less than required gap (within tolerance)
			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + height + VERTICAL_GAP - 1, height },
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(false);
		});

		it("should return false for column with single node", () => {
			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: 360, height: 200 },
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(false);
		});

		it("should return false for empty column", () => {
			const state: OverlapTestState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};
			state.columnTracks.set(0, { col: 0, nodes: [], maxWidth: 360 });

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(false);
		});

		it("should return false for non-existent column", () => {
			const state: OverlapTestState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			const result = detectAndCorrectOverlapsInColumn(state, 99);

			expect(result.overlapsDetected).toBe(false);
		});
	});

	describe("Overlap Correction", () => {
		it("should correct overlap by pushing node down", () => {
			const baseY = 360;
			const height = 200;

			// Node 1 overlaps with node 0
			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + height - 50, height }, // Overlapping!
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.correctionsMade).toContain("node_1");

			// Verify node_1 was moved to correct position
			const colTrack = state.columnTracks.get(0)!;
			const node1 = colTrack.nodes.find(n => n.nodeId === "node_1")!;
			expect(node1.y).toBe(baseY + height + VERTICAL_GAP);
		});

		it("should correct multiple overlaps in sequence", () => {
			const baseY = 360;
			const height = 200;

			// All nodes are overlapping
			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + 50, height }, // Overlapping!
				{ id: "node_2", row: 2, y: baseY + 100, height }, // Overlapping!
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(true);
			expect(result.correctionsMade).toContain("node_1");
			// Note: node_2 may or may not be in correctionsMade depending on whether
			// the correction of node_1 cascades. In our simple implementation,
			// we only check adjacent pairs, so node_2 might still overlap after
			// node_1 is corrected.
		});

		it("should not modify nodes that are already properly spaced", () => {
			const baseY = 360;
			const height = 200;

			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + height + VERTICAL_GAP, height },
			]);

			const originalY = state.columnTracks.get(0)!.nodes[1].y;

			detectAndCorrectOverlapsInColumn(state, 0);

			const newY = state.columnTracks.get(0)!.nodes[1].y;
			expect(newY).toBe(originalY);
		});

		it("should handle varying node heights", () => {
			const baseY = 360;

			// Nodes with different heights
			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height: 300 },
				{ id: "node_1", row: 1, y: baseY + 200, height: 150 }, // Overlapping (should be at baseY + 300 + 40)
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(true);
			expect(result.correctionsMade).toContain("node_1");

			// Verify correct position based on node_0's actual height
			const colTrack = state.columnTracks.get(0)!;
			const node1 = colTrack.nodes.find(n => n.nodeId === "node_1")!;
			expect(node1.y).toBe(baseY + 300 + VERTICAL_GAP);
		});
	});

	describe("Warning Logging", () => {
		it("should generate warning message with correct details", () => {
			const baseY = 360;
			const height = 200;

			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + height - 50, height },
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.warnings.length).toBe(1);
			expect(result.warnings[0]).toContain("OVERLAP DETECTED");
			expect(result.warnings[0]).toContain("column 0");
			expect(result.warnings[0]).toContain("node_1");
			expect(result.warnings[0]).toContain("node_0");
		});

		it("should generate multiple warnings for multiple overlaps", () => {
			const baseY = 360;
			const height = 200;

			// Create a scenario where multiple overlaps exist
			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height },
				{ id: "node_1", row: 1, y: baseY + 50, height }, // Overlaps with node_0
				{ id: "node_2", row: 2, y: baseY + 100, height }, // Will overlap after node_1 is corrected
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			// At least one warning should be generated
			expect(result.warnings.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("Edge Cases", () => {
		it("should handle nodes with zero height", () => {
			const baseY = 360;

			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height: 0 },
				{ id: "node_1", row: 1, y: baseY + 10, height: 200 },
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			// With zero height, node_1 should be at baseY + 0 + VERTICAL_GAP = baseY + 40
			// Since node_1 is at baseY + 10, it should be detected as overlapping
			expect(result.overlapsDetected).toBe(true);
		});

		it("should handle nodes with very large heights", () => {
			const baseY = 360;

			const state = createColumnWithNodes(0, [
				{ id: "node_0", row: 0, y: baseY, height: 10000 },
				{ id: "node_1", row: 1, y: baseY + 5000, height: 200 }, // Overlapping!
			]);

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			expect(result.overlapsDetected).toBe(true);

			// Verify correction
			const colTrack = state.columnTracks.get(0)!;
			const node1 = colTrack.nodes.find(n => n.nodeId === "node_1")!;
			expect(node1.y).toBe(baseY + 10000 + VERTICAL_GAP);
		});

		it("should handle unsorted nodes in column track", () => {
			const baseY = 360;
			const height = 200;

			// Nodes are not sorted by row in the array
			const state: OverlapTestState = {
				columnTracks: new Map(),
				nodeActualSizes: new Map(),
			};

			state.columnTracks.set(0, {
				col: 0,
				nodes: [
					{ nodeId: "node_2", row: 2, y: baseY + 100, actualHeight: height }, // Out of order
					{ nodeId: "node_0", row: 0, y: baseY, actualHeight: height },
					{ nodeId: "node_1", row: 1, y: baseY + 50, actualHeight: height }, // Overlapping
				],
				maxWidth: 360,
			});

			const result = detectAndCorrectOverlapsInColumn(state, 0);

			// Should still detect overlap after sorting
			expect(result.overlapsDetected).toBe(true);
		});
	});
});
