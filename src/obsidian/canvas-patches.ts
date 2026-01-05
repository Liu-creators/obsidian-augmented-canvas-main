import { ItemView } from "obsidian";
import { AllCanvasNodeData } from "obsidian/canvas";
import { randomHexString } from "../utils";
import { Canvas, CanvasNode, CreateNodeOptions } from "./canvas-internal";
import { 
	analyzeBestDirection, 
	calculatePositionInDirection, 
	getLayoutPreferences 
} from "../utils/spatialAnalyzer";
import { AugmentedCanvasSettings } from "../settings/AugmentedCanvasSettings";

export interface CanvasEdgeIntermediate {
	fromOrTo: string;
	side: string;
	node: CanvasElement;
}

interface CanvasElement {
	id: string;
}

export type CanvasView = ItemView & {
	canvas: Canvas;
};

/**
 * Minimum width for new notes
 */
const minWidth = 360;

/**
 * Assumed pixel width per character
 */
const pxPerChar = 5;

/**
 * Assumed pixel height per line
 */
const pxPerLine = 28;

/**
 * Assumed height of top + bottom text area padding
 */
const textPaddingHeight = 12;

/**
 * Margin between new notes
 */
const newNoteMargin = 60;
const newNoteMarginWithLabel = 110;

/**
 * Min height of new notes
 */
const minHeight = 60;

/**
 * Choose height for generated note based on text length and parent height.
 * For notes beyond a few lines, the note will have scroll bar.
 * Not a precise science, just something that is not surprising.
 */
// export const calcHeight = (options: { parentHeight: number; text: string }) => {
export const calcHeight = (options: { text: string }) => {
	const calcTextHeight = Math.round(
		textPaddingHeight +
			(pxPerLine * options.text.length) / (minWidth / pxPerChar)
	);
	return calcTextHeight;
	// return Math.max(options.parentHeight, calcTextHeight);
};

const DEFAULT_NODE_WIDTH = 400;
const DEFAULT_NODE_HEIGHT = DEFAULT_NODE_WIDTH * (1024 / 1792) + 20;

/**
 * Determine optimal edge connection sides based on node positions
 */
function determineEdgeSides(
	fromNode: CanvasNode,
	toNode: CanvasNode
): { fromSide: string; toSide: string } {
	const fromCenterX = fromNode.x + fromNode.width / 2;
	const fromCenterY = fromNode.y + fromNode.height / 2;
	const toCenterX = toNode.x + toNode.width / 2;
	const toCenterY = toNode.y + toNode.height / 2;
	
	const deltaX = toCenterX - fromCenterX;
	const deltaY = toCenterY - fromCenterY;
	
	// Determine primary direction
	if (Math.abs(deltaX) > Math.abs(deltaY)) {
		// Horizontal connection
		if (deltaX > 0) {
			// Target is to the right
			return { fromSide: "right", toSide: "left" };
		} else {
			// Target is to the left
			return { fromSide: "left", toSide: "right" };
		}
	} else {
		// Vertical connection
		if (deltaY > 0) {
			// Target is below
			return { fromSide: "bottom", toSide: "top" };
		} else {
			// Target is above
			return { fromSide: "top", toSide: "bottom" };
		}
	}
}

/**
 * Create new node as descendant from the parent node.
 * Align and offset relative to siblings.
 * 
 * @param canvas - Canvas instance
 * @param nodeOptions - Options for creating the node
 * @param parentNode - Parent node to position relative to
 * @param nodeData - Additional node data
 * @param edgeLabel - Label for the edge connecting to parent
 * @param settings - Plugin settings (optional, enables smart positioning)
 */
export const createNode = (
	canvas: Canvas,
	nodeOptions: CreateNodeOptions,
	parentNode?: CanvasNode,
	nodeData?: Partial<AllCanvasNodeData>,
	edgeLabel?: string,
	settings?: AugmentedCanvasSettings
) => {
	if (!canvas) {
		throw new Error("Invalid arguments");
	}

	const { text } = nodeOptions;

	const width = parentNode
		? nodeOptions?.size?.width || Math.max(minWidth, parentNode?.width)
		: DEFAULT_NODE_WIDTH;

	const height = text
		? parentNode
			? nodeOptions?.size?.height ||
			  Math.max(
					minHeight,
					parentNode &&
						calcHeight({
							text,
							// parentHeight: parentNode.height
						})
			  )
			: DEFAULT_NODE_HEIGHT
		: undefined;

	// @ts-expect-error
	let x = canvas.x - width / 2;
	// @ts-expect-error
	let y = canvas.y - height / 2;

	if (parentNode) {
		// Check if smart positioning is enabled
		const useSmartPositioning = settings && settings.layoutPreferences;
		
		if (useSmartPositioning) {
			// ===== SMART POSITIONING =====
			// Use spatial analyzer to find best direction
			const preferences = getLayoutPreferences(settings);
			const directionScores = analyzeBestDirection(canvas, parentNode, preferences);
			const bestDirection = directionScores[0];
			
			console.log(`[SmartLayout] Best direction: ${bestDirection.direction} (score: ${bestDirection.score.toFixed(2)})`);
			
			// Use larger spacing if there's an edge label to prevent overlap
			const spacing = edgeLabel 
				? preferences.minNodeSpacing + 50  // Extra 50px for edge label
				: preferences.minNodeSpacing;
			
			// Calculate position in best direction
			const position = calculatePositionInDirection(
				parentNode,
				bestDirection.direction,
				{ width, height: height || 200 },
				spacing
			);
			
			x = position.x;
			y = position.y;
			
			// Adjust y for "left" position mode (center-based)
			if (height) {
				y = y + height * 0.5;
			}
		} else {
			// ===== LEGACY POSITIONING =====
			// Original logic: position relative to siblings or below parent
			const siblings =
				parent &&
				canvas
					.getEdgesForNode(parentNode)
					.filter((n) => n.from.node.id == parentNode.id)
					.map((e) => e.to.node);

			// Failsafe leftmost value.
			const farLeft = parentNode.y - parentNode.width * 5;
			const siblingsRight = siblings?.length
				? siblings.reduce(
						(right, sib) => Math.max(right, sib.x + sib.width),
						farLeft
				  )
				: undefined;
			const priorSibling = siblings[siblings.length - 1];

			// Position left at right of prior sibling, otherwise aligned with parent
			x =
				siblingsRight != null
					? siblingsRight + newNoteMargin
					: parentNode.x;

			// Position top at prior sibling top, otherwise offset below parent
			y =
				(priorSibling
					? priorSibling.y
					: parentNode.y +
					  parentNode.height +
					  (edgeLabel ? newNoteMarginWithLabel : newNoteMargin)) +
				// Using position=left, y value is treated as vertical center
				height! * 0.5;
		}
	}

	const newNode =
		nodeOptions.type === "file"
			? //  @ts-expect-error
			  canvas.createFileNode({
					file: nodeOptions.file,
					pos: { x, y },
					// // position: "left",
					// size: { height, width },
					// focus: false,
			  })
			: canvas.createTextNode({
					pos: { x, y },
					position: "left",
					size: { height, width },
					text,
					focus: false,
			  });

	if (nodeData) {
		newNode.setData(nodeData);
	}

	canvas.deselectAll();
	canvas.addNode(newNode);

	let edgeId: string | undefined;
	
	if (parentNode) {
		edgeId = randomHexString(16);
		
		// Determine edge sides based on actual node positions
		// This ensures edges connect correctly regardless of layout direction
		const { fromSide, toSide } = determineEdgeSides(parentNode, newNode);
		
		console.log(`[SmartLayout] Edge sides: ${fromSide} -> ${toSide} (from node at ${parentNode.x},${parentNode.y} to node at ${newNode.x},${newNode.y})`);
		
		addEdge(
			canvas,
			edgeId,
			{
				fromOrTo: "from",
				side: fromSide,
				node: parentNode,
			},
			{
				fromOrTo: "to",
				side: toSide,
				node: newNode,
			},
			edgeLabel,
			{
				isGenerated: true,
			}
		);
	}

	return newNode;
};

/**
 * Add edge entry to canvas.
 */
export const addEdge = (
	canvas: Canvas,
	edgeID: string,
	fromEdge: CanvasEdgeIntermediate,
	toEdge: CanvasEdgeIntermediate,
	label?: string,
	edgeData?: {
		isGenerated: boolean;
	}
): string => {
	if (!canvas) return edgeID;

	const data = canvas.getData();

	if (!data) return edgeID;

	canvas.importData({
		edges: [
			...data.edges,
			{
				...edgeData,
				id: edgeID,
				fromNode: fromEdge.node.id,
				fromSide: fromEdge.side,
				toNode: toEdge.node.id,
				toSide: toEdge.side,
				label,
			},
		],
		nodes: data.nodes,
	});

	canvas.requestFrame();
	
	return edgeID;
};

/**
 * Trap exception and write to console.error.
 */
export function trapError<T>(fn: (...params: unknown[]) => T) {
	return (...params: unknown[]) => {
		try {
			return fn(...params);
		} catch (e) {
			console.error(e);
		}
	};
}
