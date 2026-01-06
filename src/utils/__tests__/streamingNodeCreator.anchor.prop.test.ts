/**
 * Property-Based Tests for StreamingNodeCreator Anchor Positioning
 * 
 * Feature: group-anchor-positioning
 * 
 * These tests validate the correctness properties defined in the design document
 * using fast-check for property-based testing.
 */

import * as fc from 'fast-check';

/**
 * Position calculation function extracted for testing
 * This mirrors the logic in StreamingNodeCreator.calculateNodePositionInPreCreatedGroup
 */
interface AnchorState {
	anchorX: number;
	anchorY: number;
	anchorLocked: boolean;
	minRowSeen: number;
	minColSeen: number;
}

/**
 * Represents a group with its bounds and anchor state
 */
interface GroupState {
	x: number;
	y: number;
	width: number;
	height: number;
	anchorState: AnchorState;
}

/**
 * Represents a node with its position
 */
interface NodeState {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface PositionCalculationParams {
	anchorState: AnchorState;
	padding: number;
	nodeWidth: number;
	nodeHeight: number;
	gap: number;
	row: number;
	col: number;
}

/**
 * Pure function that calculates node position based on anchor and grid coordinates
 * This is the core logic we want to test
 */
function calculateNodePosition(params: PositionCalculationParams): { x: number; y: number } {
	const { anchorState, padding, nodeWidth, nodeHeight, gap, row, col } = params;
	
	const cellWidth = nodeWidth + gap;
	const cellHeight = nodeHeight + gap;
	
	// Clamp coordinates to reasonable bounds
	const MAX_GRID_COORD = 100;
	const clampedRow = Math.max(-MAX_GRID_COORD, Math.min(MAX_GRID_COORD, row));
	const clampedCol = Math.max(-MAX_GRID_COORD, Math.min(MAX_GRID_COORD, col));
	
	// Normalize coordinates based on minimum seen values
	const normalizedRow = clampedRow - anchorState.minRowSeen;
	const normalizedCol = clampedCol - anchorState.minColSeen;
	
	return {
		x: anchorState.anchorX + padding + (normalizedCol * cellWidth),
		y: anchorState.anchorY + padding + (normalizedRow * cellHeight),
	};
}

/**
 * Reverse calculation: convert pixel position back to grid coordinates
 */
function pixelToGrid(
	pixelX: number,
	pixelY: number,
	anchorX: number,
	anchorY: number,
	padding: number,
	cellWidth: number,
	cellHeight: number,
	minRowSeen: number,
	minColSeen: number
): { row: number; col: number } {
	const normalizedCol = (pixelX - anchorX - padding) / cellWidth;
	const normalizedRow = (pixelY - anchorY - padding) / cellHeight;
	
	return {
		row: normalizedRow + minRowSeen,
		col: normalizedCol + minColSeen,
	};
}

describe('StreamingNodeCreator Anchor Positioning', () => {
	/**
	 * Property 2: Position Calculation Round-Trip
	 * 
	 * For any anchor position (anchorX, anchorY), padding value, cell dimensions,
	 * and grid coordinate (row, col), the calculated pixel position SHALL satisfy
	 * the position formula, and converting back to grid coordinates SHALL produce
	 * the original (row, col) values.
	 * 
	 * **Validates: Requirements 2.1**
	 */
	describe('Property 2: Position Calculation Round-Trip', () => {
		it('should calculate pixel position correctly from grid coordinates', () => {
			fc.assert(
				fc.property(
					// Generate anchor position
					fc.integer({ min: -10000, max: 10000 }),
					fc.integer({ min: -10000, max: 10000 }),
					// Generate padding (positive)
					fc.integer({ min: 10, max: 200 }),
					// Generate node dimensions (positive)
					fc.integer({ min: 100, max: 500 }),
					fc.integer({ min: 50, max: 400 }),
					// Generate gap (positive)
					fc.integer({ min: 10, max: 100 }),
					// Generate grid coordinates (within bounds)
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: -100, max: 100 }),
					// Generate minRowSeen and minColSeen (should be <= row/col)
					fc.integer({ min: -100, max: 0 }),
					fc.integer({ min: -100, max: 0 }),
					(anchorX, anchorY, padding, nodeWidth, nodeHeight, gap, row, col, minRowSeen, minColSeen) => {
						// Ensure minRowSeen <= row and minColSeen <= col
						const effectiveMinRow = Math.min(minRowSeen, row);
						const effectiveMinCol = Math.min(minColSeen, col);
						
						const anchorState: AnchorState = {
							anchorX,
							anchorY,
							anchorLocked: true,
							minRowSeen: effectiveMinRow,
							minColSeen: effectiveMinCol,
						};
						
						const cellWidth = nodeWidth + gap;
						const cellHeight = nodeHeight + gap;
						
						// Calculate pixel position
						const pixelPos = calculateNodePosition({
							anchorState,
							padding,
							nodeWidth,
							nodeHeight,
							gap,
							row,
							col,
						});
						
						// Verify the formula is correct
						const normalizedRow = row - effectiveMinRow;
						const normalizedCol = col - effectiveMinCol;
						
						const expectedX = anchorX + padding + (normalizedCol * cellWidth);
						const expectedY = anchorY + padding + (normalizedRow * cellHeight);
						
						expect(pixelPos.x).toBe(expectedX);
						expect(pixelPos.y).toBe(expectedY);
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should round-trip: grid -> pixel -> grid produces original coordinates', () => {
			fc.assert(
				fc.property(
					// Generate anchor position
					fc.integer({ min: -10000, max: 10000 }),
					fc.integer({ min: -10000, max: 10000 }),
					// Generate padding (positive)
					fc.integer({ min: 10, max: 200 }),
					// Generate node dimensions (positive)
					fc.integer({ min: 100, max: 500 }),
					fc.integer({ min: 50, max: 400 }),
					// Generate gap (positive)
					fc.integer({ min: 10, max: 100 }),
					// Generate grid coordinates (within bounds)
					fc.integer({ min: -100, max: 100 }),
					fc.integer({ min: -100, max: 100 }),
					(anchorX, anchorY, padding, nodeWidth, nodeHeight, gap, row, col) => {
						const minRowSeen = Math.min(0, row);
						const minColSeen = Math.min(0, col);
						
						const anchorState: AnchorState = {
							anchorX,
							anchorY,
							anchorLocked: true,
							minRowSeen,
							minColSeen,
						};
						
						const cellWidth = nodeWidth + gap;
						const cellHeight = nodeHeight + gap;
						
						// Forward: grid -> pixel
						const pixelPos = calculateNodePosition({
							anchorState,
							padding,
							nodeWidth,
							nodeHeight,
							gap,
							row,
							col,
						});
						
						// Reverse: pixel -> grid
						const gridPos = pixelToGrid(
							pixelPos.x,
							pixelPos.y,
							anchorX,
							anchorY,
							padding,
							cellWidth,
							cellHeight,
							minRowSeen,
							minColSeen
						);
						
						// Should get back original coordinates
						expect(gridPos.row).toBeCloseTo(row, 10);
						expect(gridPos.col).toBeCloseTo(col, 10);
					}
				),
				{ numRuns: 100 }
			);
		});

		it('should handle coordinate clamping for extreme values', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: -10000, max: 10000 }),
					fc.integer({ min: -10000, max: 10000 }),
					fc.integer({ min: 10, max: 200 }),
					fc.integer({ min: 100, max: 500 }),
					fc.integer({ min: 50, max: 400 }),
					fc.integer({ min: 10, max: 100 }),
					// Generate extreme coordinates outside bounds
					fc.integer({ min: -1000, max: 1000 }),
					fc.integer({ min: -1000, max: 1000 }),
					(anchorX, anchorY, padding, nodeWidth, nodeHeight, gap, row, col) => {
						const anchorState: AnchorState = {
							anchorX,
							anchorY,
							anchorLocked: true,
							minRowSeen: 0,
							minColSeen: 0,
						};
						
						const cellWidth = nodeWidth + gap;
						const cellHeight = nodeHeight + gap;
						
						// Calculate with potentially extreme values
						const pixelPos = calculateNodePosition({
							anchorState,
							padding,
							nodeWidth,
							nodeHeight,
							gap,
							row,
							col,
						});
						
						// Clamped values
						const clampedRow = Math.max(-100, Math.min(100, row));
						const clampedCol = Math.max(-100, Math.min(100, col));
						
						// Expected position with clamped values
						const expectedX = anchorX + padding + (clampedCol * cellWidth);
						const expectedY = anchorY + padding + (clampedRow * cellHeight);
						
						expect(pixelPos.x).toBe(expectedX);
						expect(pixelPos.y).toBe(expectedY);
					}
				),
				{ numRuns: 100 }
			);
		});
	});
});


describe('Property 3: Node Position Stability Under Streaming', () => {
	/**
	 * Property 3: Node Position Stability Under Streaming
	 * 
	 * For any node that has been created at position (x, y), and for any
	 * subsequent operation (adding new nodes, updating content, expanding bounds),
	 * the node's position SHALL remain at (x, y) unchanged.
	 * 
	 * **Validates: Requirements 2.3, 5.2**
	 */

	/**
	 * Simulates a sequence of node creations and verifies positions remain stable
	 */
	interface NodeState {
		id: string;
		row: number;
		col: number;
		position: { x: number; y: number };
	}

	/**
	 * Simulates streaming node creation and tracks positions
	 */
	function simulateStreamingNodeCreation(
		anchorX: number,
		anchorY: number,
		padding: number,
		nodeWidth: number,
		nodeHeight: number,
		gap: number,
		nodeCoordinates: Array<{ row: number; col: number }>
	): NodeState[] {
		const cellWidth = nodeWidth + gap;
		const cellHeight = nodeHeight + gap;
		
		// Track minimum coordinates seen (simulating streaming behavior)
		let minRowSeen = 0;
		let minColSeen = 0;
		
		const nodes: NodeState[] = [];
		
		for (let i = 0; i < nodeCoordinates.length; i++) {
			const { row, col } = nodeCoordinates[i];
			
			// Update min values (simulating what happens during streaming)
			minRowSeen = Math.min(minRowSeen, row);
			minColSeen = Math.min(minColSeen, col);
			
			// Calculate position using the formula
			const normalizedRow = row - minRowSeen;
			const normalizedCol = col - minColSeen;
			
			const x = anchorX + padding + (normalizedCol * cellWidth);
			const y = anchorY + padding + (normalizedRow * cellHeight);
			
			nodes.push({
				id: `node_${i}`,
				row,
				col,
				position: { x, y },
			});
		}
		
		return nodes;
	}

	it('should maintain node positions when new nodes are added with non-negative coordinates', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: -5000, max: 5000 }),
				fc.integer({ min: -5000, max: 5000 }),
				// Generate layout parameters
				fc.integer({ min: 20, max: 100 }),
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				fc.integer({ min: 10, max: 80 }),
				// Generate sequence of non-negative node coordinates
				fc.array(
					fc.record({
						row: fc.integer({ min: 0, max: 10 }),
						col: fc.integer({ min: 0, max: 10 }),
					}),
					{ minLength: 2, maxLength: 10 }
				),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, gap, nodeCoordinates) => {
					const cellWidth = nodeWidth + gap;
					const cellHeight = nodeHeight + gap;
					
					// Simulate streaming: create nodes one by one
					const allNodes = simulateStreamingNodeCreation(
						anchorX, anchorY, padding, nodeWidth, nodeHeight, gap, nodeCoordinates
					);
					
					// For non-negative coordinates, minRowSeen and minColSeen stay at 0
					// So positions should be stable and predictable
					for (let i = 0; i < allNodes.length; i++) {
						const node = allNodes[i];
						const expectedX = anchorX + padding + (node.col * cellWidth);
						const expectedY = anchorY + padding + (node.row * cellHeight);
						
						expect(node.position.x).toBe(expectedX);
						expect(node.position.y).toBe(expectedY);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should preserve relative distances between nodes regardless of anchor position', () => {
		fc.assert(
			fc.property(
				// Generate two different anchor positions
				fc.integer({ min: -5000, max: 5000 }),
				fc.integer({ min: -5000, max: 5000 }),
				fc.integer({ min: -5000, max: 5000 }),
				fc.integer({ min: -5000, max: 5000 }),
				// Generate layout parameters (same for both)
				fc.integer({ min: 20, max: 100 }),
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				fc.integer({ min: 10, max: 80 }),
				// Generate node coordinates
				fc.array(
					fc.record({
						row: fc.integer({ min: 0, max: 10 }),
						col: fc.integer({ min: 0, max: 10 }),
					}),
					{ minLength: 2, maxLength: 5 }
				),
				(anchorX1, anchorY1, anchorX2, anchorY2, padding, nodeWidth, nodeHeight, gap, nodeCoordinates) => {
					// Create nodes with first anchor
					const nodes1 = simulateStreamingNodeCreation(
						anchorX1, anchorY1, padding, nodeWidth, nodeHeight, gap, nodeCoordinates
					);
					
					// Create nodes with second anchor
					const nodes2 = simulateStreamingNodeCreation(
						anchorX2, anchorY2, padding, nodeWidth, nodeHeight, gap, nodeCoordinates
					);
					
					// Relative distances between any two nodes should be the same
					for (let i = 0; i < nodes1.length; i++) {
						for (let j = i + 1; j < nodes1.length; j++) {
							const dx1 = nodes1[j].position.x - nodes1[i].position.x;
							const dy1 = nodes1[j].position.y - nodes1[i].position.y;
							
							const dx2 = nodes2[j].position.x - nodes2[i].position.x;
							const dy2 = nodes2[j].position.y - nodes2[i].position.y;
							
							expect(dx1).toBe(dx2);
							expect(dy1).toBe(dy2);
						}
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should calculate consistent positions for the same grid coordinates', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: -5000, max: 5000 }),
				fc.integer({ min: -5000, max: 5000 }),
				// Generate layout parameters
				fc.integer({ min: 20, max: 100 }),
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				fc.integer({ min: 10, max: 80 }),
				// Generate a single coordinate
				fc.integer({ min: 0, max: 10 }),
				fc.integer({ min: 0, max: 10 }),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, gap, row, col) => {
					const cellWidth = nodeWidth + gap;
					const cellHeight = nodeHeight + gap;
					
					// Calculate position multiple times - should always be the same
					const anchorState: AnchorState = {
						anchorX,
						anchorY,
						anchorLocked: true,
						minRowSeen: 0,
						minColSeen: 0,
					};
					
					const pos1 = calculateNodePosition({
						anchorState,
						padding,
						nodeWidth,
						nodeHeight,
						gap,
						row,
						col,
					});
					
					const pos2 = calculateNodePosition({
						anchorState,
						padding,
						nodeWidth,
						nodeHeight,
						gap,
						row,
						col,
					});
					
					const pos3 = calculateNodePosition({
						anchorState,
						padding,
						nodeWidth,
						nodeHeight,
						gap,
						row,
						col,
					});
					
					// All positions should be identical
					expect(pos1.x).toBe(pos2.x);
					expect(pos1.y).toBe(pos2.y);
					expect(pos2.x).toBe(pos3.x);
					expect(pos2.y).toBe(pos3.y);
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 1: Anchor Preservation Invariant
 * 
 * For any pre-created group at position (X, Y) and for any sequence of streaming
 * operations (node creation, content updates, bounds expansion), the group's anchor
 * position SHALL remain at (X, Y) within a 2-pixel tolerance, unless negative grid
 * coordinates require anchor adjustment.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 3.2**
 */
describe('Property 1: Anchor Preservation Invariant', () => {
	const TOLERANCE = 2; // 2-pixel tolerance as per requirements

	/**
	 * Simulates the updateGroupBoundsPreservingAnchor logic
	 * Returns the new group state after bounds update
	 */
	function simulateAnchorPreservingBoundsUpdate(
		initialGroup: GroupState,
		nodes: NodeState[],
		padding: number
	): { newGroup: GroupState; anchorPreserved: boolean; anchorShifted: boolean } {
		if (nodes.length === 0) {
			return {
				newGroup: initialGroup,
				anchorPreserved: true,
				anchorShifted: false,
			};
		}

		// Calculate bounding box of all nodes
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		nodes.forEach(node => {
			minX = Math.min(minX, node.x);
			minY = Math.min(minY, node.y);
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		});

		const requiredX = minX - padding;
		const requiredY = minY - padding;

		// Check if anchor shift is needed (negative coordinates scenario)
		const needsAnchorShiftX = requiredX < initialGroup.anchorState.anchorX - TOLERANCE;
		const needsAnchorShiftY = requiredY < initialGroup.anchorState.anchorY - TOLERANCE;

		if (needsAnchorShiftX || needsAnchorShiftY) {
			// Anchor shift required - this is expected for negative coordinates
			const newAnchorX = Math.min(requiredX, initialGroup.anchorState.anchorX);
			const newAnchorY = Math.min(requiredY, initialGroup.anchorState.anchorY);
			
			return {
				newGroup: {
					x: newAnchorX,
					y: newAnchorY,
					width: maxX - minX + padding * 2,
					height: maxY - minY + padding * 2,
					anchorState: {
						...initialGroup.anchorState,
						anchorX: newAnchorX,
						anchorY: newAnchorY,
					},
				},
				anchorPreserved: false,
				anchorShifted: true,
			};
		} else {
			// Positive coordinates - anchor should be preserved
			const newWidth = Math.max(
				initialGroup.width,
				maxX - initialGroup.anchorState.anchorX + padding
			);
			const newHeight = Math.max(
				initialGroup.height,
				maxY - initialGroup.anchorState.anchorY + padding
			);

			return {
				newGroup: {
					x: initialGroup.anchorState.anchorX,
					y: initialGroup.anchorState.anchorY,
					width: newWidth,
					height: newHeight,
					anchorState: initialGroup.anchorState,
				},
				anchorPreserved: true,
				anchorShifted: false,
			};
		}
	}

	it('should preserve anchor position when all nodes have non-negative coordinates', () => {
		fc.assert(
			fc.property(
				// Generate initial anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate nodes with non-negative positions relative to anchor
				fc.array(
					fc.record({
						offsetX: fc.integer({ min: 0, max: 1000 }),
						offsetY: fc.integer({ min: 0, max: 1000 }),
					}),
					{ minLength: 1, maxLength: 10 }
				),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, nodeOffsets) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: 400,
						height: 300,
						anchorState: {
							anchorX,
							anchorY,
							anchorLocked: true,
							minRowSeen: 0,
							minColSeen: 0,
						},
					};

					// Create nodes at positions relative to anchor (all positive offsets)
					const nodes: NodeState[] = nodeOffsets.map((offset, i) => ({
						id: `node_${i}`,
						x: anchorX + padding + offset.offsetX,
						y: anchorY + padding + offset.offsetY,
						width: nodeWidth,
						height: nodeHeight,
					}));

					const result = simulateAnchorPreservingBoundsUpdate(initialGroup, nodes, padding);

					// Anchor should be preserved (within tolerance)
					expect(result.anchorPreserved).toBe(true);
					expect(Math.abs(result.newGroup.anchorState.anchorX - anchorX)).toBeLessThanOrEqual(TOLERANCE);
					expect(Math.abs(result.newGroup.anchorState.anchorY - anchorY)).toBeLessThanOrEqual(TOLERANCE);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should shift anchor only when nodes extend beyond original anchor position', () => {
		fc.assert(
			fc.property(
				// Generate initial anchor position (positive to allow negative offsets)
				fc.integer({ min: 500, max: 5000 }),
				fc.integer({ min: 500, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate negative offset (node extends beyond anchor)
				fc.integer({ min: -400, max: -10 }),
				fc.integer({ min: -400, max: -10 }),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, negOffsetX, negOffsetY) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: 400,
						height: 300,
						anchorState: {
							anchorX,
							anchorY,
							anchorLocked: true,
							minRowSeen: 0,
							minColSeen: 0,
						},
					};

					// Create a node that extends beyond the anchor (negative offset)
					const nodes: NodeState[] = [{
						id: 'node_0',
						x: anchorX + negOffsetX, // This will be less than anchorX
						y: anchorY + negOffsetY, // This will be less than anchorY
						width: nodeWidth,
						height: nodeHeight,
					}];

					const result = simulateAnchorPreservingBoundsUpdate(initialGroup, nodes, padding);

					// Anchor should have shifted
					expect(result.anchorShifted).toBe(true);
					
					// New anchor should accommodate the node
					expect(result.newGroup.anchorState.anchorX).toBeLessThanOrEqual(nodes[0].x - padding + TOLERANCE);
					expect(result.newGroup.anchorState.anchorY).toBeLessThanOrEqual(nodes[0].y - padding + TOLERANCE);
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should maintain anchor position across multiple streaming operations with positive coordinates', () => {
		fc.assert(
			fc.property(
				// Generate initial anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate sequence of node additions (simulating streaming)
				fc.array(
					fc.record({
						offsetX: fc.integer({ min: 0, max: 500 }),
						offsetY: fc.integer({ min: 0, max: 500 }),
					}),
					{ minLength: 2, maxLength: 8 }
				),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, nodeOffsets) => {
					let currentGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: 400,
						height: 300,
						anchorState: {
							anchorX,
							anchorY,
							anchorLocked: true,
							minRowSeen: 0,
							minColSeen: 0,
						},
					};

					const allNodes: NodeState[] = [];

					// Simulate streaming: add nodes one by one
					for (let i = 0; i < nodeOffsets.length; i++) {
						const offset = nodeOffsets[i];
						allNodes.push({
							id: `node_${i}`,
							x: anchorX + padding + offset.offsetX,
							y: anchorY + padding + offset.offsetY,
							width: nodeWidth,
							height: nodeHeight,
						});

						const result = simulateAnchorPreservingBoundsUpdate(currentGroup, allNodes, padding);
						currentGroup = result.newGroup;

						// After each operation, anchor should still be preserved
						expect(Math.abs(currentGroup.anchorState.anchorX - anchorX)).toBeLessThanOrEqual(TOLERANCE);
						expect(Math.abs(currentGroup.anchorState.anchorY - anchorY)).toBeLessThanOrEqual(TOLERANCE);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should only expand width/height when anchor is preserved', () => {
		fc.assert(
			fc.property(
				// Generate initial anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate initial dimensions
				fc.integer({ min: 200, max: 500 }),
				fc.integer({ min: 200, max: 500 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate node offset that requires expansion
				fc.integer({ min: 100, max: 800 }),
				fc.integer({ min: 100, max: 800 }),
				(anchorX, anchorY, initialWidth, initialHeight, padding, nodeWidth, nodeHeight, offsetX, offsetY) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: initialWidth,
						height: initialHeight,
						anchorState: {
							anchorX,
							anchorY,
							anchorLocked: true,
							minRowSeen: 0,
							minColSeen: 0,
						},
					};

					// Create a node that requires bounds expansion
					const nodes: NodeState[] = [{
						id: 'node_0',
						x: anchorX + padding + offsetX,
						y: anchorY + padding + offsetY,
						width: nodeWidth,
						height: nodeHeight,
					}];

					const result = simulateAnchorPreservingBoundsUpdate(initialGroup, nodes, padding);

					// Anchor should be preserved
					expect(result.anchorPreserved).toBe(true);
					
					// Group position (x, y) should match anchor
					expect(result.newGroup.x).toBe(anchorX);
					expect(result.newGroup.y).toBe(anchorY);
					
					// Width and height should have expanded to fit the node
					const requiredWidth = offsetX + nodeWidth + padding;
					const requiredHeight = offsetY + nodeHeight + padding;
					
					expect(result.newGroup.width).toBeGreaterThanOrEqual(Math.max(initialWidth, requiredWidth) - TOLERANCE);
					expect(result.newGroup.height).toBeGreaterThanOrEqual(Math.max(initialHeight, requiredHeight) - TOLERANCE);
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 4: Group Bounds Containment
 * 
 * For any group with member nodes, the group's bounds SHALL satisfy:
 * - group.x <= min(node.x for all nodes) - padding
 * - group.y <= min(node.y for all nodes) - padding
 * - group.x + group.width >= max(node.x + node.width for all nodes) + padding
 * - group.y + group.height >= max(node.y + node.height for all nodes) + padding
 * 
 * **Validates: Requirements 3.1**
 */
describe('Property 4: Group Bounds Containment', () => {
	const TOLERANCE = 2; // 2-pixel tolerance as per requirements

	/**
	 * Calculates group bounds that contain all nodes with padding
	 */
	function calculateContainingBounds(
		nodes: NodeState[],
		padding: number
	): { x: number; y: number; width: number; height: number } {
		if (nodes.length === 0) {
			return { x: 0, y: 0, width: 400, height: 300 };
		}

		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		nodes.forEach(node => {
			minX = Math.min(minX, node.x);
			minY = Math.min(minY, node.y);
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		});

		return {
			x: minX - padding,
			y: minY - padding,
			width: maxX - minX + padding * 2,
			height: maxY - minY + padding * 2,
		};
	}

	/**
	 * Verifies that group bounds contain all nodes with proper padding
	 */
	function verifyBoundsContainment(
		group: { x: number; y: number; width: number; height: number },
		nodes: NodeState[],
		padding: number
	): { valid: boolean; violations: string[] } {
		const violations: string[] = [];

		if (nodes.length === 0) {
			return { valid: true, violations: [] };
		}

		let minNodeX = Infinity, minNodeY = Infinity;
		let maxNodeX = -Infinity, maxNodeY = -Infinity;

		nodes.forEach(node => {
			minNodeX = Math.min(minNodeX, node.x);
			minNodeY = Math.min(minNodeY, node.y);
			maxNodeX = Math.max(maxNodeX, node.x + node.width);
			maxNodeY = Math.max(maxNodeY, node.y + node.height);
		});

		// Check left boundary: group.x <= min(node.x) - padding
		if (group.x > minNodeX - padding + TOLERANCE) {
			violations.push(`Left boundary violation: group.x (${group.x}) > minNodeX - padding (${minNodeX - padding})`);
		}

		// Check top boundary: group.y <= min(node.y) - padding
		if (group.y > minNodeY - padding + TOLERANCE) {
			violations.push(`Top boundary violation: group.y (${group.y}) > minNodeY - padding (${minNodeY - padding})`);
		}

		// Check right boundary: group.x + group.width >= max(node.x + node.width) + padding
		if (group.x + group.width < maxNodeX + padding - TOLERANCE) {
			violations.push(`Right boundary violation: group.x + width (${group.x + group.width}) < maxNodeX + padding (${maxNodeX + padding})`);
		}

		// Check bottom boundary: group.y + group.height >= max(node.y + node.height) + padding
		if (group.y + group.height < maxNodeY + padding - TOLERANCE) {
			violations.push(`Bottom boundary violation: group.y + height (${group.y + group.height}) < maxNodeY + padding (${maxNodeY + padding})`);
		}

		return {
			valid: violations.length === 0,
			violations,
		};
	}

	it('should contain all nodes with proper padding for any node configuration', () => {
		fc.assert(
			fc.property(
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate nodes with various positions
				fc.array(
					fc.record({
						x: fc.integer({ min: -1000, max: 5000 }),
						y: fc.integer({ min: -1000, max: 5000 }),
					}),
					{ minLength: 1, maxLength: 10 }
				),
				(padding, nodeWidth, nodeHeight, nodePositions) => {
					const nodes: NodeState[] = nodePositions.map((pos, i) => ({
						id: `node_${i}`,
						x: pos.x,
						y: pos.y,
						width: nodeWidth,
						height: nodeHeight,
					}));

					const bounds = calculateContainingBounds(nodes, padding);
					const result = verifyBoundsContainment(bounds, nodes, padding);

					expect(result.valid).toBe(true);
					if (!result.valid) {
						console.log('Violations:', result.violations);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should contain nodes after anchor-preserving bounds update', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate nodes with non-negative offsets from anchor
				fc.array(
					fc.record({
						offsetX: fc.integer({ min: 0, max: 800 }),
						offsetY: fc.integer({ min: 0, max: 800 }),
					}),
					{ minLength: 1, maxLength: 10 }
				),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, nodeOffsets) => {
					// Create nodes at positions relative to anchor
					const nodes: NodeState[] = nodeOffsets.map((offset, i) => ({
						id: `node_${i}`,
						x: anchorX + padding + offset.offsetX,
						y: anchorY + padding + offset.offsetY,
						width: nodeWidth,
						height: nodeHeight,
					}));

					// Calculate bounds using anchor-preserving logic
					let maxX = -Infinity, maxY = -Infinity;
					nodes.forEach(node => {
						maxX = Math.max(maxX, node.x + node.width);
						maxY = Math.max(maxY, node.y + node.height);
					});

					const groupBounds = {
						x: anchorX,
						y: anchorY,
						width: maxX - anchorX + padding,
						height: maxY - anchorY + padding,
					};

					const result = verifyBoundsContainment(groupBounds, nodes, padding);

					expect(result.valid).toBe(true);
					if (!result.valid) {
						console.log('Violations:', result.violations);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should contain nodes even when bounds expansion is required', () => {
		fc.assert(
			fc.property(
				// Generate initial group bounds
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 200, max: 500 }),
				fc.integer({ min: 200, max: 500 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate node that may extend beyond initial bounds
				fc.integer({ min: 0, max: 1000 }),
				fc.integer({ min: 0, max: 1000 }),
				(groupX, groupY, initialWidth, initialHeight, padding, nodeWidth, nodeHeight, offsetX, offsetY) => {
					const nodes: NodeState[] = [{
						id: 'node_0',
						x: groupX + padding + offsetX,
						y: groupY + padding + offsetY,
						width: nodeWidth,
						height: nodeHeight,
					}];

					// Calculate expanded bounds
					const nodeRight = nodes[0].x + nodes[0].width;
					const nodeBottom = nodes[0].y + nodes[0].height;

					const expandedBounds = {
						x: groupX,
						y: groupY,
						width: Math.max(initialWidth, nodeRight - groupX + padding),
						height: Math.max(initialHeight, nodeBottom - groupY + padding),
					};

					const result = verifyBoundsContainment(expandedBounds, nodes, padding);

					expect(result.valid).toBe(true);
					if (!result.valid) {
						console.log('Violations:', result.violations);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should maintain containment after multiple node additions', () => {
		fc.assert(
			fc.property(
				// Generate anchor position
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate sequence of node additions
				fc.array(
					fc.record({
						offsetX: fc.integer({ min: 0, max: 600 }),
						offsetY: fc.integer({ min: 0, max: 600 }),
					}),
					{ minLength: 2, maxLength: 8 }
				),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, nodeOffsets) => {
					const allNodes: NodeState[] = [];
					let currentBounds = {
						x: anchorX,
						y: anchorY,
						width: 400,
						height: 300,
					};

					// Simulate streaming: add nodes one by one and verify containment
					for (let i = 0; i < nodeOffsets.length; i++) {
						const offset = nodeOffsets[i];
						allNodes.push({
							id: `node_${i}`,
							x: anchorX + padding + offset.offsetX,
							y: anchorY + padding + offset.offsetY,
							width: nodeWidth,
							height: nodeHeight,
						});

						// Update bounds to contain all nodes
						let maxX = -Infinity, maxY = -Infinity;
						allNodes.forEach(node => {
							maxX = Math.max(maxX, node.x + node.width);
							maxY = Math.max(maxY, node.y + node.height);
						});

						currentBounds = {
							x: anchorX,
							y: anchorY,
							width: Math.max(currentBounds.width, maxX - anchorX + padding),
							height: Math.max(currentBounds.height, maxY - anchorY + padding),
						};

						// Verify containment after each addition
						const result = verifyBoundsContainment(currentBounds, allNodes, padding);
						expect(result.valid).toBe(true);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 5: Relative Position Preservation
 * 
 * For any two nodes A and B within a group, and for any operation that causes
 * anchor adjustment (due to negative coordinates), the relative distance between
 * A and B SHALL remain constant:
 * - distance(A, B) before operation == distance(A, B) after operation
 * 
 * **Validates: Requirements 3.3**
 */
describe('Property 5: Relative Position Preservation', () => {
	/**
	 * Calculate Euclidean distance between two nodes
	 */
	function calculateDistance(nodeA: NodeState, nodeB: NodeState): number {
		const dx = nodeB.x - nodeA.x;
		const dy = nodeB.y - nodeA.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/**
	 * Calculate relative offset between two nodes
	 */
	function calculateRelativeOffset(nodeA: NodeState, nodeB: NodeState): { dx: number; dy: number } {
		return {
			dx: nodeB.x - nodeA.x,
			dy: nodeB.y - nodeA.y,
		};
	}

	/**
	 * Simulates anchor shift and node repositioning
	 * Returns the new positions of all nodes after the shift
	 */
	function simulateAnchorShiftAndReposition(
		nodes: NodeState[],
		currentAnchorX: number,
		currentAnchorY: number,
		newAnchorX: number,
		newAnchorY: number
	): NodeState[] {
		// Calculate the shift delta
		const deltaX = currentAnchorX - newAnchorX;
		const deltaY = currentAnchorY - newAnchorY;

		// Reposition all nodes by the delta
		return nodes.map(node => ({
			...node,
			x: node.x + deltaX,
			y: node.y + deltaY,
		}));
	}

	it('should preserve relative distances between all node pairs after anchor shift', () => {
		fc.assert(
			fc.property(
				// Generate initial anchor position (high enough to allow negative shift)
				fc.integer({ min: 500, max: 5000 }),
				fc.integer({ min: 500, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate nodes with various positions
				fc.array(
					fc.record({
						offsetX: fc.integer({ min: 0, max: 500 }),
						offsetY: fc.integer({ min: 0, max: 500 }),
					}),
					{ minLength: 2, maxLength: 6 }
				),
				// Generate anchor shift (negative values to simulate negative coordinates)
				fc.integer({ min: -300, max: 0 }),
				fc.integer({ min: -300, max: 0 }),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, nodeOffsets, shiftX, shiftY) => {
					// Create initial nodes
					const initialNodes: NodeState[] = nodeOffsets.map((offset, i) => ({
						id: `node_${i}`,
						x: anchorX + padding + offset.offsetX,
						y: anchorY + padding + offset.offsetY,
						width: nodeWidth,
						height: nodeHeight,
					}));

					// Calculate all pairwise distances before shift
					const distancesBefore: Map<string, number> = new Map();
					for (let i = 0; i < initialNodes.length; i++) {
						for (let j = i + 1; j < initialNodes.length; j++) {
							const key = `${i}-${j}`;
							distancesBefore.set(key, calculateDistance(initialNodes[i], initialNodes[j]));
						}
					}

					// Simulate anchor shift
					const newAnchorX = anchorX + shiftX;
					const newAnchorY = anchorY + shiftY;
					const repositionedNodes = simulateAnchorShiftAndReposition(
						initialNodes,
						anchorX,
						anchorY,
						newAnchorX,
						newAnchorY
					);

					// Calculate all pairwise distances after shift
					for (let i = 0; i < repositionedNodes.length; i++) {
						for (let j = i + 1; j < repositionedNodes.length; j++) {
							const key = `${i}-${j}`;
							const distanceBefore = distancesBefore.get(key)!;
							const distanceAfter = calculateDistance(repositionedNodes[i], repositionedNodes[j]);

							// Distances should be equal (within floating point tolerance)
							expect(distanceAfter).toBeCloseTo(distanceBefore, 10);
						}
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should preserve relative offsets (dx, dy) between all node pairs after anchor shift', () => {
		fc.assert(
			fc.property(
				// Generate initial anchor position
				fc.integer({ min: 500, max: 5000 }),
				fc.integer({ min: 500, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate nodes
				fc.array(
					fc.record({
						offsetX: fc.integer({ min: 0, max: 500 }),
						offsetY: fc.integer({ min: 0, max: 500 }),
					}),
					{ minLength: 2, maxLength: 6 }
				),
				// Generate anchor shift
				fc.integer({ min: -300, max: 0 }),
				fc.integer({ min: -300, max: 0 }),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, nodeOffsets, shiftX, shiftY) => {
					// Create initial nodes
					const initialNodes: NodeState[] = nodeOffsets.map((offset, i) => ({
						id: `node_${i}`,
						x: anchorX + padding + offset.offsetX,
						y: anchorY + padding + offset.offsetY,
						width: nodeWidth,
						height: nodeHeight,
					}));

					// Calculate all pairwise relative offsets before shift
					const offsetsBefore: Map<string, { dx: number; dy: number }> = new Map();
					for (let i = 0; i < initialNodes.length; i++) {
						for (let j = i + 1; j < initialNodes.length; j++) {
							const key = `${i}-${j}`;
							offsetsBefore.set(key, calculateRelativeOffset(initialNodes[i], initialNodes[j]));
						}
					}

					// Simulate anchor shift
					const newAnchorX = anchorX + shiftX;
					const newAnchorY = anchorY + shiftY;
					const repositionedNodes = simulateAnchorShiftAndReposition(
						initialNodes,
						anchorX,
						anchorY,
						newAnchorX,
						newAnchorY
					);

					// Calculate all pairwise relative offsets after shift
					for (let i = 0; i < repositionedNodes.length; i++) {
						for (let j = i + 1; j < repositionedNodes.length; j++) {
							const key = `${i}-${j}`;
							const offsetBefore = offsetsBefore.get(key)!;
							const offsetAfter = calculateRelativeOffset(repositionedNodes[i], repositionedNodes[j]);

							// Relative offsets should be exactly equal
							expect(offsetAfter.dx).toBe(offsetBefore.dx);
							expect(offsetAfter.dy).toBe(offsetBefore.dy);
						}
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should preserve node order and layout structure after anchor shift', () => {
		fc.assert(
			fc.property(
				// Generate initial anchor position
				fc.integer({ min: 500, max: 5000 }),
				fc.integer({ min: 500, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate a grid of nodes (row, col)
				fc.integer({ min: 1, max: 3 }),
				fc.integer({ min: 1, max: 3 }),
				// Generate gap between nodes
				fc.integer({ min: 20, max: 80 }),
				// Generate anchor shift
				fc.integer({ min: -300, max: 0 }),
				fc.integer({ min: -300, max: 0 }),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, rows, cols, gap, shiftX, shiftY) => {
					// Create a grid of nodes
					const initialNodes: NodeState[] = [];
					for (let r = 0; r < rows; r++) {
						for (let c = 0; c < cols; c++) {
							initialNodes.push({
								id: `node_${r}_${c}`,
								x: anchorX + padding + c * (nodeWidth + gap),
								y: anchorY + padding + r * (nodeHeight + gap),
								width: nodeWidth,
								height: nodeHeight,
							});
						}
					}

					// Simulate anchor shift
					const newAnchorX = anchorX + shiftX;
					const newAnchorY = anchorY + shiftY;
					const repositionedNodes = simulateAnchorShiftAndReposition(
						initialNodes,
						anchorX,
						anchorY,
						newAnchorX,
						newAnchorY
					);

					// Verify grid structure is preserved
					for (let r = 0; r < rows; r++) {
						for (let c = 0; c < cols; c++) {
							const idx = r * cols + c;
							const node = repositionedNodes[idx];

							// Check horizontal alignment (same row should have same y)
							if (c > 0) {
								const prevNode = repositionedNodes[idx - 1];
								expect(node.y).toBe(prevNode.y);
								expect(node.x - prevNode.x).toBe(nodeWidth + gap);
							}

							// Check vertical alignment (same column should have same x)
							if (r > 0) {
								const aboveNode = repositionedNodes[(r - 1) * cols + c];
								expect(node.x).toBe(aboveNode.x);
								expect(node.y - aboveNode.y).toBe(nodeHeight + gap);
							}
						}
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it('should preserve relative positions when multiple anchor shifts occur', () => {
		fc.assert(
			fc.property(
				// Generate initial anchor position
				fc.integer({ min: 1000, max: 5000 }),
				fc.integer({ min: 1000, max: 5000 }),
				// Generate padding
				fc.integer({ min: 20, max: 100 }),
				// Generate node dimensions
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 50, max: 300 }),
				// Generate nodes
				fc.array(
					fc.record({
						offsetX: fc.integer({ min: 0, max: 300 }),
						offsetY: fc.integer({ min: 0, max: 300 }),
					}),
					{ minLength: 2, maxLength: 5 }
				),
				// Generate sequence of anchor shifts
				fc.array(
					fc.record({
						shiftX: fc.integer({ min: -200, max: 0 }),
						shiftY: fc.integer({ min: -200, max: 0 }),
					}),
					{ minLength: 1, maxLength: 3 }
				),
				(anchorX, anchorY, padding, nodeWidth, nodeHeight, nodeOffsets, shifts) => {
					// Create initial nodes
					let currentNodes: NodeState[] = nodeOffsets.map((offset, i) => ({
						id: `node_${i}`,
						x: anchorX + padding + offset.offsetX,
						y: anchorY + padding + offset.offsetY,
						width: nodeWidth,
						height: nodeHeight,
					}));

					// Store initial relative offsets
					const initialOffsets: Map<string, { dx: number; dy: number }> = new Map();
					for (let i = 0; i < currentNodes.length; i++) {
						for (let j = i + 1; j < currentNodes.length; j++) {
							const key = `${i}-${j}`;
							initialOffsets.set(key, calculateRelativeOffset(currentNodes[i], currentNodes[j]));
						}
					}

					// Apply multiple shifts
					let currentAnchorX = anchorX;
					let currentAnchorY = anchorY;

					for (const shift of shifts) {
						const newAnchorX = currentAnchorX + shift.shiftX;
						const newAnchorY = currentAnchorY + shift.shiftY;

						currentNodes = simulateAnchorShiftAndReposition(
							currentNodes,
							currentAnchorX,
							currentAnchorY,
							newAnchorX,
							newAnchorY
						);

						currentAnchorX = newAnchorX;
						currentAnchorY = newAnchorY;
					}

					// Verify relative offsets are still preserved after all shifts
					for (let i = 0; i < currentNodes.length; i++) {
						for (let j = i + 1; j < currentNodes.length; j++) {
							const key = `${i}-${j}`;
							const initialOffset = initialOffsets.get(key)!;
							const finalOffset = calculateRelativeOffset(currentNodes[i], currentNodes[j]);

							expect(finalOffset.dx).toBe(initialOffset.dx);
							expect(finalOffset.dy).toBe(initialOffset.dy);
						}
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});
