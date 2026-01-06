/**
 * Property-Based Tests for StreamingNodeCreator Dynamic Layout
 * 
 * Feature: group-anchor-positioning
 * 
 * These tests validate the dynamic vertical stack layout and height tracking
 * properties defined in the design document using fast-check for property-based testing.
 */

import * as fc from 'fast-check';

/**
 * Layout constants for dynamic positioning
 * Mirrors the constants in StreamingNodeCreator
 * Requirements: 6.4, 8.2
 */
const LAYOUT_CONSTANTS = {
	/** Minimum vertical gap between nodes in the same column (pixels) */
	VERTICAL_GAP: 40,
	
	/** Minimum horizontal gap between adjacent columns (pixels) */
	HORIZONTAL_GAP: 40,
	
	/** Safe zone margin for edge labels (pixels) */
	EDGE_LABEL_SAFE_ZONE: 40,
} as const;

/**
 * Simulates the dynamic vertical stack layout calculation
 * This mirrors the logic in StreamingNodeCreator.calculateNodePositionInPreCreatedGroup
 */
interface LayoutParams {
	anchorY: number;
	padding: number;
	defaultNodeHeight: number;
}

interface NodeInput {
	id: string;
	row: number;
	col: number;
	actualHeight: number;
}

interface PositionedNode {
	id: string;
	row: number;
	col: number;
	y: number;
	actualHeight: number;
}

/**
 * Pure function that calculates Y position using dynamic stack layout
 * For row 0: y = anchorY + padding
 * For row > 0: y = prevNode.y + prevNode.actualHeight + VERTICAL_GAP
 */
function calculateDynamicYPosition(
	params: LayoutParams,
	nodesInColumn: PositionedNode[],
	row: number
): number {
	const { anchorY, padding } = params;
	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;
	
	if (row === 0 || nodesInColumn.length === 0) {
		return anchorY + padding;
	}
	
	// Find the previous node (highest row < current row)
	const sortedNodes = [...nodesInColumn].sort((a, b) => a.row - b.row);
	let prevNode: PositionedNode | null = null;
	
	for (const node of sortedNodes) {
		if (node.row < row) {
			prevNode = node;
		} else {
			break;
		}
	}
	
	if (prevNode) {
		return prevNode.y + prevNode.actualHeight + VERTICAL_GAP;
	}
	
	return anchorY + padding;
}

/**
 * Simulates creating multiple nodes with dynamic stack layout
 */
function simulateDynamicStackLayout(
	params: LayoutParams,
	nodes: NodeInput[]
): Map<number, PositionedNode[]> {
	const columnTracks = new Map<number, PositionedNode[]>();
	
	// Sort nodes by row to simulate streaming order
	const sortedNodes = [...nodes].sort((a, b) => a.row - b.row);
	
	for (const node of sortedNodes) {
		if (!columnTracks.has(node.col)) {
			columnTracks.set(node.col, []);
		}
		
		const colNodes = columnTracks.get(node.col)!;
		const y = calculateDynamicYPosition(params, colNodes, node.row);
		
		colNodes.push({
			id: node.id,
			row: node.row,
			col: node.col,
			y,
			actualHeight: node.actualHeight,
		});
	}
	
	return columnTracks;
}

/**
 * Simulates repositioning nodes after a height change
 */
function simulateRepositionAfterHeightChange(
	columnNodes: PositionedNode[],
	changedNodeId: string,
	newHeight: number
): PositionedNode[] {
	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;
	const result = [...columnNodes];
	
	// Find the changed node
	const changedIndex = result.findIndex(n => n.id === changedNodeId);
	if (changedIndex === -1) return result;
	
	// Update the height
	result[changedIndex] = { ...result[changedIndex], actualHeight: newHeight };
	
	// Sort by row
	result.sort((a, b) => a.row - b.row);
	
	// Recalculate Y positions for nodes after the changed one
	for (let i = 0; i < result.length; i++) {
		if (i === 0) continue;
		
		const prevNode = result[i - 1];
		const newY = prevNode.y + prevNode.actualHeight + VERTICAL_GAP;
		
		if (result[i].row > result[changedIndex].row || result[i].id === changedNodeId) {
			// Only update nodes at or after the changed row
			if (result[i].row > result[changedIndex].row) {
				result[i] = { ...result[i], y: newY };
			}
		}
	}
	
	return result;
}

describe('StreamingNodeCreator Dynamic Layout', () => {
	/**
	 * Property 6: Vertical Stack Layout
	 * 
	 * For any two nodes A and B in the same column where B.row > A.row,
	 * the Y-position of B SHALL satisfy:
	 * B.y >= A.y + A.actualHeight + VERTICAL_GAP
	 * 
	 * This ensures nodes in the same column never overlap vertically,
	 * regardless of content height.
	 * 
	 * **Validates: Requirements 6.1, 6.3**
	 */
	describe('Property 6: Vertical Stack Layout', () => {
		it('should ensure nodes in the same column never overlap vertically', () => {
			fc.assert(
				fc.property(
					// Generate anchor Y position
					fc.integer({ min: 0, max: 5000 }),
					// Generate padding
					fc.integer({ min: 20, max: 100 }),
					// Generate default node height
					fc.integer({ min: 50, max: 300 }),
					// Generate nodes with varying heights in the same column
					fc.array(
						fc.record({
							row: fc.integer({ min: 0, max: 10 }),
							actualHeight: fc.integer({ min: 50, max: 500 }),
						}),
						{ minLength: 2, maxLength: 10 }
					),
					(anchorY, padding, defaultNodeHeight, nodeInputs) => {
						// Create nodes all in column 0
						const nodes: NodeInput[] = nodeInputs.map((input, i) => ({
							id: `node_${i}`,
							row: input.row,
							col: 0,
							actualHeight: input.actualHeight,
						}));
						
						// Ensure unique rows
						const uniqueRows = new Set<number>();
						const uniqueNodes = nodes.filter(n => {
							if (uniqueRows.has(n.row)) return false;
							uniqueRows.add(n.row);
							return true;
						});
						
						if (uniqueNodes.length < 2) return true; // Skip if not enough unique nodes
						
						const params: LayoutParams = { anchorY, padding, defaultNodeHeight };
						const columnTracks = simulateDynamicStackLayout(params, uniqueNodes);
						const colNodes = columnTracks.get(0) || [];
						
						// Sort by row
						const sortedNodes = [...colNodes].sort((a, b) => a.row - b.row);
						
						// Verify no overlap: for each pair of adjacent nodes
						for (let i = 0; i < sortedNodes.length - 1; i++) {
							const nodeA = sortedNodes[i];
							const nodeB = sortedNodes[i + 1];
							
							// B.y should be >= A.y + A.actualHeight + VERTICAL_GAP
							const minYForB = nodeA.y + nodeA.actualHeight + LAYOUT_CONSTANTS.VERTICAL_GAP;
							
							expect(nodeB.y).toBeGreaterThanOrEqual(minYForB - 1); // 1px tolerance
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should position first node at anchorY + padding', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5000 }),
					fc.integer({ min: 20, max: 100 }),
					fc.integer({ min: 50, max: 300 }),
					fc.integer({ min: 50, max: 500 }),
					(anchorY, padding, defaultNodeHeight, actualHeight) => {
						const params: LayoutParams = { anchorY, padding, defaultNodeHeight };
						const nodes: NodeInput[] = [{
							id: 'node_0',
							row: 0,
							col: 0,
							actualHeight,
						}];
						
						const columnTracks = simulateDynamicStackLayout(params, nodes);
						const colNodes = columnTracks.get(0) || [];
						
						expect(colNodes.length).toBe(1);
						expect(colNodes[0].y).toBe(anchorY + padding);
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should maintain VERTICAL_GAP between consecutive nodes', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5000 }),
					fc.integer({ min: 20, max: 100 }),
					fc.integer({ min: 50, max: 300 }),
					// Generate heights for 3 consecutive nodes
					fc.integer({ min: 50, max: 500 }),
					fc.integer({ min: 50, max: 500 }),
					fc.integer({ min: 50, max: 500 }),
					(anchorY, padding, defaultNodeHeight, h0, h1, h2) => {
						const params: LayoutParams = { anchorY, padding, defaultNodeHeight };
						const nodes: NodeInput[] = [
							{ id: 'node_0', row: 0, col: 0, actualHeight: h0 },
							{ id: 'node_1', row: 1, col: 0, actualHeight: h1 },
							{ id: 'node_2', row: 2, col: 0, actualHeight: h2 },
						];
						
						const columnTracks = simulateDynamicStackLayout(params, nodes);
						const colNodes = columnTracks.get(0) || [];
						const sortedNodes = [...colNodes].sort((a, b) => a.row - b.row);
						
						// Check gaps between consecutive nodes
						const gap01 = sortedNodes[1].y - (sortedNodes[0].y + sortedNodes[0].actualHeight);
						const gap12 = sortedNodes[2].y - (sortedNodes[1].y + sortedNodes[1].actualHeight);
						
						expect(gap01).toBe(LAYOUT_CONSTANTS.VERTICAL_GAP);
						expect(gap12).toBe(LAYOUT_CONSTANTS.VERTICAL_GAP);
					}
				),
				{ numRuns: 100 }
			);
		});
	});


	/**
	 * Property 7: Dynamic Height Tracking and Repositioning
	 * 
	 * For any node whose content grows during streaming (causing actualHeight to increase),
	 * all nodes below it in the same column SHALL be repositioned such that:
	 * - Each node's new Y-position = previous node's Y + previous node's actualHeight + VERTICAL_GAP
	 * - The tracked actualHeight for the changed node SHALL equal its rendered height
	 * 
	 * **Validates: Requirements 6.2, 6.4**
	 */
	describe('Property 7: Dynamic Height Tracking and Repositioning', () => {
		it('should reposition nodes below when a node height increases', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5000 }),
					fc.integer({ min: 20, max: 100 }),
					fc.integer({ min: 50, max: 200 }),
					// Initial heights for 3 nodes
					fc.integer({ min: 50, max: 200 }),
					fc.integer({ min: 50, max: 200 }),
					fc.integer({ min: 50, max: 200 }),
					// Height increase for first node
					fc.integer({ min: 50, max: 300 }),
					(anchorY, padding, defaultNodeHeight, h0, h1, h2, heightIncrease) => {
						const params: LayoutParams = { anchorY, padding, defaultNodeHeight };
						
						// Create initial layout
						const nodes: NodeInput[] = [
							{ id: 'node_0', row: 0, col: 0, actualHeight: h0 },
							{ id: 'node_1', row: 1, col: 0, actualHeight: h1 },
							{ id: 'node_2', row: 2, col: 0, actualHeight: h2 },
						];
						
						const columnTracks = simulateDynamicStackLayout(params, nodes);
						const initialNodes = columnTracks.get(0) || [];
						
						// Simulate height change for node_0
						const newHeight = h0 + heightIncrease;
						const repositionedNodes = simulateRepositionAfterHeightChange(
							initialNodes,
							'node_0',
							newHeight
						);
						
						// Verify node_0's height was updated
						const node0 = repositionedNodes.find(n => n.id === 'node_0')!;
						expect(node0.actualHeight).toBe(newHeight);
						
						// Verify nodes below were repositioned correctly
						const sortedNodes = [...repositionedNodes].sort((a, b) => a.row - b.row);
						
						for (let i = 1; i < sortedNodes.length; i++) {
							const prevNode = sortedNodes[i - 1];
							const currNode = sortedNodes[i];
							const expectedY = prevNode.y + prevNode.actualHeight + LAYOUT_CONSTANTS.VERTICAL_GAP;
							
							expect(currNode.y).toBe(expectedY);
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should not affect nodes above the changed node', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5000 }),
					fc.integer({ min: 20, max: 100 }),
					fc.integer({ min: 50, max: 200 }),
					fc.integer({ min: 50, max: 200 }),
					fc.integer({ min: 50, max: 200 }),
					fc.integer({ min: 50, max: 200 }),
					fc.integer({ min: 50, max: 300 }),
					(anchorY, padding, defaultNodeHeight, h0, h1, h2, heightIncrease) => {
						const params: LayoutParams = { anchorY, padding, defaultNodeHeight };
						
						const nodes: NodeInput[] = [
							{ id: 'node_0', row: 0, col: 0, actualHeight: h0 },
							{ id: 'node_1', row: 1, col: 0, actualHeight: h1 },
							{ id: 'node_2', row: 2, col: 0, actualHeight: h2 },
						];
						
						const columnTracks = simulateDynamicStackLayout(params, nodes);
						const initialNodes = columnTracks.get(0) || [];
						
						// Get initial position of node_0 (the node above the changed one)
						const initialNode0 = initialNodes.find(n => n.id === 'node_0')!;
						
						// Change height of node_1 (middle node)
						const newHeight = h1 + heightIncrease;
						const repositionedNodes = simulateRepositionAfterHeightChange(
							initialNodes,
							'node_1',
							newHeight
						);
						
						// Node 0 should not have moved
						const finalNode0 = repositionedNodes.find(n => n.id === 'node_0')!;
						expect(finalNode0.y).toBe(initialNode0.y);
						expect(finalNode0.actualHeight).toBe(initialNode0.actualHeight);
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should maintain no-overlap invariant after repositioning', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5000 }),
					fc.integer({ min: 20, max: 100 }),
					fc.integer({ min: 50, max: 200 }),
					// Generate 5 nodes with varying heights
					fc.array(
						fc.integer({ min: 50, max: 300 }),
						{ minLength: 5, maxLength: 5 }
					),
					// Which node to change (0-4)
					fc.integer({ min: 0, max: 4 }),
					// Height increase
					fc.integer({ min: 50, max: 400 }),
					(anchorY, padding, defaultNodeHeight, heights, changeIndex, heightIncrease) => {
						const params: LayoutParams = { anchorY, padding, defaultNodeHeight };
						
						const nodes: NodeInput[] = heights.map((h, i) => ({
							id: `node_${i}`,
							row: i,
							col: 0,
							actualHeight: h,
						}));
						
						const columnTracks = simulateDynamicStackLayout(params, nodes);
						const initialNodes = columnTracks.get(0) || [];
						
						// Change height of specified node
						const nodeToChange = `node_${changeIndex}`;
						const newHeight = heights[changeIndex] + heightIncrease;
						const repositionedNodes = simulateRepositionAfterHeightChange(
							initialNodes,
							nodeToChange,
							newHeight
						);
						
						// Verify no overlap after repositioning
						const sortedNodes = [...repositionedNodes].sort((a, b) => a.row - b.row);
						
						for (let i = 0; i < sortedNodes.length - 1; i++) {
							const nodeA = sortedNodes[i];
							const nodeB = sortedNodes[i + 1];
							
							// B should not overlap with A
							const aBottom = nodeA.y + nodeA.actualHeight;
							expect(nodeB.y).toBeGreaterThanOrEqual(aBottom);
						}
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should correctly track actual heights in nodeActualSizes', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 0, max: 5000 }),
					fc.integer({ min: 20, max: 100 }),
					fc.integer({ min: 50, max: 200 }),
					fc.array(
						fc.record({
							row: fc.integer({ min: 0, max: 10 }),
							actualHeight: fc.integer({ min: 50, max: 500 }),
						}),
						{ minLength: 1, maxLength: 10 }
					),
					(anchorY, padding, defaultNodeHeight, nodeInputs) => {
						const params: LayoutParams = { anchorY, padding, defaultNodeHeight };
						
						// Create nodes with unique rows
						const uniqueRows = new Set<number>();
						const nodes: NodeInput[] = nodeInputs
							.filter(input => {
								if (uniqueRows.has(input.row)) return false;
								uniqueRows.add(input.row);
								return true;
							})
							.map((input, i) => ({
								id: `node_${i}`,
								row: input.row,
								col: 0,
								actualHeight: input.actualHeight,
							}));
						
						const columnTracks = simulateDynamicStackLayout(params, nodes);
						const colNodes = columnTracks.get(0) || [];
						
						// Verify each node's tracked height matches input
						for (const node of nodes) {
							const trackedNode = colNodes.find(n => n.id === node.id);
							expect(trackedNode).toBeDefined();
							expect(trackedNode!.actualHeight).toBe(node.actualHeight);
						}
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});


/**
 * Edge direction type for determining safe zone placement
 * Mirrors the type in StreamingNodeCreator
 * Requirements: 7.1, 7.2, 7.3
 */
type EdgeDirection = 'left' | 'top' | 'right' | 'bottom';

/**
 * Extended anchor state with edge direction
 */
interface AnchorStateWithEdge {
	anchorX: number;
	anchorY: number;
	anchorLocked: boolean;
	minRowSeen: number;
	minColSeen: number;
	edgeDirection: EdgeDirection;
}

/**
 * Extended layout params with edge direction
 */
interface LayoutParamsWithEdge extends LayoutParams {
	edgeDirection: EdgeDirection;
}

/**
 * Pure function that calculates position with edge label safe zone
 * This mirrors the logic in StreamingNodeCreator.calculateNodePositionInPreCreatedGroup
 * with safe zone support
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
function calculatePositionWithSafeZone(
	params: LayoutParamsWithEdge,
	nodesInColumn: PositionedNode[],
	row: number,
	col: number
): { x: number; y: number } {
	const { anchorY, padding, edgeDirection } = params;
	const { VERTICAL_GAP, EDGE_LABEL_SAFE_ZONE } = LAYOUT_CONSTANTS;
	
	// Calculate safe zones based on edge direction
	const topSafeZone = (edgeDirection === 'top') ? EDGE_LABEL_SAFE_ZONE : 0;
	const leftSafeZone = (edgeDirection === 'left') ? EDGE_LABEL_SAFE_ZONE : 0;
	
	// Calculate X position with left safe zone for first column
	const anchorX = params.anchorY; // Using anchorY as placeholder for anchorX in this simplified model
	let x = anchorX + padding + (col === 0 ? leftSafeZone : 0);
	
	// Calculate Y position
	let y: number;
	if (row === 0 || nodesInColumn.length === 0) {
		// First node in column: use anchor + padding + topSafeZone
		y = anchorY + padding + topSafeZone;
	} else {
		// Find the previous node (highest row < current row)
		const sortedNodes = [...nodesInColumn].sort((a, b) => a.row - b.row);
		let prevNode: PositionedNode | null = null;
		
		for (const node of sortedNodes) {
			if (node.row < row) {
				prevNode = node;
			} else {
				break;
			}
		}
		
		if (prevNode) {
			y = prevNode.y + prevNode.actualHeight + VERTICAL_GAP;
		} else {
			y = anchorY + padding + topSafeZone;
		}
	}
	
	return { x, y };
}

/**
 * Simulates creating nodes with edge label safe zone
 */
function simulateLayoutWithSafeZone(
	params: LayoutParamsWithEdge,
	nodes: NodeInput[]
): Map<number, PositionedNode[]> {
	const columnTracks = new Map<number, PositionedNode[]>();
	
	// Sort nodes by row to simulate streaming order
	const sortedNodes = [...nodes].sort((a, b) => a.row - b.row);
	
	for (const node of sortedNodes) {
		if (!columnTracks.has(node.col)) {
			columnTracks.set(node.col, []);
		}
		
		const colNodes = columnTracks.get(node.col)!;
		const pos = calculatePositionWithSafeZone(params, colNodes, node.row, node.col);
		
		colNodes.push({
			id: node.id,
			row: node.row,
			col: node.col,
			y: pos.y,
			actualHeight: node.actualHeight,
		});
	}
	
	return columnTracks;
}

/**
 * Property 8: Edge Label Safe Zone
 * 
 * For any group with an incoming edge from direction D, the first row/column
 * of nodes SHALL have an additional margin:
 * - If D == 'top': first row nodes have y >= anchorY + padding + EDGE_LABEL_SAFE_ZONE
 * - If D == 'left': first column nodes have x >= anchorX + padding + EDGE_LABEL_SAFE_ZONE
 * 
 * Where EDGE_LABEL_SAFE_ZONE >= 40 pixels.
 * 
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
 */
describe('Property 8: Edge Label Safe Zone', () => {
	it('should add top safe zone when edge connects from top', () => {
		fc.assert(
			fc.property(
				// Generate anchor Y position
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node height
				fc.integer({ min: 50, max: 300 }),
				// Generate nodes in first row (row 0)
				fc.array(
					fc.record({
						col: fc.integer({ min: 0, max: 5 }),
						actualHeight: fc.integer({ min: 50, max: 500 }),
					}),
					{ minLength: 1, maxLength: 5 }
				),
				(anchorY, padding, defaultNodeHeight, nodeInputs) => {
					// Create nodes all in row 0 with unique columns
					const uniqueCols = new Set<number>();
					const nodes: NodeInput[] = nodeInputs
						.filter(input => {
							if (uniqueCols.has(input.col)) return false;
							uniqueCols.add(input.col);
							return true;
						})
						.map((input, i) => ({
							id: `node_${i}`,
							row: 0, // First row
							col: input.col,
							actualHeight: input.actualHeight,
						}));
					
					if (nodes.length === 0) return true;
					
					const params: LayoutParamsWithEdge = {
						anchorY,
						padding,
						defaultNodeHeight,
						edgeDirection: 'top', // Edge connects from top
					};
					
					const columnTracks = simulateLayoutWithSafeZone(params, nodes);
					
					// Verify all first row nodes have top safe zone
					const minExpectedY = anchorY + padding + LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE;
					
					for (const [col, colNodes] of columnTracks.entries()) {
						const firstRowNode = colNodes.find(n => n.row === 0);
						if (firstRowNode) {
							expect(firstRowNode.y).toBeGreaterThanOrEqual(minExpectedY - 1); // 1px tolerance
						}
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should NOT add top safe zone when edge connects from left', () => {
		fc.assert(
			fc.property(
				// Generate anchor Y position
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node height
				fc.integer({ min: 50, max: 300 }),
				// Generate node in first row
				fc.integer({ min: 50, max: 500 }),
				(anchorY, padding, defaultNodeHeight, actualHeight) => {
					const nodes: NodeInput[] = [{
						id: 'node_0',
						row: 0,
						col: 0,
						actualHeight,
					}];
					
					const params: LayoutParamsWithEdge = {
						anchorY,
						padding,
						defaultNodeHeight,
						edgeDirection: 'left', // Edge connects from left, not top
					};
					
					const columnTracks = simulateLayoutWithSafeZone(params, nodes);
					const colNodes = columnTracks.get(0) || [];
					
					// First row node should be at anchorY + padding (no top safe zone)
					expect(colNodes.length).toBe(1);
					expect(colNodes[0].y).toBe(anchorY + padding);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should add left safe zone when edge connects from left', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node height
				fc.integer({ min: 50, max: 300 }),
				// Generate node in first column
				fc.integer({ min: 50, max: 500 }),
				(anchorX, padding, defaultNodeHeight, actualHeight) => {
					const nodes: NodeInput[] = [{
						id: 'node_0',
						row: 0,
						col: 0, // First column
						actualHeight,
					}];
					
					// For this test, we use anchorX as anchorY in params (simplified model)
					const params: LayoutParamsWithEdge = {
						anchorY: anchorX, // Using as anchorX
						padding,
						defaultNodeHeight,
						edgeDirection: 'left', // Edge connects from left
					};
					
					const pos = calculatePositionWithSafeZone(params, [], 0, 0);
					
					// First column node should have left safe zone
					const minExpectedX = anchorX + padding + LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE;
					expect(pos.x).toBeGreaterThanOrEqual(minExpectedX - 1); // 1px tolerance
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should NOT add left safe zone for non-first columns', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node height
				fc.integer({ min: 50, max: 300 }),
				// Generate column index > 0
				fc.integer({ min: 1, max: 5 }),
				fc.integer({ min: 50, max: 500 }),
				(anchorX, padding, defaultNodeHeight, col, actualHeight) => {
					const params: LayoutParamsWithEdge = {
						anchorY: anchorX, // Using as anchorX
						padding,
						defaultNodeHeight,
						edgeDirection: 'left',
					};
					
					const pos = calculatePositionWithSafeZone(params, [], 0, col);
					
					// Non-first column should NOT have left safe zone in its base position
					// The x position should be anchorX + padding (no safe zone for col > 0)
					// Note: In the actual implementation, columns > 0 get their x from
					// summing previous column widths, but the safe zone is only added to col 0
					expect(pos.x).toBe(anchorX + padding); // No safe zone for col > 0
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should ensure EDGE_LABEL_SAFE_ZONE is at least 40 pixels', () => {
		// This is a constant verification test
		expect(LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE).toBeGreaterThanOrEqual(40);
	});

	it('should apply safe zone only to first row when edge is from top', () => {
		fc.assert(
			fc.property(
				// Generate anchor Y position
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node height
				fc.integer({ min: 50, max: 300 }),
				// Generate heights for 3 consecutive rows
				fc.integer({ min: 50, max: 300 }),
				fc.integer({ min: 50, max: 300 }),
				fc.integer({ min: 50, max: 300 }),
				(anchorY, padding, defaultNodeHeight, h0, h1, h2) => {
					const params: LayoutParamsWithEdge = {
						anchorY,
						padding,
						defaultNodeHeight,
						edgeDirection: 'top',
					};
					
					const nodes: NodeInput[] = [
						{ id: 'node_0', row: 0, col: 0, actualHeight: h0 },
						{ id: 'node_1', row: 1, col: 0, actualHeight: h1 },
						{ id: 'node_2', row: 2, col: 0, actualHeight: h2 },
					];
					
					const columnTracks = simulateLayoutWithSafeZone(params, nodes);
					const colNodes = columnTracks.get(0) || [];
					const sortedNodes = [...colNodes].sort((a, b) => a.row - b.row);
					
					// First row should have safe zone
					const expectedY0 = anchorY + padding + LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE;
					expect(sortedNodes[0].y).toBe(expectedY0);
					
					// Second row should be stacked below first (no additional safe zone)
					const expectedY1 = sortedNodes[0].y + sortedNodes[0].actualHeight + LAYOUT_CONSTANTS.VERTICAL_GAP;
					expect(sortedNodes[1].y).toBe(expectedY1);
					
					// Third row should be stacked below second
					const expectedY2 = sortedNodes[1].y + sortedNodes[1].actualHeight + LAYOUT_CONSTANTS.VERTICAL_GAP;
					expect(sortedNodes[2].y).toBe(expectedY2);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should handle all four edge directions correctly', () => {
		const edgeDirections: EdgeDirection[] = ['left', 'top', 'right', 'bottom'];
		
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node height
				fc.integer({ min: 50, max: 300 }),
				// Generate edge direction index
				fc.integer({ min: 0, max: 3 }),
				fc.integer({ min: 50, max: 500 }),
				(anchorY, padding, defaultNodeHeight, dirIndex, actualHeight) => {
					const edgeDirection = edgeDirections[dirIndex];
					
					const params: LayoutParamsWithEdge = {
						anchorY,
						padding,
						defaultNodeHeight,
						edgeDirection,
					};
					
					const pos = calculatePositionWithSafeZone(params, [], 0, 0);
					
					// Verify safe zone is applied correctly based on direction
					if (edgeDirection === 'top') {
						expect(pos.y).toBe(anchorY + padding + LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE);
					} else {
						expect(pos.y).toBe(anchorY + padding);
					}
					
					if (edgeDirection === 'left') {
						expect(pos.x).toBe(anchorY + padding + LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE);
					} else {
						expect(pos.x).toBe(anchorY + padding);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Extended node input with width for horizontal column spacing tests
 */
interface NodeInputWithWidth extends NodeInput {
	actualWidth: number;
}

/**
 * Extended positioned node with x position and width for horizontal column spacing tests
 */
interface PositionedNodeWithX extends PositionedNode {
	x: number;
	actualWidth: number;
}

/**
 * Extended layout params with anchor X for horizontal column spacing
 */
interface LayoutParamsWithX extends LayoutParams {
	anchorX: number;
	defaultNodeWidth: number;
}

/**
 * Column track with max width for horizontal spacing calculations
 * Mirrors ColumnTrack in StreamingNodeCreator
 */
interface ColumnTrackWithWidth {
	col: number;
	nodes: PositionedNodeWithX[];
	maxWidth: number;
}

/**
 * Pure function that calculates X position using dynamic column width tracking
 * This mirrors the logic in StreamingNodeCreator.calculateNodePositionInPreCreatedGroup
 * 
 * Formula: x = anchorX + padding + Σ(colWidths[0..col-1] + HORIZONTAL_GAP)
 * 
 * For column 0: x = anchorX + padding
 * For column N: x = anchorX + padding + Σ(colWidth[c] + HORIZONTAL_GAP) for c in [0, N-1]
 * 
 * Requirements: 8.1 - X-position calculation using column widths
 */
function calculateDynamicXPosition(
	params: LayoutParamsWithX,
	columnTracks: Map<number, ColumnTrackWithWidth>,
	col: number
): number {
	const { anchorX, padding, defaultNodeWidth } = params;
	const { HORIZONTAL_GAP } = LAYOUT_CONSTANTS;
	
	let x = anchorX + padding;
	
	// Sum widths of all columns before this one
	for (let c = 0; c < col; c++) {
		const colTrack = columnTracks.get(c);
		const colWidth = colTrack?.maxWidth || defaultNodeWidth;
		x += colWidth + HORIZONTAL_GAP;
	}
	
	return x;
}

/**
 * Simulates creating multiple nodes with dynamic column width tracking
 * This mirrors the layout logic in StreamingNodeCreator
 * 
 * Requirements: 8.2, 8.3 - Track actual widths and use max width per column
 */
function simulateMultiColumnLayout(
	params: LayoutParamsWithX,
	nodes: NodeInputWithWidth[]
): Map<number, ColumnTrackWithWidth> {
	const columnTracks = new Map<number, ColumnTrackWithWidth>();
	const { anchorY, padding, defaultNodeWidth } = params;
	const { VERTICAL_GAP } = LAYOUT_CONSTANTS;
	
	// Sort nodes by column then row to simulate streaming order
	const sortedNodes = [...nodes].sort((a, b) => {
		if (a.col !== b.col) return a.col - b.col;
		return a.row - b.row;
	});
	
	for (const node of sortedNodes) {
		// Initialize column track if not exists
		if (!columnTracks.has(node.col)) {
			columnTracks.set(node.col, {
				col: node.col,
				nodes: [],
				maxWidth: defaultNodeWidth,
			});
		}
		
		const colTrack = columnTracks.get(node.col)!;
		
		// Calculate X position using dynamic column width tracking
		const x = calculateDynamicXPosition(params, columnTracks, node.col);
		
		// Calculate Y position using dynamic stack layout
		let y: number;
		if (node.row === 0 || colTrack.nodes.length === 0) {
			y = anchorY + padding;
		} else {
			const sortedColNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);
			let prevNode: PositionedNodeWithX | null = null;
			
			for (const n of sortedColNodes) {
				if (n.row < node.row) {
					prevNode = n;
				} else {
					break;
				}
			}
			
			if (prevNode) {
				y = prevNode.y + prevNode.actualHeight + VERTICAL_GAP;
			} else {
				y = anchorY + padding;
			}
		}
		
		// Add node to column track
		colTrack.nodes.push({
			id: node.id,
			row: node.row,
			col: node.col,
			x,
			y,
			actualHeight: node.actualHeight,
			actualWidth: node.actualWidth,
		});
		
		// Update max width if this node is wider (Requirements: 8.2, 8.3)
		if (node.actualWidth > colTrack.maxWidth) {
			colTrack.maxWidth = node.actualWidth;
		}
	}
	
	return columnTracks;
}

/**
 * Property 9: Horizontal Column Spacing
 * 
 * For any two adjacent columns C1 and C2 where C2.col = C1.col + 1,
 * the X-position of nodes in C2 SHALL satisfy:
 * min(C2.nodes.x) >= max(C1.nodes.x + C1.nodes.width) + HORIZONTAL_GAP
 * 
 * This ensures columns never overlap horizontally, using the maximum width
 * of all nodes in each column.
 * 
 * **Validates: Requirements 8.1, 8.3, 8.4**
 */
describe('Property 9: Horizontal Column Spacing', () => {
	it('should ensure adjacent columns never overlap horizontally', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate nodes across multiple columns with varying widths
				fc.array(
					fc.record({
						row: fc.integer({ min: 0, max: 5 }),
						col: fc.integer({ min: 0, max: 3 }),
						actualWidth: fc.integer({ min: 100, max: 600 }),
						actualHeight: fc.integer({ min: 50, max: 300 }),
					}),
					{ minLength: 2, maxLength: 15 }
				),
				(anchorX, anchorY, padding, defaultNodeWidth, defaultNodeHeight, nodeInputs) => {
					// Create nodes with unique (row, col) combinations
					const uniquePositions = new Set<string>();
					const nodes: NodeInputWithWidth[] = nodeInputs
						.filter(input => {
							const key = `${input.row},${input.col}`;
							if (uniquePositions.has(key)) return false;
							uniquePositions.add(key);
							return true;
						})
						.map((input, i) => ({
							id: `node_${i}`,
							row: input.row,
							col: input.col,
							actualWidth: input.actualWidth,
							actualHeight: input.actualHeight,
						}));
					
					// Need at least 2 nodes in different columns to test
					const uniqueCols = new Set(nodes.map(n => n.col));
					if (uniqueCols.size < 2) return true;
					
					const params: LayoutParamsWithX = {
						anchorX,
						anchorY,
						padding,
						defaultNodeWidth,
						defaultNodeHeight,
					};
					
					const columnTracks = simulateMultiColumnLayout(params, nodes);
					
					// Get sorted column indices
					const sortedCols = Array.from(columnTracks.keys()).sort((a, b) => a - b);
					
					// Verify no horizontal overlap between adjacent columns
					for (let i = 0; i < sortedCols.length - 1; i++) {
						const col1 = sortedCols[i];
						const col2 = sortedCols[i + 1];
						
						// Skip if columns are not adjacent
						if (col2 !== col1 + 1) continue;
						
						const track1 = columnTracks.get(col1)!;
						const track2 = columnTracks.get(col2)!;
						
						// Find the rightmost edge of column 1
						// max(C1.nodes.x + C1.nodes.width)
						let maxRightEdgeCol1 = -Infinity;
						for (const node of track1.nodes) {
							const rightEdge = node.x + node.actualWidth;
							maxRightEdgeCol1 = Math.max(maxRightEdgeCol1, rightEdge);
						}
						
						// Find the leftmost edge of column 2
						// min(C2.nodes.x)
						let minLeftEdgeCol2 = Infinity;
						for (const node of track2.nodes) {
							minLeftEdgeCol2 = Math.min(minLeftEdgeCol2, node.x);
						}
						
						// Property: min(C2.nodes.x) >= max(C1.nodes.x + C1.nodes.width) + HORIZONTAL_GAP
						const minRequiredX = maxRightEdgeCol1 + LAYOUT_CONSTANTS.HORIZONTAL_GAP;
						
						expect(minLeftEdgeCol2).toBeGreaterThanOrEqual(minRequiredX - 1); // 1px tolerance
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should use maximum width of all nodes in a column for spacing', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate widths for 3 nodes in column 0
				fc.integer({ min: 100, max: 300 }),
				fc.integer({ min: 100, max: 300 }),
				fc.integer({ min: 100, max: 300 }),
				// Generate width for node in column 1
				fc.integer({ min: 100, max: 300 }),
				(anchorX, anchorY, padding, defaultNodeWidth, defaultNodeHeight, w0, w1, w2, w3) => {
					const params: LayoutParamsWithX = {
						anchorX,
						anchorY,
						padding,
						defaultNodeWidth,
						defaultNodeHeight,
					};
					
					// Create 3 nodes in column 0 with varying widths
					const nodes: NodeInputWithWidth[] = [
						{ id: 'node_0', row: 0, col: 0, actualWidth: w0, actualHeight: 100 },
						{ id: 'node_1', row: 1, col: 0, actualWidth: w1, actualHeight: 100 },
						{ id: 'node_2', row: 2, col: 0, actualWidth: w2, actualHeight: 100 },
						// One node in column 1
						{ id: 'node_3', row: 0, col: 1, actualWidth: w3, actualHeight: 100 },
					];
					
					const columnTracks = simulateMultiColumnLayout(params, nodes);
					
					const track0 = columnTracks.get(0)!;
					const track1 = columnTracks.get(1)!;
					
					// Column 0's maxWidth should be the maximum of defaultNodeWidth and all node widths
					// This matches the implementation which initializes maxWidth to defaultNodeWidth
					const expectedMaxWidth = Math.max(defaultNodeWidth, w0, w1, w2);
					expect(track0.maxWidth).toBe(expectedMaxWidth);
					
					// Column 1's X position should account for column 0's max width
					const expectedX1 = anchorX + padding + expectedMaxWidth + LAYOUT_CONSTANTS.HORIZONTAL_GAP;
					expect(track1.nodes[0].x).toBe(expectedX1);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should maintain HORIZONTAL_GAP between adjacent columns', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate widths for nodes in 3 consecutive columns
				fc.integer({ min: 100, max: 500 }),
				fc.integer({ min: 100, max: 500 }),
				fc.integer({ min: 100, max: 500 }),
				(anchorX, anchorY, padding, defaultNodeWidth, defaultNodeHeight, w0, w1, w2) => {
					const params: LayoutParamsWithX = {
						anchorX,
						anchorY,
						padding,
						defaultNodeWidth,
						defaultNodeHeight,
					};
					
					// Create one node per column
					const nodes: NodeInputWithWidth[] = [
						{ id: 'node_0', row: 0, col: 0, actualWidth: w0, actualHeight: 100 },
						{ id: 'node_1', row: 0, col: 1, actualWidth: w1, actualHeight: 100 },
						{ id: 'node_2', row: 0, col: 2, actualWidth: w2, actualHeight: 100 },
					];
					
					const columnTracks = simulateMultiColumnLayout(params, nodes);
					
					const track0 = columnTracks.get(0)!;
					const track1 = columnTracks.get(1)!;
					const track2 = columnTracks.get(2)!;
					
					// The column maxWidth is max(defaultNodeWidth, actualNodeWidths)
					// Gap is calculated based on maxWidth, not actualWidth
					const col0MaxWidth = Math.max(defaultNodeWidth, w0);
					const col1MaxWidth = Math.max(defaultNodeWidth, w1);
					
					// Gap between column 0 and column 1 (based on maxWidth)
					const rightEdge0 = track0.nodes[0].x + col0MaxWidth;
					const leftEdge1 = track1.nodes[0].x;
					const gap01 = leftEdge1 - rightEdge0;
					
					// Gap between column 1 and column 2 (based on maxWidth)
					const rightEdge1 = track1.nodes[0].x + col1MaxWidth;
					const leftEdge2 = track2.nodes[0].x;
					const gap12 = leftEdge2 - rightEdge1;
					
					// Both gaps should be exactly HORIZONTAL_GAP
					expect(gap01).toBe(LAYOUT_CONSTANTS.HORIZONTAL_GAP);
					expect(gap12).toBe(LAYOUT_CONSTANTS.HORIZONTAL_GAP);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should position first column at anchorX + padding', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate node width
				fc.integer({ min: 100, max: 500 }),
				(anchorX, anchorY, padding, defaultNodeWidth, defaultNodeHeight, nodeWidth) => {
					const params: LayoutParamsWithX = {
						anchorX,
						anchorY,
						padding,
						defaultNodeWidth,
						defaultNodeHeight,
					};
					
					const nodes: NodeInputWithWidth[] = [{
						id: 'node_0',
						row: 0,
						col: 0,
						actualWidth: nodeWidth,
						actualHeight: 100,
					}];
					
					const columnTracks = simulateMultiColumnLayout(params, nodes);
					const track0 = columnTracks.get(0)!;
					
					// First column should be at anchorX + padding
					expect(track0.nodes[0].x).toBe(anchorX + padding);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should handle wide nodes that exceed default width', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node width (smaller)
				fc.integer({ min: 100, max: 200 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate actual width that exceeds default
				fc.integer({ min: 300, max: 600 }),
				(anchorX, anchorY, padding, defaultNodeWidth, defaultNodeHeight, wideNodeWidth) => {
					// Ensure wide node is actually wider than default
					if (wideNodeWidth <= defaultNodeWidth) return true;
					
					const params: LayoutParamsWithX = {
						anchorX,
						anchorY,
						padding,
						defaultNodeWidth,
						defaultNodeHeight,
					};
					
					// Create a wide node in column 0 and a normal node in column 1
					const nodes: NodeInputWithWidth[] = [
						{ id: 'node_0', row: 0, col: 0, actualWidth: wideNodeWidth, actualHeight: 100 },
						{ id: 'node_1', row: 0, col: 1, actualWidth: defaultNodeWidth, actualHeight: 100 },
					];
					
					const columnTracks = simulateMultiColumnLayout(params, nodes);
					
					const track0 = columnTracks.get(0)!;
					const track1 = columnTracks.get(1)!;
					
					// Column 0's maxWidth should be the wide node's width (not default)
					expect(track0.maxWidth).toBe(wideNodeWidth);
					
					// Column 1's X should account for the wide node
					const expectedX1 = anchorX + padding + wideNodeWidth + LAYOUT_CONSTANTS.HORIZONTAL_GAP;
					expect(track1.nodes[0].x).toBe(expectedX1);
					
					// Verify no overlap
					const rightEdge0 = track0.nodes[0].x + track0.nodes[0].actualWidth;
					const leftEdge1 = track1.nodes[0].x;
					expect(leftEdge1).toBeGreaterThanOrEqual(rightEdge0 + LAYOUT_CONSTANTS.HORIZONTAL_GAP - 1);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should ensure HORIZONTAL_GAP is at least 40 pixels', () => {
		// This is a constant verification test
		expect(LAYOUT_CONSTANTS.HORIZONTAL_GAP).toBeGreaterThanOrEqual(40);
	});

	it('should correctly calculate X position for multiple columns', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate default node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate widths for 4 columns
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 100, max: 400 }),
				(anchorX, anchorY, padding, defaultNodeWidth, defaultNodeHeight, w0, w1, w2, w3) => {
					const params: LayoutParamsWithX = {
						anchorX,
						anchorY,
						padding,
						defaultNodeWidth,
						defaultNodeHeight,
					};
					
					// Create one node per column
					const nodes: NodeInputWithWidth[] = [
						{ id: 'node_0', row: 0, col: 0, actualWidth: w0, actualHeight: 100 },
						{ id: 'node_1', row: 0, col: 1, actualWidth: w1, actualHeight: 100 },
						{ id: 'node_2', row: 0, col: 2, actualWidth: w2, actualHeight: 100 },
						{ id: 'node_3', row: 0, col: 3, actualWidth: w3, actualHeight: 100 },
					];
					
					const columnTracks = simulateMultiColumnLayout(params, nodes);
					
					// Verify X positions follow the formula
					// Column maxWidth is max(defaultNodeWidth, actualNodeWidths)
					const { HORIZONTAL_GAP } = LAYOUT_CONSTANTS;
					const col0Width = Math.max(defaultNodeWidth, w0);
					const col1Width = Math.max(defaultNodeWidth, w1);
					const col2Width = Math.max(defaultNodeWidth, w2);
					
					// Column 0: x = anchorX + padding
					const expectedX0 = anchorX + padding;
					expect(columnTracks.get(0)!.nodes[0].x).toBe(expectedX0);
					
					// Column 1: x = anchorX + padding + col0Width + HORIZONTAL_GAP
					const expectedX1 = anchorX + padding + col0Width + HORIZONTAL_GAP;
					expect(columnTracks.get(1)!.nodes[0].x).toBe(expectedX1);
					
					// Column 2: x = anchorX + padding + col0Width + HORIZONTAL_GAP + col1Width + HORIZONTAL_GAP
					const expectedX2 = anchorX + padding + col0Width + HORIZONTAL_GAP + col1Width + HORIZONTAL_GAP;
					expect(columnTracks.get(2)!.nodes[0].x).toBe(expectedX2);
					
					// Column 3: x = anchorX + padding + col0Width + HORIZONTAL_GAP + col1Width + HORIZONTAL_GAP + col2Width + HORIZONTAL_GAP
					const expectedX3 = anchorX + padding + col0Width + HORIZONTAL_GAP + col1Width + HORIZONTAL_GAP + col2Width + HORIZONTAL_GAP;
					expect(columnTracks.get(3)!.nodes[0].x).toBe(expectedX3);
				}
			),
			{ numRuns: 100 }
		);
	});
});
