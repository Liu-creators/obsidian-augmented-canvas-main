/**
 * Spatial Analyzer Module
 * Provides intelligent node positioning based on canvas space analysis
 */

import { Canvas, CanvasNode } from "../obsidian/canvas-internal";
import { AugmentedCanvasSettings } from "../settings/AugmentedCanvasSettings";

/**
 * Direction enum for node placement
 */
export type Direction = "right" | "down" | "left" | "up";

/**
 * Layout preferences for spatial analysis
 */
export interface LayoutPreferences {
	mode: "horizontal" | "vertical" | "smart" | "radial";
	directionPriority: Direction[];
	minNodeSpacing: number;
	avoidOverlapStrength: number;
	respectAICoordinates: boolean;
}

/**
 * Direction score with analysis details
 */
export interface DirectionScore {
	direction: Direction;
	score: number;
	distanceScore: number;
	densityScore: number;
	preferenceScore: number;
	boundaryScore: number;
}

/**
 * Collision detection result
 */
export interface CollisionInfo {
	hasCollision: boolean;
	overlappingNodes: CanvasNode[];
	nearbyDensity: number;
	visualCrowding: number;
}

/**
 * Position with dimensions
 */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Default layout preferences
 */
export const DEFAULT_LAYOUT_PREFERENCES: LayoutPreferences = {
	mode: "smart",
	directionPriority: ["right", "down", "left", "up"],
	minNodeSpacing: 120, // Increased from 60 to provide more space between nodes
	avoidOverlapStrength: 80,
	respectAICoordinates: true,
};

/**
 * Get layout preferences from settings
 */
export function getLayoutPreferences(
	settings: AugmentedCanvasSettings
): LayoutPreferences {
	// Use settings preferences if available, otherwise use defaults
	return {
		...DEFAULT_LAYOUT_PREFERENCES,
		...settings.layoutPreferences,
		// Ensure minimum spacing is at least 100px for comfortable viewing
		minNodeSpacing: Math.max(
			100,
			settings.layoutPreferences?.minNodeSpacing || 
			settings.gridGap || 
			DEFAULT_LAYOUT_PREFERENCES.minNodeSpacing
		),
	};
}

/**
 * Analyze canvas space and return best direction scores
 */
export function analyzeBestDirection(
	canvas: Canvas,
	sourceNode: CanvasNode,
	preferences: LayoutPreferences
): DirectionScore[] {
	const directions: Direction[] = ["right", "down", "left", "up"];
	const scores: DirectionScore[] = [];

	for (const direction of directions) {
		const score = scoreDirection(canvas, sourceNode, direction, preferences);
		scores.push(score);
	}

	// Sort by total score (descending)
	scores.sort((a, b) => b.score - a.score);

	return scores;
}

/**
 * Calculate score for a specific direction
 */
function scoreDirection(
	canvas: Canvas,
	sourceNode: CanvasNode,
	direction: Direction,
	preferences: LayoutPreferences
): DirectionScore {
	// 1. Distance factor (30% weight) - how far is the nearest node
	const nearestDistance = findNearestNodeInDirection(
		canvas,
		sourceNode,
		direction
	);
	const distanceScore = Math.min(100, (nearestDistance / 500) * 100);

	// 2. Density factor (40% weight) - how crowded is the region
	const regionDensity = calculateRegionDensity(
		canvas,
		sourceNode,
		direction,
		800
	);
	const densityScore = Math.max(0, 100 - regionDensity);

	// 3. User preference factor (20% weight)
	const priorityIndex = preferences.directionPriority.indexOf(direction);
	const preferenceScore =
		priorityIndex >= 0 ? 100 - priorityIndex * 25 : 0;

	// 4. Boundary factor (10% weight) - avoid canvas edges
	const boundaryPenalty = checkBoundaryProximity(
		canvas,
		sourceNode,
		direction
	);
	const boundaryScore = Math.max(0, 100 - boundaryPenalty);

	// Calculate weighted total score
	const totalScore =
		distanceScore * 0.3 +
		densityScore * 0.4 +
		preferenceScore * 0.2 +
		boundaryScore * 0.1;

	return {
		direction,
		score: totalScore,
		distanceScore,
		densityScore,
		preferenceScore,
		boundaryScore,
	};
}

/**
 * Find nearest node in a specific direction
 * Returns distance in pixels
 */
function findNearestNodeInDirection(
	canvas: Canvas,
	sourceNode: CanvasNode,
	direction: Direction
): number {
	const allNodes = Array.from(canvas.nodes.values());
	let minDistance = Infinity;

	const sourceCenterX = sourceNode.x + sourceNode.width / 2;
	const sourceCenterY = sourceNode.y + sourceNode.height / 2;

	for (const node of allNodes) {
		if (node.id === sourceNode.id) continue;

		const nodeCenterX = node.x + node.width / 2;
		const nodeCenterY = node.y + node.height / 2;

		// Check if node is in the specified direction
		let isInDirection = false;
		let distance = 0;

		switch (direction) {
			case "right":
				isInDirection = nodeCenterX > sourceCenterX;
				if (isInDirection) {
					distance = Math.sqrt(
						Math.pow(nodeCenterX - sourceCenterX, 2) +
							Math.pow(nodeCenterY - sourceCenterY, 2)
					);
				}
				break;
			case "down":
				isInDirection = nodeCenterY > sourceCenterY;
				if (isInDirection) {
					distance = Math.sqrt(
						Math.pow(nodeCenterX - sourceCenterX, 2) +
							Math.pow(nodeCenterY - sourceCenterY, 2)
					);
				}
				break;
			case "left":
				isInDirection = nodeCenterX < sourceCenterX;
				if (isInDirection) {
					distance = Math.sqrt(
						Math.pow(nodeCenterX - sourceCenterX, 2) +
							Math.pow(nodeCenterY - sourceCenterY, 2)
					);
				}
				break;
			case "up":
				isInDirection = nodeCenterY < sourceCenterY;
				if (isInDirection) {
					distance = Math.sqrt(
						Math.pow(nodeCenterX - sourceCenterX, 2) +
							Math.pow(nodeCenterY - sourceCenterY, 2)
					);
				}
				break;
		}

		if (isInDirection && distance < minDistance) {
			minDistance = distance;
		}
	}

	return minDistance === Infinity ? 1000 : minDistance;
}

/**
 * Calculate density in a region
 * Returns density score (0-100, where 100 is very crowded)
 */
function calculateRegionDensity(
	canvas: Canvas,
	sourceNode: CanvasNode,
	direction: Direction,
	regionSize: number
): number {
	const allNodes = Array.from(canvas.nodes.values());
	const sourceCenterX = sourceNode.x + sourceNode.width / 2;
	const sourceCenterY = sourceNode.y + sourceNode.height / 2;

	// Define region bounds based on direction
	let regionBounds: Rect;
	switch (direction) {
		case "right":
			regionBounds = {
				x: sourceNode.x + sourceNode.width,
				y: sourceCenterY - regionSize / 2,
				width: regionSize,
				height: regionSize,
			};
			break;
		case "down":
			regionBounds = {
				x: sourceCenterX - regionSize / 2,
				y: sourceNode.y + sourceNode.height,
				width: regionSize,
				height: regionSize,
			};
			break;
		case "left":
			regionBounds = {
				x: sourceNode.x - regionSize,
				y: sourceCenterY - regionSize / 2,
				width: regionSize,
				height: regionSize,
			};
			break;
		case "up":
			regionBounds = {
				x: sourceCenterX - regionSize / 2,
				y: sourceNode.y - regionSize,
				width: regionSize,
				height: regionSize,
			};
			break;
	}

	// Count nodes in region
	let nodesInRegion = 0;
	let totalNodeArea = 0;

	for (const node of allNodes) {
		if (node.id === sourceNode.id) continue;

		if (rectanglesOverlap(regionBounds, node)) {
			nodesInRegion++;
			totalNodeArea += node.width * node.height;
		}
	}

	// Calculate density (percentage of region covered by nodes)
	const regionArea = regionSize * regionSize;
	const densityPercentage = (totalNodeArea / regionArea) * 100;

	// Also factor in node count (more nodes = more crowded)
	const countFactor = Math.min(100, nodesInRegion * 20);

	// Combined density score
	return Math.min(100, densityPercentage + countFactor);
}

/**
 * Check if position is too close to canvas boundaries
 * Returns penalty score (0-100)
 */
function checkBoundaryProximity(
	canvas: Canvas,
	sourceNode: CanvasNode,
	direction: Direction
): number {
	// For now, return 0 (no penalty)
	// In a real implementation, you would check canvas viewport bounds
	// This requires access to canvas viewport coordinates which may not be easily available
	return 0;
}

/**
 * Check if two rectangles overlap
 */
export function rectanglesOverlap(rect1: Rect, rect2: Rect): boolean {
	return !(
		rect1.x + rect1.width < rect2.x ||
		rect1.x > rect2.x + rect2.width ||
		rect1.y + rect1.height < rect2.y ||
		rect1.y > rect2.y + rect2.height
	);
}

/**
 * Check if position is within radius of another node
 */
export function isWithinRadius(
	pos: { x: number; y: number },
	node: CanvasNode,
	radius: number
): boolean {
	const nodeCenterX = node.x + node.width / 2;
	const nodeCenterY = node.y + node.height / 2;
	const distance = Math.sqrt(
		Math.pow(pos.x - nodeCenterX, 2) + Math.pow(pos.y - nodeCenterY, 2)
	);
	return distance <= radius;
}

/**
 * Calculate visual crowding score
 */
export function calculateVisualCrowding(nodes: CanvasNode[]): number {
	if (nodes.length === 0) return 0;

	// Simple crowding metric: number of nodes
	// Could be enhanced to consider actual overlap and density
	return Math.min(100, nodes.length * 10);
}

/**
 * Enhanced collision detection with density awareness
 */
export function checkCollisionWithDensity(
	position: Rect,
	existingNodes: CanvasNode[],
	bufferZone: number
): CollisionInfo {
	const expandedRect: Rect = {
		x: position.x - bufferZone,
		y: position.y - bufferZone,
		width: position.width + bufferZone * 2,
		height: position.height + bufferZone * 2,
	};

	const overlappingNodes = existingNodes.filter((node) =>
		rectanglesOverlap(expandedRect, node)
	);

	const nearbyNodes = existingNodes.filter((node) =>
		isWithinRadius(
			{ x: position.x + position.width / 2, y: position.y + position.height / 2 },
			node,
			bufferZone * 3
		)
	);

	return {
		hasCollision: overlappingNodes.length > 0,
		overlappingNodes,
		nearbyDensity: nearbyNodes.length,
		visualCrowding: calculateVisualCrowding(nearbyNodes),
	};
}

/**
 * Calculate position in a specific direction from source node
 */
export function calculatePositionInDirection(
	sourceNode: CanvasNode,
	direction: Direction,
	nodeSize: { width: number; height: number },
	spacing: number
): { x: number; y: number } {
	const gap = spacing;

	switch (direction) {
		case "right":
			return {
				x: sourceNode.x + sourceNode.width + gap,
				y: sourceNode.y,
			};
		case "down":
			return {
				x: sourceNode.x,
				y: sourceNode.y + sourceNode.height + gap,
			};
		case "left":
			return {
				x: sourceNode.x - nodeSize.width - gap,
				y: sourceNode.y,
			};
		case "up":
			return {
				x: sourceNode.x,
				y: sourceNode.y - nodeSize.height - gap,
			};
	}
}

/**
 * Calculate openness score in a direction (0-100)
 * Higher score means more open space
 */
export function calculateOpenness(
	canvas: Canvas,
	sourceNode: CanvasNode,
	direction: Direction,
	distance: number
): number {
	const nearestDistance = findNearestNodeInDirection(
		canvas,
		sourceNode,
		direction
	);
	const density = calculateRegionDensity(canvas, sourceNode, direction, distance);

	// Openness is inverse of density, boosted by distance
	const distanceFactor = Math.min(100, (nearestDistance / distance) * 100);
	const sparsityFactor = 100 - density;

	// Combined openness score
	return (distanceFactor * 0.6 + sparsityFactor * 0.4);
}

