/**
 * Streaming Node Creator
 * Manages real-time creation of canvas nodes during AI response streaming
 */

import { CanvasNode, Canvas } from "../obsidian/canvas-internal";
import { NodeXML, GroupXML, EdgeXML } from "../types/xml.d";
import { ParsedNode } from "./groupGenerator";
import { AugmentedCanvasSettings } from "../settings/AugmentedCanvasSettings";
import { gridToPixel, DEFAULT_GRID_OPTIONS } from "./coordinateSystem";
import { getColorForType } from "./typeMapping";
import { addEdge } from "../obsidian/canvas-patches";
import { randomHexString } from "../utils";
import { 
	analyzeBestDirection, 
	calculatePositionInDirection, 
	getLayoutPreferences,
	Direction
} from "./spatialAnalyzer";

/**
 * Sleep utility for throttling
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Manages streaming creation of nodes and edges
 */
export class StreamingNodeCreator {
	private createdNodeMap: Map<string, CanvasNode>;
	private pendingEdges: EdgeXML[];
	private canvas: Canvas;
	private sourceNode: CanvasNode;
	private settings: AugmentedCanvasSettings;
	private nodeCounter: number = 0;
	
	// New fields for relationship-driven layout
	private firstNodeOrGroup: CanvasNode | null = null; // First created node or group
	private edgeRelations: Map<string, string[]> = new Map(); // from -> to[] mapping
	private nodePositions: Map<string, { x: number; y: number }> = new Map(); // Created node positions
	private placeholderNode: CanvasNode | null = null; // Placeholder reference
	private mainEdgeId: string | null = null; // Main edge ID
	private userQuestion: string = ""; // User question
	private createdEdges: Set<string> = new Set(); // Track created edges to avoid duplicates
	
	// New fields for dependency-aware node creation
	private pendingNodes: Map<string, NodeXML> = new Map(); // Store pending nodes
	private nodeDependencies: Map<string, string[]> = new Map(); // Store node dependencies (connected nodes via edges)
	private createdNodeIds: Set<string> = new Set(); // Track created node IDs
	private creatingNodes: Set<string> = new Set(); // Track nodes currently being created (to avoid circular dependencies)
	
	constructor(
		canvas: Canvas,
		sourceNode: CanvasNode,
		settings: AugmentedCanvasSettings
	) {
		this.canvas = canvas;
		this.sourceNode = sourceNode;
		this.settings = settings;
		this.createdNodeMap = new Map();
		this.pendingEdges = [];
	}
	
	/**
	 * Set placeholder and main edge information (called at streaming start)
	 */
	public setPlaceholder(
		placeholder: CanvasNode,
		mainEdgeId: string,
		userQuestion: string
	): void {
		this.placeholderNode = placeholder;
		this.mainEdgeId = mainEdgeId;
		this.userQuestion = userQuestion;
	}
	
	/**
	 * Create a node from XML format
	 * Now uses dependency-aware creation: creates related nodes first, then edges, then the node itself
	 */
	async createNodeFromXML(nodeXML: NodeXML): Promise<CanvasNode | null> {
		// Store the node in pending nodes if not already created
		if (!this.createdNodeIds.has(nodeXML.id)) {
			this.pendingNodes.set(nodeXML.id, nodeXML);
		}
		
		// Use dependency-aware creation
		return await this.createNodeWithDependencies(nodeXML);
	}
	
	/**
	 * Find nodes that are connected to the given node via edges
	 */
	private findNodeDependencies(nodeId: string): string[] {
		const dependencies: string[] = [];
		
		// Check all pending edges
		for (const edge of this.pendingEdges) {
			if (edge.from === nodeId) {
				// This node points to another node
				if (!dependencies.includes(edge.to)) {
					dependencies.push(edge.to);
				}
			}
			if (edge.to === nodeId) {
				// Another node points to this node
				if (!dependencies.includes(edge.from)) {
					dependencies.push(edge.from);
				}
			}
		}
		
		return dependencies;
	}
	
	/**
	 * Create a node with its dependencies first
	 * Order: 1. Dependencies (related nodes), 2. Edges, 3. Current node
	 */
	private async createNodeWithDependencies(nodeXML: NodeXML): Promise<CanvasNode | null> {
		// Avoid circular dependencies
		if (this.creatingNodes.has(nodeXML.id)) {
			console.warn(`[StreamingNodeCreator] Circular dependency detected for node ${nodeXML.id}, creating node directly`);
			return await this.createNodeDirectly(nodeXML);
		}
		
		// If already created, return it
		if (this.createdNodeIds.has(nodeXML.id)) {
			return this.createdNodeMap.get(nodeXML.id) || null;
		}
		
		// Mark as being created
		this.creatingNodes.add(nodeXML.id);
		
		try {
			// Step 1: Find dependencies (nodes connected via edges)
			const dependencies = this.findNodeDependencies(nodeXML.id);
			
			// Step 2: Create dependency nodes first (if they exist and haven't been created)
			for (const depId of dependencies) {
				if (!this.createdNodeIds.has(depId) && !this.creatingNodes.has(depId)) {
					const depNode = this.pendingNodes.get(depId);
					if (depNode) {
						console.log(`[StreamingNodeCreator] Creating dependency node ${depId} before ${nodeXML.id}`);
						await this.createNodeWithDependencies(depNode);
					}
				}
			}
			
			// Step 3: Create the current node
			const newNode = await this.createNodeDirectly(nodeXML);
			
			// Step 4: Create edges between this node and its dependencies (if both exist)
			// This happens after the node is created, so edges can be created immediately
			await this.createEdgesForNode(nodeXML.id);
			
			return newNode;
		} finally {
			// Remove from creating set
			this.creatingNodes.delete(nodeXML.id);
		}
	}
	
	/**
	 * Create edges for a specific node (if both endpoints exist)
	 */
	private async createEdgesForNode(nodeId: string): Promise<void> {
		for (const edge of this.pendingEdges) {
			// Check if this edge involves the node
			if (edge.from === nodeId || edge.to === nodeId) {
				const fromNode = this.createdNodeMap.get(edge.from);
				const toNode = this.createdNodeMap.get(edge.to);
				
				// If both nodes exist and are real nodes (not placeholders), create edge
				if (fromNode && toNode && fromNode.x !== undefined && toNode.x !== undefined) {
					await this.createEdgeImmediately(edge, fromNode, toNode);
				}
			}
		}
	}
	
	/**
	 * Directly create a node without dependency checking (internal method)
	 */
	private async createNodeDirectly(nodeXML: NodeXML): Promise<CanvasNode | null> {
		// If already created, return it
		if (this.createdNodeIds.has(nodeXML.id)) {
			return this.createdNodeMap.get(nodeXML.id) || null;
		}
		
		try {
			// Use relationship-driven position calculation instead of fixed grid
			const pixelPos = this.calculatePositionFromRelations(nodeXML.id);
			
			// Get color based on type
			const color = getColorForType(nodeXML.type);
			
			// Create text node on canvas
			const newNode = this.canvas.createTextNode({
				pos: { x: pixelPos.x, y: pixelPos.y },
				position: "left",
				size: { 
					width: this.settings.gridNodeWidth || 360, 
					height: this.settings.gridNodeHeight || 200 
				},
				text: nodeXML.content,
				focus: false,
			});
			
			// Apply color if specified
			if (color) {
				newNode.setData({ color });
			}
			
			this.canvas.addNode(newNode);
			
			// Store node
			this.createdNodeMap.set(nodeXML.id, newNode);
			this.nodePositions.set(nodeXML.id, { x: pixelPos.x, y: pixelPos.y });
			this.createdNodeIds.add(nodeXML.id);
			this.nodeCounter++;
			
			// If this is the first node, record it and redirect main edge
			if (!this.firstNodeOrGroup) {
				this.firstNodeOrGroup = newNode;
				await this.redirectMainEdge();
			}
			
			// Check if any pending edges can now be created
			await this.checkAndCreatePendingEdges(nodeXML.id);
			
			console.log(`[StreamingNodeCreator] Created node ${nodeXML.id} at (${pixelPos.x}, ${pixelPos.y})`);
			
			return newNode;
		} catch (error) {
			console.error(`[StreamingNodeCreator] Failed to create node ${nodeXML.id}:`, error);
			return null;
		}
	}
	
	/**
	 * Create a group with nested nodes from XML format
	 */
	async createGroupFromXML(groupXML: GroupXML): Promise<void> {
		try {
			// Group uses default position or relationship-based position
			const groupPixelPos = this.calculatePositionFromRelations(groupXML.id);
			
			const groupPadding = this.settings.groupPadding || 60;
			const groupId = randomHexString(16);
			
			// Create nodes inside group
			const groupNodes: any[] = [];
			for (const nodeXML of groupXML.nodes) {
				const nodePixelPos = gridToPixel(
					{ row: nodeXML.row, col: nodeXML.col },
					{
						x: groupPixelPos.x + groupPadding,
						y: groupPixelPos.y + groupPadding,
						width: 0,
						height: 0
					} as any,
					{
						nodeWidth: this.settings.gridNodeWidth || DEFAULT_GRID_OPTIONS.nodeWidth,
						nodeHeight: this.settings.gridNodeHeight || DEFAULT_GRID_OPTIONS.nodeHeight,
						gap: this.settings.gridGap || DEFAULT_GRID_OPTIONS.gap,
					}
				);
				
				const color = getColorForType(nodeXML.type);
				const nodeId = randomHexString(16);
				
				groupNodes.push({
					id: nodeId,
					type: "text",
					text: nodeXML.content,
					x: nodePixelPos.x,
					y: nodePixelPos.y,
					width: this.settings.gridNodeWidth || 360,
					height: this.settings.gridNodeHeight || 200,
					color: color || undefined,
				});
				
				// Store mapping for edge creation (using semantic ID)
				// We'll need to get the actual CanvasNode after import
				this.createdNodeMap.set(nodeXML.id, { id: nodeId } as any);
				this.nodeCounter++;
			}
			
			// Calculate group bounds
			if (groupNodes.length > 0) {
				const minX = Math.min(...groupNodes.map(n => n.x));
				const minY = Math.min(...groupNodes.map(n => n.y));
				const maxX = Math.max(...groupNodes.map(n => n.x + n.width));
				const maxY = Math.max(...groupNodes.map(n => n.y + n.height));
				
				const groupNodeData = {
					id: groupId,
					type: "group",
					label: groupXML.title,
					x: minX - groupPadding,
					y: minY - groupPadding,
					width: maxX - minX + groupPadding * 2,
					height: maxY - minY + groupPadding * 2,
					color: this.settings.defaultGroupColor || "4",
				};
				
				// Import group and nodes
				const data = this.canvas.getData();
				this.canvas.importData({
					nodes: [...data.nodes, groupNodeData, ...groupNodes],
					edges: data.edges,
				});
				
				await this.canvas.requestFrame();
				
				// If this is the first node/group, record it and redirect main edge
				if (!this.firstNodeOrGroup) {
					// Get the created group node reference
					const groupNode = Array.from(this.canvas.nodes.values()).find(
						n => n.id === groupId
					);
					
					if (groupNode) {
						this.firstNodeOrGroup = groupNode;
						await this.redirectMainEdge();
					}
				}
				
				console.log(`[StreamingNodeCreator] Created group ${groupXML.id} with ${groupXML.nodes.length} nodes`);
			}
		} catch (error) {
			console.error(`[StreamingNodeCreator] Failed to create group ${groupXML.id}:`, error);
		}
	}
	
	/**
	 * Create a node from Markdown parsed format
	 */
	async createNodeFromParsed(parsedNode: ParsedNode, index: number): Promise<CanvasNode | null> {
		try {
			// For Markdown format, we place nodes in a simple layout
			// Calculate position based on index
			const col = index % 3; // 3 columns
			const row = Math.floor(index / 3);
			
			const pixelPos = gridToPixel(
				{ row, col },
				this.sourceNode,
				{
					nodeWidth: this.settings.gridNodeWidth || DEFAULT_GRID_OPTIONS.nodeWidth,
					nodeHeight: this.settings.gridNodeHeight || DEFAULT_GRID_OPTIONS.nodeHeight,
					gap: this.settings.gridGap || DEFAULT_GRID_OPTIONS.gap,
				}
			);
			
			// Create text node
			const newNode = this.canvas.createTextNode({
				pos: { x: pixelPos.x, y: pixelPos.y },
				position: "left",
				size: { 
					width: this.settings.gridNodeWidth || 360, 
					height: this.settings.gridNodeHeight || 200 
				},
				text: parsedNode.content,
				focus: false,
			});
			
			this.canvas.addNode(newNode);
			
			// Store in map using index as ID for Markdown nodes
			this.createdNodeMap.set(`md_${index}`, newNode);
			this.nodeCounter++;
			
			console.log(`[StreamingNodeCreator] Created Markdown node ${index}`);
			
			return newNode;
		} catch (error) {
			console.error(`[StreamingNodeCreator] Failed to create Markdown node:`, error);
			return null;
		}
	}
	
	/**
	 * Store edge relationship and create immediately if both nodes exist
	 */
	storeEdge(edge: EdgeXML): void {
		this.pendingEdges.push(edge);
		
		// Build relationship mapping
		if (!this.edgeRelations.has(edge.from)) {
			this.edgeRelations.set(edge.from, []);
		}
		this.edgeRelations.get(edge.from)!.push(edge.to);
		
		// Update dependency graph for both nodes
		// edge.from depends on edge.to (from -> to means from needs to)
		if (!this.nodeDependencies.has(edge.from)) {
			this.nodeDependencies.set(edge.from, []);
		}
		if (!this.nodeDependencies.get(edge.from)!.includes(edge.to)) {
			this.nodeDependencies.get(edge.from)!.push(edge.to);
		}
		
		// edge.to also depends on edge.from (bidirectional dependency for rendering)
		if (!this.nodeDependencies.has(edge.to)) {
			this.nodeDependencies.set(edge.to, []);
		}
		if (!this.nodeDependencies.get(edge.to)!.includes(edge.from)) {
			this.nodeDependencies.get(edge.to)!.push(edge.from);
		}
		
		// If both nodes already created, create edge immediately
		const fromNode = this.createdNodeMap.get(edge.from);
		const toNode = this.createdNodeMap.get(edge.to);
		if (fromNode && toNode && fromNode.x !== undefined && toNode.x !== undefined) {
			// Both nodes exist, create edge immediately for progressive rendering
			this.createEdgeImmediately(edge, fromNode, toNode);
			console.log(`[StreamingNodeCreator] Edge ${edge.from} -> ${edge.to} created immediately (both nodes exist)`);
		} else {
			console.log(`[StreamingNodeCreator] Edge ${edge.from} -> ${edge.to} stored for later (nodes not ready)`);
		}
	}
	
	/**
	 * Create edge immediately when both nodes exist
	 */
	private async createEdgeImmediately(
		edge: EdgeXML,
		fromNode: CanvasNode,
		toNode: CanvasNode
	): Promise<void> {
		// Avoid creating duplicate edges
		const edgeKey = `${edge.from}-${edge.to}`;
		if (this.createdEdges.has(edgeKey)) {
			return;
		}
		
		const { fromSide, toSide } = this.determineEdgeSides(fromNode, toNode);
		
		addEdge(
			this.canvas,
			randomHexString(16),
			{ fromOrTo: "from", side: fromSide, node: fromNode },
			{ fromOrTo: "to", side: toSide, node: toNode },
			edge.label,
			{ isGenerated: true }
		);
		
		this.createdEdges.add(edgeKey);
		
		await this.canvas.requestFrame();
		
		console.log(`[StreamingNodeCreator] Created edge immediately: ${edge.from} -> ${edge.to}`);
	}
	
	/**
	 * Check and create pending edges for a specific node
	 */
	private async checkAndCreatePendingEdges(nodeId: string): Promise<void> {
		for (const edge of this.pendingEdges) {
			// If this node is either from or to, and both nodes exist, create the edge
			if (edge.from === nodeId || edge.to === nodeId) {
				const fromNode = this.createdNodeMap.get(edge.from);
				const toNode = this.createdNodeMap.get(edge.to);
				
				if (fromNode && toNode && fromNode.x !== undefined && toNode.x !== undefined) {
					await this.createEdgeImmediately(edge, fromNode, toNode);
				}
			}
		}
	}
	
	/**
	 * Create all pending edges
	 * Returns the number of edges created
	 */
	async createAllEdges(): Promise<number> {
		let createdCount = 0;
		
		for (const edge of this.pendingEdges) {
			const fromNode = this.createdNodeMap.get(edge.from);
			const toNode = this.createdNodeMap.get(edge.to);
			
			if (!fromNode || !toNode) {
				console.warn(
					`[StreamingNodeCreator] Skipping edge: ${edge.from} -> ${edge.to} (nodes not found)`
				);
				continue;
			}
			
			// If nodes are placeholder objects (from groups), skip edge creation
			if (!fromNode.x || !toNode.x) {
				console.warn(
					`[StreamingNodeCreator] Skipping edge: ${edge.from} -> ${edge.to} (nodes are placeholders)`
				);
				continue;
			}
			
			try {
				// Determine edge sides based on node positions
				const { fromSide, toSide } = this.determineEdgeSides(fromNode, toNode);
				
				// Create edge
				addEdge(
					this.canvas,
					randomHexString(16),
					{
						fromOrTo: "from",
						side: fromSide,
						node: fromNode,
					},
					{
						fromOrTo: "to",
						side: toSide,
						node: toNode,
					},
					edge.label,
					{
						isGenerated: true,
					}
				);
				
				createdCount++;
				
				console.log(
					`[StreamingNodeCreator] Created edge: ${edge.from} -> ${edge.to} (${edge.label || "no label"})`
				);
			} catch (error) {
				console.error(`[StreamingNodeCreator] Failed to create edge ${edge.from} -> ${edge.to}:`, error);
			}
		}
		
		return createdCount;
	}
	
	/**
	 * Get the total number of nodes created
	 */
	getCreatedNodeCount(): number {
		return this.nodeCounter;
	}
	
	/**
	 * Create all pending nodes that haven't been created yet
	 * This ensures nodes without connections are also created
	 */
	async createAllPendingNodes(): Promise<void> {
		for (const [nodeId, nodeXML] of this.pendingNodes.entries()) {
			if (!this.createdNodeIds.has(nodeId)) {
				console.log(`[StreamingNodeCreator] Creating pending node ${nodeId}`);
				await this.createNodeWithDependencies(nodeXML);
			}
		}
	}
	
	/**
	 * Calculate node position based on edge relationships and spatial analysis
	 */
	private calculatePositionFromRelations(nodeId: string): { x: number; y: number } {
		// Find edges pointing to this node
		const incomingEdges: string[] = [];
		for (const [from, toList] of this.edgeRelations.entries()) {
			if (toList.includes(nodeId)) {
				incomingEdges.push(from);
			}
		}
		
		// If there are source nodes, position based on the first source
		if (incomingEdges.length > 0) {
			const sourceId = incomingEdges[0];
			const sourceNode = this.createdNodeMap.get(sourceId);
			
			if (sourceNode && sourceNode.x !== undefined) {
				// NEW: Merge AI suggestion with spatial analysis
				return this.mergeAISuggestionWithSpatialAnalysis(sourceNode, nodeId);
			}
		}
		
		// Otherwise use default position with spatial awareness
		return this.calculateDefaultPosition();
	}
	
	/**
	 * Merge AI coordinate suggestion with spatial analysis
	 * This combines the relationship-driven positioning with space-aware intelligence
	 */
	private mergeAISuggestionWithSpatialAnalysis(
		sourceNode: CanvasNode,
		targetNodeId: string
	): { x: number; y: number } {
		const preferences = getLayoutPreferences(this.settings);
		
		// Get AI's suggested position using existing logic
		const aiSuggestedPos = this.calculatePositionNearNode(sourceNode, targetNodeId);
		
		// Analyze canvas space to find best direction
		const spatialAnalysis = analyzeBestDirection(this.canvas, sourceNode, preferences);
		const bestDirection = spatialAnalysis[0];
		
		console.log(`[StreamingNodeCreator] AI suggested: (${aiSuggestedPos.x}, ${aiSuggestedPos.y})`);
		console.log(`[StreamingNodeCreator] Spatial analysis best: ${bestDirection.direction} (score: ${bestDirection.score.toFixed(2)})`);
		
		// Decide whether to use AI suggestion or spatial analysis
		const respectAI = preferences.respectAICoordinates ;
		
		if (respectAI && bestDirection.score < 50) {
			// If spatial score is low but we respect AI, try AI's suggestion first
			// But still check for collisions
			if (!this.isPositionOccupied(
				aiSuggestedPos, 
				this.settings.gridNodeWidth || 360, 
				this.settings.gridNodeHeight || 200
			)) {
				console.log(`[StreamingNodeCreator] Using AI suggestion (no collision)`);
				return aiSuggestedPos;
			}
		}
		
		// Use spatial analysis to find best direction
		// Try directions in order of score
		for (const dirScore of spatialAnalysis) {
			const pos = calculatePositionInDirection(
				sourceNode,
				dirScore.direction,
				{ 
					width: this.settings.gridNodeWidth || 360, 
					height: this.settings.gridNodeHeight || 200 
				},
				preferences.minNodeSpacing
			);
			
			// Check if position is free
			if (!this.isPositionOccupied(
				pos,
				this.settings.gridNodeWidth || 360,
				this.settings.gridNodeHeight || 200
			)) {
				console.log(`[StreamingNodeCreator] Using spatial analysis: ${dirScore.direction}`);
				return pos;
			}
		}
		
		// Fallback: use AI suggestion with offset if all directions occupied
		console.log(`[StreamingNodeCreator] Fallback: AI suggestion with offset`);
		const offset = this.nodeCounter * 50;
		return {
			x: aiSuggestedPos.x,
			y: aiSuggestedPos.y + offset,
		};
	}
	
	/**
	 * Calculate position near an existing node (with collision avoidance)
	 */
	private calculatePositionNearNode(
		sourceNode: CanvasNode,
		targetNodeId: string
	): { x: number; y: number } {
		const nodeWidth = this.settings.gridNodeWidth || 360;
		const nodeHeight = this.settings.gridNodeHeight || 200;
		const gap = this.settings.gridGap || 60;
		
		// Try directions in priority order: right, down, left, up
		const directions = [
			{ x: sourceNode.x + sourceNode.width + gap, y: sourceNode.y }, // Right
			{ x: sourceNode.x, y: sourceNode.y + sourceNode.height + gap }, // Down
			{ x: sourceNode.x - nodeWidth - gap, y: sourceNode.y }, // Left
			{ x: sourceNode.x, y: sourceNode.y - nodeHeight - gap }, // Up
		];
		
		// Find first non-overlapping position
		for (const pos of directions) {
			if (!this.isPositionOccupied(pos, nodeWidth, nodeHeight)) {
				return pos;
			}
		}
		
		// If all overlap, use right side with vertical offset
		const offset = this.nodeCounter * 50;
		return {
			x: sourceNode.x + sourceNode.width + gap,
			y: sourceNode.y + offset,
		};
	}
	
	/**
	 * Check if position is occupied (simple collision detection)
	 */
	private isPositionOccupied(
		pos: { x: number; y: number },
		width: number,
		height: number
	): boolean {
		for (const [id, existingPos] of this.nodePositions.entries()) {
			const node = this.createdNodeMap.get(id);
			if (!node) continue;
			
			// Simple rectangle collision detection
			const overlap = !(
				pos.x + width < existingPos.x ||
				pos.x > existingPos.x + node.width ||
				pos.y + height < existingPos.y ||
				pos.y > existingPos.y + node.height
			);
			
			if (overlap) return true;
		}
		
		return false;
	}
	
	/**
	 * Calculate default position (for first node or nodes without relations)
	 * Now uses spatial analysis for smarter placement
	 */
	private calculateDefaultPosition(): { x: number; y: number } {
		const nodeWidth = this.settings.gridNodeWidth || 360;
		const nodeHeight = this.settings.gridNodeHeight || 200;
		const gap = this.settings.gridGap || 60;
		
		// First node: analyze best direction from source
		if (this.nodeCounter === 0) {
			const preferences = getLayoutPreferences(this.settings);
			const spatialAnalysis = analyzeBestDirection(
				this.canvas, 
				this.sourceNode, 
				preferences
			);
			
			const bestDirection = spatialAnalysis[0];
			console.log(`[StreamingNodeCreator] Default position using: ${bestDirection.direction}`);
			
			return calculatePositionInDirection(
				this.sourceNode,
				bestDirection.direction,
				{ width: nodeWidth, height: nodeHeight },
				gap
			);
		}
		
		// Subsequent nodes: use grid layout as fallback
		const col = this.nodeCounter % 3;
		const row = Math.floor(this.nodeCounter / 3);
		
		return {
			x: this.sourceNode.x + this.sourceNode.width + gap + col * (nodeWidth + gap),
			y: this.sourceNode.y + row * (nodeHeight + gap),
		};
	}
	
	/**
	 * Redirect main edge to first node/group
	 */
	public async redirectMainEdge(): Promise<void> {
		if (!this.placeholderNode || !this.mainEdgeId || !this.firstNodeOrGroup) {
			return;
		}
		
		// Get canvas data
		const data = this.canvas.getData();
		
		// Find main edge
		const mainEdge = data.edges.find((e: any) => e.id === this.mainEdgeId);
		if (!mainEdge) {
			console.warn("[StreamingNodeCreator] Main edge not found");
			return;
		}
		
		// Get source node (the node the edge is coming from)
		const sourceNodeId = mainEdge.fromNode;
		const sourceNode = this.canvas.nodes.get(sourceNodeId);
		
		if (!sourceNode) {
			console.warn("[StreamingNodeCreator] Source node not found for main edge");
			return;
		}
		
		// Determine correct edge sides based on actual node positions
		const { fromSide, toSide } = this.determineEdgeSides(
			sourceNode,
			this.firstNodeOrGroup
		);
		
		// Remove old edge
		const newEdges = data.edges.filter((e: any) => e.id !== this.mainEdgeId);
		
		// Use addEdge to create new edge with label (instead of importData)
		// This ensures the edge label is properly set
		const edgeLabel = this.userQuestion || mainEdge.label || "";
		
		console.log(`[StreamingNodeCreator] Redirecting main edge: ${fromSide} -> ${toSide} (from node at ${sourceNode.x},${sourceNode.y} to node at ${this.firstNodeOrGroup.x},${this.firstNodeOrGroup.y}) with label: "${edgeLabel}"`);
		
		// Remove old edge from canvas
		this.canvas.importData({
			nodes: data.nodes,
			edges: newEdges,
		});
		
		// Create new edge with label using addEdge
		addEdge(
			this.canvas,
			this.mainEdgeId,
			{
				fromOrTo: "from",
				side: fromSide,
				node: sourceNode,
			},
			{
				fromOrTo: "to",
				side: toSide,
				node: this.firstNodeOrGroup,
			},
			edgeLabel, // User question as edge label
			{
				isGenerated: true,
			}
		);
		
		await this.canvas.requestFrame();
		
		// Delete placeholder
		this.canvas.removeNode(this.placeholderNode);
		this.placeholderNode = null;
		
		console.log("[StreamingNodeCreator] Redirected main edge to first node/group");
	}
	
	/**
	 * Determine optimal edge connection sides based on node positions
	 */
	private determineEdgeSides(
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
				return { fromSide: "right", toSide: "left" };
			} else {
				return { fromSide: "left", toSide: "right" };
			}
		} else {
			// Vertical connection
			if (deltaY > 0) {
				return { fromSide: "bottom", toSide: "top" };
			} else {
				return { fromSide: "top", toSide: "bottom" };
			}
		}
	}
}

