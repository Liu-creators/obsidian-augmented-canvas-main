import { App } from "obsidian";
import { Canvas, CanvasNode } from "../obsidian/canvas-internal";
import { randomHexString } from "../utils";
import { addEdge } from "../obsidian/canvas-patches";

/**
 * Parsed node data from markdown
 */
export interface ParsedNode {
	title?: string;
	content: string;
}

/**
 * Layout position for a node
 */
export interface NodeLayout {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Parse AI response markdown into multiple nodes
 * Uses the new separator format: ---[NODE]---
 * This avoids conflicts with Markdown syntax like ### headers and --- horizontal rules
 * 
 * Also supports backward compatibility with old formats:
 * 1. ### Title format (fallback)
 * 2. --- separator format (fallback)
 */
export function parseNodesFromMarkdown(markdown: string): ParsedNode[] {
	const nodes: ParsedNode[] = [];
	
	// Primary: Use new ---[NODE]--- separator (avoids conflicts with Markdown)
	// Match pattern: ---[NODE]--- with optional whitespace, surrounded by newlines
	const newNodeSeparator = /\n\n---\s*\[NODE\]\s*---\n\n/g;
	const newFormatParts = markdown.split(newNodeSeparator).filter(part => part.trim());
	
	if (newFormatParts.length > 1) {
		// Successfully parsed using new separator
		for (const part of newFormatParts) {
			const content = part.trim();
			if (content) {
				// Content is preserved as-is, with all Markdown syntax intact
				nodes.push({ content });
			}
		}
		return nodes;
	}
	
	// Fallback 1: Try old ### header format (for backward compatibility)
	const headerRegex = /^###\s+(.+?)$/gm;
	const matches = Array.from(markdown.matchAll(headerRegex));
	
	if (matches.length > 0) {
		// Split by ### headers
		const parts = markdown.split(/^###\s+/gm).filter(part => part.trim());
		
		for (const part of parts) {
			const lines = part.split('\n');
			const title = lines[0].trim();
			const content = lines.slice(1).join('\n').trim();
			
			if (content) {
				nodes.push({ title, content });
			}
		}
		return nodes;
	}
	
	// Fallback 2: Try old --- separator format (for backward compatibility)
	const oldSeparatorParts = markdown.split(/\n---\n/).filter(part => part.trim());
	
	if (oldSeparatorParts.length > 1) {
		// Multiple parts separated by ---
		for (const part of oldSeparatorParts) {
			const trimmed = part.trim();
			if (trimmed) {
				nodes.push({ content: trimmed });
			}
		}
		return nodes;
	}
	
	// No separators found, treat as single node
	const trimmed = markdown.trim();
	if (trimmed) {
		nodes.push({ content: trimmed });
	}
	
	return nodes;
}

/**
 * Calculate text height based on content length
 * Uses approximate calculations similar to canvas-patches.ts
 */
function calcNodeHeight(content: string, width: number): number {
	const pxPerChar = 5;
	const pxPerLine = 28;
	const textPaddingHeight = 12;
	const minHeight = 100;
	const maxHeight = 600;
	
	const calcTextHeight = Math.round(
		textPaddingHeight + (pxPerLine * content.length) / (width / pxPerChar)
	);
	
	return Math.max(minHeight, Math.min(maxHeight, calcTextHeight));
}

/**
 * Calculate smart layout based on node count
 * Returns relative positions (0,0 based) for each node
 */
export function calculateSmartLayout(
	nodeContents: string[],
	options: {
		nodeWidth?: number;
		nodeSpacing?: number;
	} = {}
): NodeLayout[] {
	const nodeCount = nodeContents.length;
	const nodeWidth = options.nodeWidth || 360;
	const nodeSpacing = options.nodeSpacing || 40;
	
	const layouts: NodeLayout[] = [];
	
	// Determine layout strategy based on node count
	let columns: number;
	
	if (nodeCount <= 2) {
		// Horizontal layout for 1-2 nodes
		columns = nodeCount;
	} else if (nodeCount <= 4) {
		// 2x2 grid for 3-4 nodes
		columns = 2;
	} else if (nodeCount <= 6) {
		// 2x3 grid for 5-6 nodes
		columns = 2;
	} else {
		// 3 column grid for 7+ nodes
		columns = 3;
	}
	
	// Calculate positions
	let row = 0;
	let col = 0;
	let rowHeights: number[] = [];
	
	// First pass: calculate heights and positions
	for (let i = 0; i < nodeCount; i++) {
		const height = calcNodeHeight(nodeContents[i], nodeWidth);
		
		// Track maximum height in current row
		if (rowHeights[row] === undefined) {
			rowHeights[row] = height;
		} else {
			rowHeights[row] = Math.max(rowHeights[row], height);
		}
		
		const x = col * (nodeWidth + nodeSpacing);
		let y = 0;
		for (let r = 0; r < row; r++) {
			y += rowHeights[r] + nodeSpacing;
		}
		
		layouts.push({ x, y, width: nodeWidth, height });
		
		col++;
		if (col >= columns) {
			col = 0;
			row++;
		}
	}
	
	// Adjust heights to match row maximum
	let currentRow = 0;
	let currentCol = 0;
	for (let i = 0; i < layouts.length; i++) {
		layouts[i].height = rowHeights[currentRow];
		
		currentCol++;
		if (currentCol >= columns) {
			currentCol = 0;
			currentRow++;
		}
	}
	
	return layouts;
}

/**
 * Calculate bounding box for group based on node layouts
 */
function calculateGroupBounds(
	layouts: NodeLayout[],
	padding: number
): { width: number; height: number } {
	let maxX = 0;
	let maxY = 0;
	
	for (const layout of layouts) {
		maxX = Math.max(maxX, layout.x + layout.width);
		maxY = Math.max(maxY, layout.y + layout.height);
	}
	
	return {
		width: maxX + padding * 2,
		height: maxY + padding * 2,
	};
}

/**
 * Extract group label from user question or use default
 */
function extractGroupLabel(question?: string): string {
	if (!question) return "AI Generated Group";
	
	// Try to extract a meaningful short label from the question
	// Remove common question words and take first few words
	const cleaned = question
		.replace(/^(please|create|generate|make|give me|show me|can you|could you)\s+/i, '')
		.replace(/\?+$/, '')
		.trim();
	
	// Take first 50 characters max
	const label = cleaned.length > 50 ? cleaned.substring(0, 47) + "..." : cleaned;
	
	return label || "AI Generated Group";
}

/**
 * Create a group with multiple nodes inside it
 * 
 * @param canvas - Canvas instance
 * @param parsedNodes - Array of parsed nodes with content
 * @param options - Configuration options
 * @returns The created group node
 */
export async function createGroupWithNodes(
	canvas: Canvas,
	parsedNodes: ParsedNode[],
	options: {
		groupLabel?: string;
		groupColor?: string;
		nodeSpacing?: number;
		groupPadding?: number;
		parentNode?: CanvasNode;
		edgeLabel?: string;
	} = {}
): Promise<CanvasNode | null> {
	if (!canvas || parsedNodes.length === 0) {
		return null;
	}
	
	const {
		groupLabel = "AI Generated Group",
		groupColor = "4",
		nodeSpacing = 40,
		groupPadding = 60,
		parentNode,
		edgeLabel,
	} = options;
	
	// If only one node, don't create a group, just create a single node
	if (parsedNodes.length === 1) {
		return null;
	}
	
	// Calculate layouts
	const nodeContents = parsedNodes.map(n => n.content);
	const layouts = calculateSmartLayout(nodeContents, { nodeSpacing });
	const groupBounds = calculateGroupBounds(layouts, groupPadding);
	
	// Determine group position
	let groupX: number;
	let groupY: number;
	
	if (parentNode) {
		// Position relative to parent node
		groupX = parentNode.x;
		groupY = parentNode.y + parentNode.height + 110; // newNoteMarginWithLabel
	} else {
		// Center on canvas viewport
		// @ts-expect-error - accessing internal canvas properties
		groupX = canvas.x - groupBounds.width / 2;
		// @ts-expect-error
		groupY = canvas.y - groupBounds.height / 2;
	}
	
	// Create group node using importData (similar to how edges are created)
	const data = canvas.getData();
	const groupId = randomHexString(16);
	
	const groupNodeData = {
		id: groupId,
		type: "group",
		label: groupLabel,
		x: groupX,
		y: groupY,
		width: groupBounds.width,
		height: groupBounds.height,
		color: groupColor,
	};
	
	// Create text nodes with absolute positions
	const textNodes = parsedNodes.map((node, index) => {
		const layout = layouts[index];
		return {
			id: randomHexString(16),
			type: "text",
			text: node.content,
			x: groupX + groupPadding + layout.x,
			y: groupY + groupPadding + layout.y,
			width: layout.width,
			height: layout.height,
		};
	});
	
	// Import all nodes at once
	canvas.importData({
		nodes: [...data.nodes, groupNodeData, ...textNodes],
		edges: data.edges,
	});
	
	await canvas.requestFrame();
	
	// Get the created group node
	const groupNode = canvas.nodes.get(groupId);
	
	if (!groupNode) {
		return null;
	}
	
	// Create edge from parent node to group if parent exists
	if (parentNode && groupNode) {
		addEdge(
			canvas,
			randomHexString(16),
			{
				fromOrTo: "from",
				side: "bottom",
				node: parentNode,
			},
			{
				fromOrTo: "to",
				side: "top",
				node: groupNode,
			},
			edgeLabel,
			{
				isGenerated: true,
			}
		);
	}
	
	return groupNode;
}

