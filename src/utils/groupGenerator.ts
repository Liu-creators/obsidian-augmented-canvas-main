import { App } from "obsidian";
import { Canvas, CanvasNode } from "../obsidian/canvas-internal";
import { randomHexString } from "../utils";
import { addEdge, CanvasEdgeIntermediate } from "../obsidian/canvas-patches";

/**
 * Parsed node data from markdown
 */
export interface ParsedNode {
	title?: string;
	content: string;
}

/**
 * Connection information between nodes
 */
export interface ConnectionInfo {
	fromIndex: number;  // 0-based index
	toIndex: number;    // 0-based index
	label?: string;     // Optional edge label
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
 * Parse connection information from markdown
 * Extracts connections after ---[CONNECTIONS]--- separator
 * Supports both standalone connections section and connections embedded in node content
 */
export function parseConnectionsFromMarkdown(
	markdown: string,
	nodeCount: number
): ConnectionInfo[] {
	const connections: ConnectionInfo[] = [];
	
	// First, try to find standalone connections section (with double newlines)
	let connectionsText = "";
	const connectionSeparator = /\n\n---\s*\[CONNECTIONS\]\s*---\s*\n\n/i;
	const separatorMatch = markdown.match(connectionSeparator);
	
	if (separatorMatch && separatorMatch.index !== undefined) {
		// Found standalone connections section
		connectionsText = markdown.substring(separatorMatch.index + separatorMatch[0].length).trim();
	} else {
		// Try to find connections embedded in content (more flexible matching)
		// Match: ---[CONNECTIONS]--- with optional whitespace/newlines
		const embeddedPattern = /(?:^|\n)\s*---\s*\[CONNECTIONS\]\s*---\s*\n?([\s\S]*?)(?:\n\n---\s*\[NODE\]\s*---|$)/i;
		const embeddedMatch = markdown.match(embeddedPattern);
		
		if (embeddedMatch && embeddedMatch[1]) {
			connectionsText = embeddedMatch[1].trim();
		} else {
			// Last resort: find any ---[CONNECTIONS]--- in the text
			const lastResortPattern = /---\s*\[CONNECTIONS\]\s*---\s*\n?([\s\S]*)$/i;
			const lastResortMatch = markdown.match(lastResortPattern);
			if (lastResortMatch && lastResortMatch[1]) {
				connectionsText = lastResortMatch[1].trim();
			}
		}
	}
	
	if (!connectionsText) {
		console.log('[GroupGenerator] No connections text found');
		return connections;
	}
	
	console.log(`[GroupGenerator] Parsing connections from text:\n${connectionsText}`);
	
	// Parse connection lines
	// Format: "1 -> 2: \"label\"" or "1 -> 2" or "1 -> 2: label"
	const connectionLineRegex = /^(\d+)\s*->\s*(\d+)(?:\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\n]+)))?/gm;
	const lines = connectionsText.split('\n');
	
	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine || trimmedLine.startsWith('#')) {
			// Skip empty lines and comments
			continue;
		}
		
		const match = trimmedLine.match(/^(\d+)\s*->\s*(\d+)(?:\s*:\s*(.+))?/);
		if (!match) {
			// Invalid format, skip
			continue;
		}
		
		const fromIndex = parseInt(match[1], 10) - 1; // Convert to 0-based
		const toIndex = parseInt(match[2], 10) - 1;   // Convert to 0-based
		let label: string | undefined;
		
		// Extract label (remove quotes if present)
		if (match[3]) {
			label = match[3].trim();
			// Remove surrounding quotes
			if ((label.startsWith('"') && label.endsWith('"')) ||
				(label.startsWith("'") && label.endsWith("'"))) {
				label = label.slice(1, -1);
			}
		}
		
		// Validate indices
		if (fromIndex < 0 || fromIndex >= nodeCount ||
			toIndex < 0 || toIndex >= nodeCount) {
			// Invalid index, skip
			continue;
		}
		
		// Skip self-connections
		if (fromIndex === toIndex) {
			continue;
		}
		
		connections.push({
			fromIndex,
			toIndex,
			label: label || undefined,
		});
		
		console.log(`[GroupGenerator] Parsed connection: ${fromIndex + 1} -> ${toIndex + 1}${label ? ` (${label})` : ''}`);
	}
	
	console.log(`[GroupGenerator] Total connections parsed: ${connections.length}`);
	return connections;
}

/**
 * Remove connections section from node content
 * This ensures connections text doesn't appear in the rendered node
 */
function removeConnectionsFromContent(content: string): string {
	// Remove ---[CONNECTIONS]--- and everything after it
	const connectionPattern = /(?:^|\n)\s*---\s*\[CONNECTIONS\]\s*---\s*[\s\S]*$/i;
	return content.replace(connectionPattern, '').trim();
}

/**
 * Parse AI response markdown into multiple nodes and connections
 * Supports the new separator format: ---[NODE]---
 * Also supports backward compatibility with old formats
 * Returns both nodes and connections
 */
export function parseNodesFromMarkdown(markdown: string): {
	nodes: ParsedNode[];
	connections: ConnectionInfo[];
} {
	const nodes: ParsedNode[] = [];
	
	// First, separate nodes and connections sections
	// Try to find standalone connections section first
	const connectionSeparator = /\n\n---\s*\[CONNECTIONS\]\s*---\s*\n\n/i;
	const separatorMatch = markdown.match(connectionSeparator);
	
	let nodesMarkdown = markdown;
	if (separatorMatch && separatorMatch.index !== undefined) {
		// Extract only the nodes part (before connections)
		nodesMarkdown = markdown.substring(0, separatorMatch.index).trim();
	}
	
	// Primary: Use new ---[NODE]--- separator (avoids conflicts with Markdown)
	// Match pattern: ---[NODE]--- with optional whitespace, surrounded by newlines
	const newNodeSeparator = /\n\n---\s*\[NODE\]\s*---\n\n/g;
	const newFormatParts = nodesMarkdown.split(newNodeSeparator).filter(part => part.trim());
	
	if (newFormatParts.length > 1) {
		// Successfully parsed using new separator
		for (const part of newFormatParts) {
			let content = part.trim();
			// Remove connections section if it appears in node content
			content = removeConnectionsFromContent(content);
			if (content) {
				// Content is preserved as-is, with all Markdown syntax intact
				nodes.push({ content });
			}
		}
	} else {
		// Fallback 1: Try old ### header format (for backward compatibility)
		const headerRegex = /^###\s+(.+?)$/gm;
		const matches = Array.from(nodesMarkdown.matchAll(headerRegex));
		
		if (matches.length > 0) {
			// Split by ### headers
			const parts = nodesMarkdown.split(/^###\s+/gm).filter(part => part.trim());
			
			for (const part of parts) {
				const lines = part.split('\n');
				const title = lines[0].trim();
				let content = lines.slice(1).join('\n').trim();
				// Remove connections section if it appears in node content
				content = removeConnectionsFromContent(content);
				
				if (content) {
					nodes.push({ title, content });
				}
			}
		} else {
			// Fallback 2: Try old --- separator format (for backward compatibility)
			const oldSeparatorParts = nodesMarkdown.split(/\n---\n/).filter(part => part.trim());
			
			if (oldSeparatorParts.length > 1) {
				// Multiple parts separated by ---
				for (const part of oldSeparatorParts) {
					let trimmed = part.trim();
					// Remove connections section if it appears in node content
					trimmed = removeConnectionsFromContent(trimmed);
					if (trimmed) {
						nodes.push({ content: trimmed });
					}
				}
			} else {
				// No separators found, treat as single node
				let trimmed = nodesMarkdown.trim();
				// Remove connections section if it appears in node content
				trimmed = removeConnectionsFromContent(trimmed);
				if (trimmed) {
					nodes.push({ content: trimmed });
				}
			}
		}
	}
	
	// Parse connections (use original markdown to find connections anywhere)
	const connections = parseConnectionsFromMarkdown(markdown, nodes.length);
	
	return { nodes, connections };
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
 * Determine edge sides based on relative positions of two nodes
 */
function determineEdgeSides(
	fromLayout: NodeLayout,
	toLayout: NodeLayout
): { fromSide: string; toSide: string } {
	const fromCenterX = fromLayout.x + fromLayout.width / 2;
	const fromCenterY = fromLayout.y + fromLayout.height / 2;
	const toCenterX = toLayout.x + toLayout.width / 2;
	const toCenterY = toLayout.y + toLayout.height / 2;
	
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
 * Create a group with multiple nodes inside it and connect them
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
		connections?: ConnectionInfo[];
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
		connections = [],
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
	
	// Get the created group node and text nodes
	const groupNode = canvas.nodes.get(groupId);
	const createdTextNodes: CanvasNode[] = [];
	
	for (const textNodeData of textNodes) {
		const node = canvas.nodes.get(textNodeData.id);
		if (node) {
			createdTextNodes.push(node);
		}
	}
	
	if (!groupNode) {
		return null;
	}
	
	// Create edges between nodes based on connections
	if (connections.length > 0) {
		console.log(`[GroupGenerator] Creating ${connections.length} connections between nodes`);
	}
	
	for (const connection of connections) {
		if (connection.fromIndex >= 0 && connection.fromIndex < createdTextNodes.length &&
			connection.toIndex >= 0 && connection.toIndex < createdTextNodes.length) {
			
			const fromNode = createdTextNodes[connection.fromIndex];
			const toNode = createdTextNodes[connection.toIndex];
			
			if (fromNode && toNode) {
				// Determine edge sides based on node positions
				const fromLayout = layouts[connection.fromIndex];
				const toLayout = layouts[connection.toIndex];
				const { fromSide, toSide } = determineEdgeSides(fromLayout, toLayout);
				
				console.log(`[GroupGenerator] Creating edge: ${connection.fromIndex + 1} -> ${connection.toIndex + 1}${connection.label ? ` (${connection.label})` : ''}`);
				
				// Create edge
				const fromEdge: CanvasEdgeIntermediate = {
					fromOrTo: "from",
					side: fromSide,
					node: fromNode,
				};
				
				const toEdge: CanvasEdgeIntermediate = {
					fromOrTo: "to",
					side: toSide,
					node: toNode,
				};
				
				addEdge(
					canvas,
					randomHexString(16),
					fromEdge,
					toEdge,
					connection.label,
					{
						isGenerated: true,
					}
				);
			} else {
				console.warn(`[GroupGenerator] Failed to find nodes for connection: ${connection.fromIndex + 1} -> ${connection.toIndex + 1}`);
			}
		} else {
			console.warn(`[GroupGenerator] Invalid connection indices: ${connection.fromIndex + 1} -> ${connection.toIndex + 1} (valid range: 1-${createdTextNodes.length})`);
		}
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
