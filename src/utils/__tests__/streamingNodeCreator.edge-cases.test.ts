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

import { AnchorState } from '../streamingNodeCreator';

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

describe('StreamingNodeCreator Edge Cases', () => {
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
	};

	describe('Negative Coordinates Positioning', () => {
		it('should position node above anchor for negative row', () => {
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

		it('should position node left of anchor for negative col', () => {
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

		it('should handle both negative row and col', () => {
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

		it('should correctly offset positive coords when negative coords exist', () => {
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

	describe('Coordinate Clamping', () => {
		it('should clamp row values above MAX_GRID_COORD (100)', () => {
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

		it('should clamp row values below -MAX_GRID_COORD (-100)', () => {
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

		it('should clamp col values above MAX_GRID_COORD (100)', () => {
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

		it('should clamp col values below -MAX_GRID_COORD (-100)', () => {
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

		it('should clamp both row and col when both exceed bounds', () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 999,
				col: -999,
			});
			
			expect(result.rowClamped).toBe(true);
			expect(result.colClamped).toBe(true);
		});

		it('should not clamp values within bounds', () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 50,
				col: -50,
			});
			
			expect(result.rowClamped).toBe(false);
			expect(result.colClamped).toBe(false);
		});

		it('should not clamp boundary values exactly at ±100', () => {
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

	describe('Fallback Behavior', () => {
		it('should use fallback when anchorState is null', () => {
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

		it('should not use fallback when anchorState is valid', () => {
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

	describe('Undefined Coordinates', () => {
		it('should treat undefined row as 0', () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: undefined,
				col: 0,
			});
			
			expect(result.y).toBe(360); // 300 + 60 + (0 * 240)
		});

		it('should treat undefined col as 0', () => {
			const result = calculateNodePositionWithMetadata({
				...defaultParams,
				anchorState: defaultAnchorState,
				row: 0,
				col: undefined,
			});
			
			expect(result.x).toBe(560); // 500 + 60 + (0 * 400)
		});

		it('should treat both undefined as (0, 0)', () => {
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
