/**
 * Coordinate System for AI Canvas v2.0
 * Converts grid-based (row/col) coordinates to pixel-based (x/y) coordinates
 * Based on PRD v2.0 Section 4.1
 */

import { CanvasNode } from "../obsidian/canvas-internal";

/**
 * Grid-based coordinate (logical layout)
 */
export interface GridCoordinate {
	row: number;  // Vertical position (0-based)
	col: number;  // Horizontal position (0-based)
}

/**
 * Pixel-based coordinate (canvas absolute position)
 */
export interface PixelCoordinate {
	x: number;  // Horizontal pixel position
	y: number;  // Vertical pixel position
}

/**
 * Grid layout configuration options
 */
export interface GridLayoutOptions {
	/** Width of each node in pixels */
	nodeWidth: number;
	
	/** Height of each node in pixels */
	nodeHeight: number;
	
	/** Gap between nodes in pixels */
	gap: number;
	
	/** Additional padding (e.g., for groups) */
	padding?: number;
}

/**
 * Default grid layout configuration
 */
export const DEFAULT_GRID_OPTIONS: GridLayoutOptions = {
	nodeWidth: 360,
	nodeHeight: 200,
	gap: 40,
	padding: 0,
};

/**
 * Convert grid coordinate to absolute pixel coordinate
 * Relative to a source node's position
 * 
 * Per PRD Section 4.1:
 * x = Parent.x + (col * (W + Gap))
 * y = Parent.y + (row * (H + Gap))
 * 
 * @param grid - Grid coordinate (row, col)
 * @param sourceNode - Source node to calculate relative to
 * @param options - Grid layout options
 * @returns Pixel coordinate (x, y)
 */
export function gridToPixel(
	grid: GridCoordinate,
	sourceNode: CanvasNode,
	options: Partial<GridLayoutOptions> = {}
): PixelCoordinate {
	const opts = { ...DEFAULT_GRID_OPTIONS, ...options };
	
	return {
		x: sourceNode.x + grid.col * (opts.nodeWidth + opts.gap),
		y: sourceNode.y + grid.row * (opts.nodeHeight + opts.gap),
	};
}

/**
 * Convert grid coordinate to pixel coordinate relative to a pixel origin
 * Used for nested groups where parent is not a CanvasNode
 * 
 * @param grid - Grid coordinate
 * @param origin - Origin pixel coordinate
 * @param options - Grid layout options
 * @returns Pixel coordinate
 */
export function gridToPixelFromOrigin(
	grid: GridCoordinate,
	origin: PixelCoordinate,
	options: Partial<GridLayoutOptions> = {}
): PixelCoordinate {
	const opts = { ...DEFAULT_GRID_OPTIONS, ...options };
	
	return {
		x: origin.x + grid.col * (opts.nodeWidth + opts.gap),
		y: origin.y + grid.row * (opts.nodeHeight + opts.gap),
	};
}

/**
 * Convert pixel coordinate to grid coordinate (inverse operation)
 * Useful for debugging and validation
 * 
 * @param pixel - Pixel coordinate
 * @param sourceNode - Source node
 * @param options - Grid layout options
 * @returns Grid coordinate (rounded)
 */
export function pixelToGrid(
	pixel: PixelCoordinate,
	sourceNode: CanvasNode,
	options: Partial<GridLayoutOptions> = {}
): GridCoordinate {
	const opts = { ...DEFAULT_GRID_OPTIONS, ...options };
	
	const deltaX = pixel.x - sourceNode.x;
	const deltaY = pixel.y - sourceNode.y;
	
	return {
		col: Math.round(deltaX / (opts.nodeWidth + opts.gap)),
		row: Math.round(deltaY / (opts.nodeHeight + opts.gap)),
	};
}

/**
 * Calculate absolute position for a group and its children
 * Per PRD Section 4.1: Group's row/col determines group position,
 * children's row/col are relative to group origin (with padding)
 * 
 * @param groupGrid - Group's grid coordinate relative to source
 * @param childGrid - Child's grid coordinate relative to group
 * @param sourceNode - Source node
 * @param options - Grid layout options
 * @returns Object with group position and child absolute position
 */
export function calculateGroupAndChildPositions(
	groupGrid: GridCoordinate,
	childGrid: GridCoordinate,
	sourceNode: CanvasNode,
	options: Partial<GridLayoutOptions> = {}
): {
	groupPosition: PixelCoordinate;
	childPosition: PixelCoordinate;
} {
	const opts = { ...DEFAULT_GRID_OPTIONS, ...options };
	const padding = opts.padding || 60; // Default group padding
	
	// Calculate group absolute position
	const groupPosition = gridToPixel(groupGrid, sourceNode, opts);
	
	// Calculate child absolute position
	// Child is relative to group's top-left + padding
	const childPosition = gridToPixelFromOrigin(
		childGrid,
		{
			x: groupPosition.x + padding,
			y: groupPosition.y + padding,
		},
		opts
	);
	
	return { groupPosition, childPosition };
}

/**
 * Calculate bounding box for a set of grid coordinates
 * Returns the minimum rectangle that contains all coordinates
 * 
 * @param coordinates - Array of grid coordinates
 * @param options - Grid layout options
 * @returns Bounding box with min/max row/col
 */
export function calculateGridBoundingBox(
	coordinates: GridCoordinate[],
	options: Partial<GridLayoutOptions> = {}
): {
	minRow: number;
	maxRow: number;
	minCol: number;
	maxCol: number;
	width: number;
	height: number;
} {
	if (coordinates.length === 0) {
		return { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0, width: 0, height: 0 };
	}
	
	const opts = { ...DEFAULT_GRID_OPTIONS, ...options };
	
	const minRow = Math.min(...coordinates.map(c => c.row));
	const maxRow = Math.max(...coordinates.map(c => c.row));
	const minCol = Math.min(...coordinates.map(c => c.col));
	const maxCol = Math.max(...coordinates.map(c => c.col));
	
	// Calculate pixel width and height
	const width = (maxCol - minCol + 1) * opts.nodeWidth + (maxCol - minCol) * opts.gap;
	const height = (maxRow - minRow + 1) * opts.nodeHeight + (maxRow - minRow) * opts.gap;
	
	return { minRow, maxRow, minCol, maxCol, width, height };
}

/**
 * Validate grid coordinate (check for negative or extreme values)
 * 
 * @param grid - Grid coordinate to validate
 * @param options - Validation options
 * @returns True if valid, false otherwise
 */
export function isValidGridCoordinate(
	grid: GridCoordinate,
	options: {
		allowNegative?: boolean;
		maxRow?: number;
		maxCol?: number;
	} = {}
): boolean {
	const { allowNegative = false, maxRow = 100, maxCol = 100 } = options;
	
	if (!allowNegative && (grid.row < 0 || grid.col < 0)) {
		return false;
	}
	
	if (grid.row > maxRow || grid.col > maxCol) {
		return false;
	}
	
	return true;
}

/**
 * Normalize grid coordinates to start from (0, 0)
 * Shifts all coordinates so the minimum is (0, 0)
 * 
 * @param coordinates - Array of grid coordinates
 * @returns Normalized coordinates
 */
export function normalizeGridCoordinates(
	coordinates: GridCoordinate[]
): GridCoordinate[] {
	if (coordinates.length === 0) {
		return [];
	}
	
	const minRow = Math.min(...coordinates.map(c => c.row));
	const minCol = Math.min(...coordinates.map(c => c.col));
	
	return coordinates.map(c => ({
		row: c.row - minRow,
		col: c.col - minCol,
	}));
}

/**
 * Get suggested placement for new content relative to source
 * Per PRD Section 3.1: Place to the Right (col=1) or Bottom (row=1)
 * 
 * @param preferredDirection - "right" or "bottom"
 * @returns Grid coordinate for placement
 */
export function getSuggestedPlacement(
	preferredDirection: "right" | "bottom" = "right"
): GridCoordinate {
	return preferredDirection === "right"
		? { row: 0, col: 1 }  // To the right
		: { row: 1, col: 0 }; // Below
}




