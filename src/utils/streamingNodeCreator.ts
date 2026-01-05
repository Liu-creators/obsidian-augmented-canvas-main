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
import { addEdge, calcHeight } from "../obsidian/canvas-patches";
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
	private groupMembers: Map<string, string[]> = new Map(); // Group ID -> Node IDs mapping
	private nodeToGroup: Map<string, string> = new Map(); // Node ID -> Group ID mapping
	
	// Pre-created group support
	private preCreatedGroup: CanvasNode | null = null; // Pre-created group node
	private preCreatedGroupSemanticId: string | null = null; // Semantic ID for pre-created group
	private preCreatedGroupMainEdgeId: string | null = null; // Main edge ID for pre-created group
	private preCreatedGroupUserQuestion: string = ""; // User question for pre-created group
	
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
	 * @deprecated Use setPreCreatedGroup instead for immediate group creation
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
	 * Set pre-created group information (called when group is created immediately)
	 */
	public setPreCreatedGroup(
		group: CanvasNode,
		semanticId: string,
		mainEdgeId: string,
		userQuestion: string
	): void {
		this.preCreatedGroup = group;
		this.preCreatedGroupSemanticId = semanticId;
		this.preCreatedGroupMainEdgeId = mainEdgeId;
		this.preCreatedGroupUserQuestion = userQuestion;
		
		// Store the group in the createdNodeMap using semantic ID
		this.createdNodeMap.set(semanticId, group);
		this.groupMembers.set(semanticId, []);
		
		// Mark as first node/group for edge redirection (no need to redirect since edge already exists)
		this.firstNodeOrGroup = group;
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
	 * Update an existing node with partial content during streaming
	 */
	async updatePartialNode(nodeXML: NodeXML): Promise<void> {
		const node = this.createdNodeMap.get(nodeXML.id);
		
		if (node) {
			// If node exists, update its text and height if it changed
			if (node.text !== nodeXML.content) {
				node.setText(nodeXML.content);
				
				// Recalculate height based on new content to ensure group fits
				const newHeight = Math.max(
					this.settings.gridNodeHeight || 200,
					calcHeight({ text: nodeXML.content })
				);
				
				if (Math.abs(node.height - newHeight) > 1) {
					node.setData({ height: newHeight });
				}
				
				// If node is in a group, update group bounds
				const groupId = this.nodeToGroup.get(nodeXML.id);
				if (groupId) {
					await this.updateGroupBounds(groupId);
				}
			}
		} else {
			// If node doesn't exist yet, create it
			await this.createNodeFromXML(nodeXML);
		}
	}

	/**
	 * Update an existing group or create a partial group during streaming
	 */
	async updatePartialGroup(groupXML: GroupXML): Promise<void> {
		// Check if this is the pre-created group
		const isPreCreatedGroup = this.preCreatedGroup && 
			this.preCreatedGroupSemanticId === groupXML.id;
		
		if (isPreCreatedGroup && this.preCreatedGroup) {
			// Update pre-created group title if changed
			const data = this.preCreatedGroup.getData();
			if (groupXML.title && groupXML.title !== "New Group" && data.label !== groupXML.title) {
				await this.updateGroupTitle(groupXML.id, groupXML.title);
			}
			return;
		}
		
		const groupNode = this.createdNodeMap.get(groupXML.id);
		
		if (groupNode) {
			// If group exists, maybe update title if it changed
			const data = groupNode.getData();
			if (groupXML.title && data.label !== groupXML.title) {
				await this.updateGroupTitle(groupXML.id, groupXML.title);
			}
		} else {
			// Create a partial group with no nodes yet
			await this.createPartialGroupDirectly(groupXML);
		}
	}
	
	/**
	 * Update group title
	 */
	async updateGroupTitle(groupSemanticId: string, newTitle: string): Promise<void> {
		const groupNode = this.createdNodeMap.get(groupSemanticId);
		if (!groupNode) {
			console.warn(`[StreamingNodeCreator] Group not found for title update: ${groupSemanticId}`);
			return;
		}
		
		const data = groupNode.getData();
		if (data.type !== "group") {
			console.warn(`[StreamingNodeCreator] Node is not a group: ${groupSemanticId}`);
			return;
		}
		
		if (data.label !== newTitle) {
			groupNode.setData({ label: newTitle });
			await this.canvas.requestFrame();
			console.log(`[StreamingNodeCreator] Updated group title: "${newTitle}"`);
		}
	}

	/**
	 * Create a partial group with no nodes (internal method)
	 */
	private async createPartialGroupDirectly(groupXML: GroupXML): Promise<void> {
		try {
			const groupPixelPos = this.calculatePositionFromRelations(groupXML.id);
			const groupId = randomHexString(16);
			const groupPadding = this.settings.groupPadding || 60;

			const groupNodeData = {
				id: groupId,
				type: "group",
				label: groupXML.title,
				x: groupPixelPos.x,
				y: groupPixelPos.y,
				width: 400, // Default initial width
				height: 300, // Default initial height
				color: this.settings.defaultGroupColor || "4",
			};

			const data = this.canvas.getData();
			this.canvas.importData({
				nodes: [...data.nodes, groupNodeData],
				edges: data.edges,
			});

			await this.canvas.requestFrame();

			const groupNode = Array.from(this.canvas.nodes.values()).find(
				n => n.id === groupId
			);

			if (groupNode) {
				this.createdNodeMap.set(groupXML.id, groupNode);
				this.groupMembers.set(groupXML.id, []);
				
				if (!this.firstNodeOrGroup) {
					this.firstNodeOrGroup = groupNode;
					await this.redirectMainEdge();
				}
			}
		} catch (error) {
			console.error(`[StreamingNodeCreator] Failed to create partial group ${groupXML.id}:`, error);
		}
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

			// Handle group membership if specified in XML
			if (nodeXML.groupId) {
				const groupSemanticId = nodeXML.groupId;
				this.nodeToGroup.set(nodeXML.id, groupSemanticId);
				
				// Check if this is the pre-created group
				if (this.preCreatedGroup && this.preCreatedGroupSemanticId === groupSemanticId) {
					// Node belongs to pre-created group - ensure it's tracked
					if (!this.groupMembers.has(groupSemanticId)) {
						this.groupMembers.set(groupSemanticId, []);
					}
					if (!this.groupMembers.get(groupSemanticId)!.includes(nodeXML.id)) {
						this.groupMembers.get(groupSemanticId)!.push(nodeXML.id);
					}
					
					// Update group bounds immediately
					await this.updateGroupBounds(groupSemanticId);
				} else {
					// Regular group handling
					if (!this.groupMembers.has(groupSemanticId)) {
						this.groupMembers.set(groupSemanticId, []);
					}
					if (!this.groupMembers.get(groupSemanticId)!.includes(nodeXML.id)) {
						this.groupMembers.get(groupSemanticId)!.push(nodeXML.id);
					}
				}
			}
			
			// If this is the first node, record it and redirect main edge (only if no pre-created group)
			if (!this.firstNodeOrGroup && !this.preCreatedGroup) {
				this.firstNodeOrGroup = newNode;
				await this.redirectMainEdge();
			}
			
			// Check if any pending edges can now be created
			await this.checkAndCreatePendingEdges(nodeXML.id);
			
			// If node is in a group, update group bounds
			const groupSemanticId = this.nodeToGroup.get(nodeXML.id);
			if (groupSemanticId) {
				await this.updateGroupBounds(groupSemanticId);
			}

			console.log(`[StreamingNodeCreator] Created node ${nodeXML.id} at (${pixelPos.x}, ${pixelPos.y})`);
			
			return newNode;
		} catch (error) {
			console.error(`[StreamingNodeCreator] Failed to create node ${nodeXML.id}:`, error);
			return null;
		}
	}
	
	/**
	 * Create a group with nested nodes from XML format
	 * Supports reusing pre-created group if semantic ID matches
	 */
	async createGroupFromXML(groupXML: GroupXML): Promise<void> {
		try {
			// Check if this group matches the pre-created group
			const isPreCreatedGroup = this.preCreatedGroup && 
				this.preCreatedGroupSemanticId === groupXML.id;
			
			let groupNode: CanvasNode;
			let groupId: string;
			let groupPixelPos: { x: number; y: number };
			
			if (isPreCreatedGroup && this.preCreatedGroup) {
				// Reuse pre-created group
				groupNode = this.preCreatedGroup;
				groupId = groupNode.id;
				groupPixelPos = { x: groupNode.x, y: groupNode.y };
				
				// Update group title if AI provided one
				if (groupXML.title && groupXML.title !== "New Group") {
					await this.updateGroupTitle(groupXML.id, groupXML.title);
				}
				
				console.log(`[StreamingNodeCreator] Reusing pre-created group ${groupXML.id}`);
			} else {
				// Create new group (fallback for cases where AI generates multiple groups)
				groupPixelPos = this.calculatePositionFromRelations(groupXML.id);
				groupId = randomHexString(16);
				
				// Create the group node later after calculating bounds
				groupNode = null as any; // Will be set after nodes are created
			}
			
			const groupPadding = this.settings.groupPadding || 60;
			
			// Track group members for auto-resizing
			const memberIds: string[] = [];
			if (this.groupMembers.has(groupXML.id)) {
				// Preserve existing members if reusing pre-created group
				memberIds.push(...(this.groupMembers.get(groupXML.id) || []));
			}
			this.groupMembers.set(groupXML.id, memberIds);

			// Detect if this is a quadrant layout (four nodes with symmetric negative/positive coordinates)
			const isQuadrantLayout = this.detectQuadrantLayout(groupXML.nodes);
			
			// Create nodes inside group
			const groupNodes: any[] = [];
			for (const nodeXML of groupXML.nodes) {
				// Check if node already exists (might have been created by createNodeFromXML/updatePartialNode)
				const existingNode = this.createdNodeMap.get(nodeXML.id);
				
				if (existingNode && existingNode.x !== undefined) {
					// Node already exists and is rendered, just update its groupId mapping
					this.nodeToGroup.set(nodeXML.id, groupXML.id); // Use semantic ID
					if (!memberIds.includes(nodeXML.id)) {
						memberIds.push(nodeXML.id);
					}
					// We'll update its position later if needed, but for now we keep its current pos
					continue;
				}

				// Calculate node position with optimized spacing for quadrant layouts
				const nodePixelPos = this.calculateNodePositionInGroup(
					nodeXML,
					groupPixelPos,
					groupPadding,
					isQuadrantLayout
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
				this.createdNodeMap.set(nodeXML.id, { id: nodeId } as any);
				this.nodeToGroup.set(nodeXML.id, groupXML.id); // Use semantic ID for group mapping
				memberIds.push(nodeXML.id);
				this.nodeCounter++;
			}
			
			// Handle group creation or node addition
			if (isPreCreatedGroup && this.preCreatedGroup) {
				// For pre-created group, just add nodes and update bounds
				if (groupNodes.length > 0) {
					const data = this.canvas.getData();
					this.canvas.importData({
						nodes: [...data.nodes, ...groupNodes],
						edges: data.edges,
					});
					
					await this.canvas.requestFrame();
					
					// Get actual CanvasNode references for created nodes
					for (const nodeXML of groupXML.nodes) {
						const actualNode = Array.from(this.canvas.nodes.values()).find(
							n => n.id === this.createdNodeMap.get(nodeXML.id)?.id
						);
						if (actualNode) {
							this.createdNodeMap.set(nodeXML.id, actualNode);
							this.createdNodeIds.add(nodeXML.id);
						}
					}
					
					// Update group bounds to include new nodes
					await this.updateGroupBounds(groupXML.id);
				}
				
				console.log(`[StreamingNodeCreator] Added ${groupXML.nodes.length} nodes to pre-created group ${groupXML.id}`);
			} else {
				// Create new group (fallback for multiple groups)
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
					
					// Get actual CanvasNode references
					groupNode = Array.from(this.canvas.nodes.values()).find(
						n => n.id === groupId
					) as CanvasNode;
					
					if (groupNode) {
						this.createdNodeMap.set(groupXML.id, groupNode);
					}
					
					// Get actual CanvasNode references for created nodes
					for (const nodeXML of groupXML.nodes) {
						const actualNode = Array.from(this.canvas.nodes.values()).find(
							n => n.id === this.createdNodeMap.get(nodeXML.id)?.id
						);
						if (actualNode) {
							this.createdNodeMap.set(nodeXML.id, actualNode);
							this.createdNodeIds.add(nodeXML.id);
						}
					}

					// If this is the first node/group, record it and redirect main edge
					if (!this.firstNodeOrGroup) {
						if (groupNode) {
							this.firstNodeOrGroup = groupNode;
							await this.redirectMainEdge();
						}
					}
					
					console.log(`[StreamingNodeCreator] Created group ${groupXML.id} with ${groupXML.nodes.length} nodes`);
				}
			}
		} catch (error) {
			console.error(`[StreamingNodeCreator] Failed to create group ${groupXML.id}:`, error);
		}
	}

	/**
	 * Update group bounds to fit all member nodes
	 * This ensures the group container always contains its children as they grow
	 */
	private async updateGroupBounds(groupId: string): Promise<void> {
		const groupNode = this.createdNodeMap.get(groupId);
		if (!groupNode) return;

		// Check if it's a group node using getData()
		const data = groupNode.getData();
		if (data.type !== "group") return;

		const memberSemanticIds = this.groupMembers.get(groupId);
		if (!memberSemanticIds || memberSemanticIds.length === 0) {
			// If no members yet, set a small default size
			if (groupNode.width !== 400 || groupNode.height !== 300) {
				groupNode.setData({ width: 400, height: 300 });
				await this.canvas.requestFrame();
			}
			return;
		}

		const memberNodes: CanvasNode[] = [];
		for (const id of memberSemanticIds) {
			const node = this.createdNodeMap.get(id);
			// Only include nodes that are already rendered (have x/y)
			if (node && node.x !== undefined) {
				memberNodes.push(node);
			}
		}

		if (memberNodes.length === 0) return;

		const padding = this.settings.groupPadding || 60;
		
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

		memberNodes.forEach(node => {
			minX = Math.min(minX, node.x);
			minY = Math.min(minY, node.y);
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		});

		const newX = minX - padding;
		const newY = minY - padding;
		const newWidth = maxX - minX + padding * 2;
		const newHeight = maxY - minY + padding * 2;

		// Only update if dimensions changed significantly to avoid jitter and performance issues
		// Threshold of 2 pixels is used to prevent micro-adjustments
		if (Math.abs(groupNode.x - newX) > 2 || 
			Math.abs(groupNode.y - newY) > 2 || 
			Math.abs(groupNode.width - newWidth) > 2 || 
			Math.abs(groupNode.height - newHeight) > 2) {
			
			groupNode.setData({
				x: newX,
				y: newY,
				width: newWidth,
				height: newHeight
			});
			
			await this.canvas.requestFrame();
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
		let skippedCount = 0;
		
		for (const edge of this.pendingEdges) {
			// Skip if already created
			const edgeKey = `${edge.from}-${edge.to}`;
			if (this.createdEdges.has(edgeKey)) {
				continue;
			}

			const fromNode = this.createdNodeMap.get(edge.from);
			const toNode = this.createdNodeMap.get(edge.to);
			
			if (!fromNode || !toNode) {
				console.warn(
					`[StreamingNodeCreator] Skipping edge: ${edge.from} -> ${edge.to} (nodes not found)`
				);
				skippedCount++;
				continue;
			}
			
			// If nodes are placeholder objects (from groups), skip edge creation
			if (fromNode.x === undefined || toNode.x === undefined) {
				console.warn(
					`[StreamingNodeCreator] Skipping edge: ${edge.from} -> ${edge.to} (nodes are placeholders)`
				);
				skippedCount++;
				continue;
			}
			
			try {
				await this.createEdgeImmediately(edge, fromNode, toNode);
				createdCount++;
			} catch (error) {
				console.error(`[StreamingNodeCreator] Failed to create edge ${edge.from} -> ${edge.to}:`, error);
				skippedCount++;
			}
		}
		
		if (skippedCount > 0) {
			console.log(`[StreamingNodeCreator] Finished edge creation: ${createdCount} created, ${skippedCount} skipped.`);
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

	/**
	 * Detect if nodes form a quadrant layout pattern
	 * Quadrant layout: 4 nodes with symmetric coordinates like (-1,-1), (-1,1), (1,-1), (1,1)
	 */
	private detectQuadrantLayout(nodes: NodeXML[]): boolean {
		if (nodes.length !== 4) return false;
		
		const coords = nodes.map(n => ({ row: n.row || 0, col: n.col || 0 }));
		
		// Check if coordinates form a 2x2 grid with symmetric distribution
		const rows = new Set(coords.map(c => c.row));
		const cols = new Set(coords.map(c => c.col));
		
		// Should have exactly 2 distinct row values and 2 distinct col values
		if (rows.size !== 2 || cols.size !== 2) return false;
		
		// Check if coordinates are symmetric (negative and positive values)
		const rowValues = Array.from(rows).sort((a, b) => a - b);
		const colValues = Array.from(cols).sort((a, b) => a - b);
		
		// For quadrant layout, we expect symmetric distribution around origin
		// e.g., row: [-1, 1], col: [-1, 1]
		const isSymmetric = 
			rowValues[0] < 0 && rowValues[1] > 0 &&
			colValues[0] < 0 && colValues[1] > 0 &&
			Math.abs(rowValues[0]) === Math.abs(rowValues[1]) &&
			Math.abs(colValues[0]) === Math.abs(colValues[1]);
		
		return isSymmetric;
	}

	/**
	 * Calculate node position within a group, with special handling for quadrant layouts
	 */
	private calculateNodePositionInGroup(
		nodeXML: NodeXML,
		groupPixelPos: { x: number; y: number },
		groupPadding: number,
		isQuadrantLayout: boolean
	): { x: number; y: number } {
		const nodeWidth = this.settings.gridNodeWidth || DEFAULT_GRID_OPTIONS.nodeWidth;
		const nodeHeight = this.settings.gridNodeHeight || DEFAULT_GRID_OPTIONS.nodeHeight;
		const baseGap = this.settings.gridGap || DEFAULT_GRID_OPTIONS.gap;
		
		// For quadrant layouts, use larger spacing and center-based coordinates
		if (isQuadrantLayout) {
			// Use larger gap for quadrant layouts (2x normal gap for better visual separation)
			const quadrantGap = baseGap * 2;
			
			// For quadrant layout, we want to center the 2x2 grid in the group
			// Calculate the total width/height needed for 2 nodes with gap
			const totalWidth = nodeWidth * 2 + quadrantGap;
			const totalHeight = nodeHeight * 2 + quadrantGap;
			
			// Start position: group top-left + padding, then offset to center the quadrant grid
			// The center of the 2x2 grid should be at: groupPadding + totalWidth/2
			const gridCenterX = groupPixelPos.x + groupPadding + totalWidth / 2;
			const gridCenterY = groupPixelPos.y + groupPadding + totalHeight / 2;
			
			// Calculate position relative to grid center
			const row = nodeXML.row || 0;
			const col = nodeXML.col || 0;
			
			// Position node relative to center
			// For row=-1, place above center; for row=1, place below center
			// For col=-1, place left of center; for col=1, place right of center
			const x = gridCenterX + col * (nodeWidth + quadrantGap) / 2 - nodeWidth / 2;
			const y = gridCenterY + row * (nodeHeight + quadrantGap) / 2 - nodeHeight / 2;
			
			return { x, y };
		} else {
			// Normal layout: use standard grid-to-pixel conversion
			return gridToPixel(
				{ row: nodeXML.row || 0, col: nodeXML.col || 0 },
				{
					x: groupPixelPos.x + groupPadding,
					y: groupPixelPos.y + groupPadding,
					width: 0,
					height: 0
				} as any,
				{
					nodeWidth,
					nodeHeight,
					gap: baseGap,
				}
			);
		}
	}
}

