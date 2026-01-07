/**
 * Streaming Node Creator
 * Manages real-time creation of canvas nodes during AI response streaming
 *
 * 重构说明：
 * - 使用 groupGeneration/config.ts 中的配置常量
 * - 使用 groupGeneration/layoutEngine.ts 中的布局计算函数
 * - 使用 groupGeneration/types.ts 中的类型定义
 * - 保持向后兼容的 API
 *
 * Requirements: 1.1, 1.2, 5.10 - 架构分离和配置使用
 */

import { CanvasNode, Canvas } from "../obsidian/canvas-internal";
import { NodeXML, GroupXML, EdgeXML } from "../types/xml.d";
import { ParsedNode } from "./groupGenerator";
import { AugmentedCanvasSettings } from "../settings/AugmentedCanvasSettings";
import { gridToPixel, DEFAULT_GRID_OPTIONS } from "./coordinateSystem";
import { getColorForTypeWithDefault } from "./typeMapping";
import { addEdge, calcHeight } from "../obsidian/canvas-patches";
import { randomHexString } from "../utils";
import {
	analyzeBestDirection,
	calculatePositionInDirection,
	getLayoutPreferences,
} from "./spatialAnalyzer";

// 从新模块导入配置和类型
// Requirements: 5.10 - 布局计算使用配置管理器中的常量
import {
	LAYOUT_CONSTANTS,
	GroupGenerationConfig,
	createConfigFromSettings,
	EdgeDirection,
} from "./groupGeneration/config";

// 从新模块导入布局引擎函数
// Requirements: 3.1, 3.2, 3.3, 3.4 - 布局逻辑提取为纯函数
import {
	calculateNodePosition as layoutCalculateNodePosition,
	registerNodeInColumn as layoutRegisterNodeInColumn,
	calculateRepositioning,
	detectOverlaps,
	calculateGroupBounds,
	normalizeCoordinates,
	calculateSafeZones,
} from "./groupGeneration/layoutEngine";

// 从新模块导入类型定义
// Requirements: 9.1, 9.3, 9.4 - 类型安全增强
import {
	AnchorState,
	ColumnTrack,
	ColumnNodeInfo,
	NodeActualSize,
} from "./groupGeneration/types";

// 重新导出类型以保持向后兼容性
// Requirements: 1.2 - 保持向后兼容的 API
export type { EdgeDirection, AnchorState, ColumnTrack, ColumnNodeInfo, NodeActualSize };

// 重新导出 LAYOUT_CONSTANTS 以保持向后兼容性
export { LAYOUT_CONSTANTS };

/**
 * Manages streaming creation of nodes and edges
 *
 * 重构说明：
 * - 使用 GroupGenerationConfig 替代内联常量
 * - 使用 layoutEngine 中的纯函数进行布局计算
 * - 保持向后兼容的 API
 *
 * Requirements: 1.1, 1.2, 5.10 - 架构分离和配置使用
 */
export class StreamingNodeCreator {
	private createdNodeMap: Map<string, CanvasNode>;
	private pendingEdges: EdgeXML[];
	private canvas: Canvas;
	private sourceNode: CanvasNode;
	private settings: AugmentedCanvasSettings;
	private nodeCounter: number = 0;

	// 配置对象 - 从设置创建
	// Requirements: 5.10 - 布局计算使用配置管理器中的常量
	private config: GroupGenerationConfig;

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

	// Anchor state for pre-created groups (prevents layout jumping)
	private anchorState: AnchorState | null = null;

	// Layout tracking state for dynamic positioning (Requirements: 6.4, 8.2)
	private columnTracks: Map<number, ColumnTrack> = new Map();
	private nodeActualSizes: Map<string, NodeActualSize> = new Map();

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

		// 从设置创建配置对象
		// Requirements: 5.10 - 布局计算使用配置管理器中的常量
		this.config = createConfigFromSettings(settings);
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
	 * Now captures and locks the anchor position to prevent layout jumping
	 *
	 * @param group - The pre-created group canvas node
	 * @param semanticId - Semantic ID for the group (e.g., "g1")
	 * @param mainEdgeId - ID of the main edge connecting source to group
	 * @param userQuestion - User's question displayed on the edge
	 * @param edgeDirection - Direction from which the main edge connects to the group (default: 'left')
	 *
	 * Requirements: 7.1, 7.2, 7.3 - Edge Label Safe Zone
	 */
	public setPreCreatedGroup(
		group: CanvasNode,
		semanticId: string,
		mainEdgeId: string,
		userQuestion: string,
		edgeDirection: EdgeDirection = "left"
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

		// Lock anchor position to prevent layout jumping during streaming
		// Store edge direction for safe zone calculation (Requirements: 7.1, 7.2, 7.3)
		this.anchorState = {
			anchorX: group.x,
			anchorY: group.y,
			anchorLocked: true,
			minRowSeen: 0,
			minColSeen: 0,
			edgeDirection: edgeDirection,
		};

		// Clear layout tracking state for fresh group (Requirements: 6.4, 8.2)
		this.columnTracks.clear();
		this.nodeActualSizes.clear();

		console.log(`[StreamingNodeCreator] Anchor locked at (${group.x}, ${group.y}) for group ${semanticId}, edgeDirection=${edgeDirection}`);
	}

	/**
	 * Calculate node position anchored to pre-created group
	 * Uses dynamic stack layout: Y position based on actual heights of nodes above
	 *
	 * For row 0: y = anchorY + padding + topSafeZone
	 * For row > 0: y = prevNode.y + prevNode.actualHeight + VERTICAL_GAP
	 *
	 * This method does NOT use fixed grid height calculations. Instead, it accumulates
	 * actual heights to ensure proper stacking without overlap.
	 *
	 * Safe zones are applied based on edge direction to prevent overlap with edge labels:
	 * - If edge connects from 'top': add topSafeZone to first row
	 * - If edge connects from 'left': add leftSafeZone to first column
	 *
	 * CRITICAL (Requirement 12): The first node must clear the group header.
	 * Formula for first row: y = anchorY + GROUP_HEADER_HEIGHT + PADDING_TOP + topSafeZone
	 * This ensures the first node is positioned below the group's title bar from the
	 * very first render cycle, preventing content from clipping out of the top border.
	 *
	 * @param nodeXML - Node data with row/col grid coordinates
	 * @returns Pixel coordinates using dynamic stack layout
	 *
	 * Requirements: 6.1 - Dynamic Vertical Stack Layout
	 * Requirements: 7.1, 7.2, 7.3, 7.4 - Edge Label Safe Zone
	 * Requirements: 10.3 - Use accumulated heights, not fixed grid coordinates
	 * Requirements: 12.1, 12.2, 12.6 - Group Header Height Clearance
	 *
	 * 重构说明：使用 layoutEngine.calculateNodePosition 进行布局计算
	 * Requirements: 3.1, 3.2, 3.3, 3.4 - 布局逻辑提取为纯函数
	 */
	private calculateNodePositionInPreCreatedGroup(
		nodeXML: NodeXML
	): { x: number; y: number } {
		if (!this.anchorState || !this.preCreatedGroup) {
			// Fallback to existing behavior if no anchor
			console.warn("[StreamingNodeCreator] No anchor state, falling back to spatial analysis");
			return this.calculatePositionFromRelations(nodeXML.id);
		}

		// 使用配置中的常量
		// Requirements: 5.10 - 布局计算使用配置管理器中的常量
		const { maxGridCoord, nodeWidth: defaultNodeWidth, nodeHeight: defaultNodeHeight } = this.config;

		// Clamp coordinates to reasonable bounds
		const row = Math.max(-maxGridCoord, Math.min(maxGridCoord, nodeXML.row || 0));
		const col = Math.max(-maxGridCoord, Math.min(maxGridCoord, nodeXML.col || 0));

		// Log warning for out-of-range values
		if (nodeXML.row !== undefined && (nodeXML.row < -maxGridCoord || nodeXML.row > maxGridCoord)) {
			console.warn(`[StreamingNodeCreator] Row value ${nodeXML.row} clamped to ${row}`);
		}
		if (nodeXML.col !== undefined && (nodeXML.col < -maxGridCoord || nodeXML.col > maxGridCoord)) {
			console.warn(`[StreamingNodeCreator] Col value ${nodeXML.col} clamped to ${col}`);
		}

		// Track minimum coordinates for potential anchor adjustment
		this.anchorState.minRowSeen = Math.min(this.anchorState.minRowSeen, row);
		this.anchorState.minColSeen = Math.min(this.anchorState.minColSeen, col);

		// 使用 layoutEngine 中的纯函数计算位置
		// Requirements: 3.1, 3.2, 3.3, 3.4 - 布局逻辑提取为纯函数
		const position = layoutCalculateNodePosition(
			nodeXML.id,
			row,
			col,
			this.anchorState,
			this.columnTracks,
			this.config
		);

		// Calculate initial height for this node based on content
		const initialHeight = Math.max(
			defaultNodeHeight,
			calcHeight({ text: nodeXML.content })
		);

		// 使用标准化坐标进行列追踪注册
		const { normalizedRow, normalizedCol } = normalizeCoordinates(
			row,
			col,
			this.anchorState.minRowSeen,
			this.anchorState.minColSeen,
			maxGridCoord
		);

		// Register this node in column tracking for future dynamic layout
		// 使用 layoutEngine 中的函数
		layoutRegisterNodeInColumn(
			nodeXML.id,
			normalizedCol,
			normalizedRow,
			position.y,
			initialHeight,
			defaultNodeWidth,
			this.columnTracks,
			defaultNodeWidth
		);

		// 计算安全区域用于日志
		const { topSafeZone, leftSafeZone } = calculateSafeZones(
			this.anchorState.edgeDirection,
			this.config.edgeLabelSafeZone
		);

		console.log(`[StreamingNodeCreator] Calculated position for node ${nodeXML.id}: (${position.x}, ${position.y}) from grid (${row}, ${col}), normalized (${normalizedRow}, ${normalizedCol}), height=${initialHeight}, edgeDirection=${this.anchorState.edgeDirection}, topSafeZone=${topSafeZone}, leftSafeZone=${leftSafeZone}, headerClearance=${this.config.groupHeaderHeight + this.config.paddingTop}`);

		return position;
	}

	/**
	 * Register a node in column tracking for dynamic layout
	 * Creates column track if not exists, adds/updates node entry, sorts by row
	 *
	 * Also tracks column widths for horizontal spacing calculations:
	 * - Updates maxWidth when node is registered
	 * - Uses actual node width if larger than default
	 *
	 * @param nodeId - Semantic ID of the node
	 * @param col - Normalized column index
	 * @param row - Normalized row index
	 * @param y - Current Y position
	 * @param height - Actual rendered height
	 * @param width - Actual rendered width
	 *
	 * Requirements: 6.4 - Track actual rendered height of each node
	 * Requirements: 8.2, 8.3 - Track column widths for horizontal spacing
	 *
	 * 重构说明：此方法现在委托给 layoutEngine.registerNodeInColumn
	 * Requirements: 3.5, 3.6 - 动态高度追踪
	 */
	private registerNodeInColumn(
		nodeId: string,
		col: number,
		row: number,
		y: number,
		height: number,
		width: number
	): void {
		// 使用 layoutEngine 中的函数进行列追踪注册
		// Requirements: 3.5, 3.6 - 动态高度追踪
		layoutRegisterNodeInColumn(
			nodeId,
			col,
			row,
			y,
			height,
			width,
			this.columnTracks,
			this.config.nodeWidth
		);

		// 检查是否更新了列宽（用于日志）
		const colTrack = this.columnTracks.get(col);
		if (colTrack && width > colTrack.maxWidth) {
			console.log(`[StreamingNodeCreator] Column ${col} maxWidth updated to ${width} (node ${nodeId})`);
		}

		// Also track in nodeActualSizes for width tracking during content updates
		this.nodeActualSizes.set(nodeId, { width, height });
	}

	/**
	 * Reposition all nodes below a given row in the same column
	 * Called when a node's height changes during streaming
	 *
	 * Uses dynamic stack formula:
	 * newY = prevNode.y + prevNode.actualHeight + VERTICAL_GAP
	 *
	 * This method ensures nodes below the changed node are pushed down by the
	 * correct delta to maintain the no-overlap invariant.
	 *
	 * @param col - Normalized column index
	 * @param changedRow - Row of the node that changed height
	 *
	 * Requirements: 6.2 - Recalculate and reposition nodes when content grows
	 * Requirements: 10.1, 10.2 - Real-time reflow on content growth
	 * Requirements: 10.3 - Use accumulated heights for Y-positioning
	 *
	 * 重构说明：使用 layoutEngine.calculateRepositioning 计算位置更新
	 * Requirements: 3.5, 3.6 - 动态高度堆叠
	 */
	private async repositionNodesInColumn(
		col: number,
		changedRow: number
	): Promise<void> {
		const colTrack = this.columnTracks.get(col);
		if (!colTrack || colTrack.nodes.length === 0) {
			return; // No nodes in this column
		}

		// 使用 layoutEngine 中的纯函数计算重新定位
		// Requirements: 3.5, 3.6 - 动态高度堆叠
		const updates = calculateRepositioning(col, changedRow, this.columnTracks, this.config);

		if (updates.length === 0) {
			return; // No updates needed
		}

		// Apply position updates to canvas nodes
		for (const update of updates) {
			const canvasNode = this.createdNodeMap.get(update.nodeId);
			if (canvasNode && canvasNode.x !== undefined) {
				// 获取旧位置用于日志
				const nodeInfo = colTrack.nodes.find(n => n.nodeId === update.nodeId);
				const oldY = nodeInfo?.y ?? 0;

				canvasNode.setData({ y: update.newY });

				console.log(`[StreamingNodeCreator] Repositioned node ${update.nodeId} from y=${oldY} to y=${update.newY} (delta=${update.newY - oldY})`);

				// Update column tracking
				if (nodeInfo) {
					nodeInfo.y = update.newY;
				}

				// Also update nodePositions map
				const existingPos = this.nodePositions.get(update.nodeId);
				if (existingPos) {
					this.nodePositions.set(update.nodeId, { x: existingPos.x, y: update.newY });
				}
			}
		}

		// Batch all position updates into a single animation frame (Requirements: 10.4, 10.5)
		// Only call requestFrame once at the end to minimize reflow operations
		await this.canvas.requestFrame();

		// After repositioning, detect and correct any remaining overlaps
		// Requirements: 11.3 - Detect and correct overlaps before rendering
		await this.detectAndCorrectOverlapsInColumn(col);
	}

	/**
	 * Detect and correct any overlapping nodes in a column
	 *
	 * This method validates that no nodes overlap after repositioning and
	 * corrects any overlaps by pushing nodes down if detected.
	 *
	 * An overlap occurs when:
	 * nodeB.y < nodeA.y + nodeA.actualHeight + VERTICAL_GAP
	 * (where nodeA.row < nodeB.row)
	 *
	 * @param col - Column index to check for overlaps
	 * @returns true if overlaps were detected and corrected, false otherwise
	 *
	 * Requirements: 11.3 - Detect and correct overlaps before rendering
	 *
	 * 重构说明：使用 layoutEngine.detectOverlaps 检测重叠
	 * Requirements: 7.2 - 无重叠不变量
	 */
	private async detectAndCorrectOverlapsInColumn(col: number): Promise<boolean> {
		const colTrack = this.columnTracks.get(col);
		if (!colTrack || colTrack.nodes.length < 2) {
			return false; // Need at least 2 nodes to have an overlap
		}

		// 使用 layoutEngine 中的纯函数检测重叠
		// Requirements: 7.2 - 无重叠不变量
		const corrections = detectOverlaps(col, this.columnTracks, this.config);

		if (corrections.length === 0) {
			return false;
		}

		// Apply corrections
		for (const correction of corrections) {
			console.warn(
				`[StreamingNodeCreator] OVERLAP DETECTED in column ${col}: ` +
				`Node ${correction.nodeId} needs correction to y=${correction.correctedY}`
			);

			// Correct the overlap by pushing node down
			const canvasNode = this.createdNodeMap.get(correction.nodeId);
			if (canvasNode && canvasNode.x !== undefined) {
				canvasNode.setData({ y: correction.correctedY });

				// Update column tracking
				const nodeInfo = colTrack.nodes.find(n => n.nodeId === correction.nodeId);
				if (nodeInfo) {
					nodeInfo.y = correction.correctedY;
				}

				// Update nodePositions map
				const existingPos = this.nodePositions.get(correction.nodeId);
				if (existingPos) {
					this.nodePositions.set(correction.nodeId, { x: existingPos.x, y: correction.correctedY });
				}

				console.log(
					`[StreamingNodeCreator] Corrected overlap: Node ${correction.nodeId} moved to y=${correction.correctedY}`
				);
			}
		}

		// Request a frame update after corrections
		await this.canvas.requestFrame();

		return true;
	}

	/**
	 * Detect and correct overlaps in all columns
	 *
	 * This method iterates through all tracked columns and checks for overlaps,
	 * correcting any that are found. Useful for validation after batch operations.
	 *
	 * @returns Object containing detection results for each column
	 *
	 * Requirements: 11.3 - Detect and correct overlaps before rendering
	 */
	public async detectAndCorrectAllOverlaps(): Promise<{ columnsChecked: number; overlapsFound: number }> {
		let columnsChecked = 0;
		let overlapsFound = 0;

		for (const [col] of this.columnTracks) {
			columnsChecked++;
			const hadOverlaps = await this.detectAndCorrectOverlapsInColumn(col);
			if (hadOverlaps) {
				overlapsFound++;
			}
		}

		if (overlapsFound > 0) {
			console.warn(
				"[StreamingNodeCreator] Overlap detection complete: " +
				`${overlapsFound} column(s) with overlaps out of ${columnsChecked} checked`
			);
		}

		return { columnsChecked, overlapsFound };
	}

	/**
	 * Update the tracked height for a node and trigger repositioning if needed
	 * Called when node content changes during streaming
	 *
	 * This method implements the real-time reflow behavior:
	 * 1. Immediately recalculates the actual rendered height of the node
	 * 2. Immediately pushes down all nodes below it in the same column by the height delta
	 *
	 * @param nodeId - Semantic ID of the node
	 * @param newHeight - New actual height of the node
	 * @returns The column and row of the node if found, null otherwise
	 *
	 * Requirements: 6.2, 6.4 - Track and respond to height changes
	 * Requirements: 10.1 - Immediately recalculate actual rendered height
	 * Requirements: 10.2 - Immediately push down all nodes below
	 */
	private async updateNodeHeightAndReposition(
		nodeId: string,
		newHeight: number
	): Promise<{ col: number; row: number } | null> {
		// Find the node in column tracks
		for (const [col, colTrack] of this.columnTracks.entries()) {
			const nodeInfo = colTrack.nodes.find(n => n.nodeId === nodeId);
			if (nodeInfo) {
				const oldHeight = nodeInfo.actualHeight;
				const heightDelta = newHeight - oldHeight;

				// Only reposition if height actually changed significantly (Requirements: 10.1)
				if (Math.abs(heightDelta) > 1) {
					// Update the tracked height immediately
					nodeInfo.actualHeight = newHeight;

					// Update nodeActualSizes
					const existingSize = this.nodeActualSizes.get(nodeId);
					if (existingSize) {
						this.nodeActualSizes.set(nodeId, { width: existingSize.width, height: newHeight });
					}

					console.log(`[StreamingNodeCreator] Node ${nodeId} height changed from ${oldHeight} to ${newHeight} (delta=${heightDelta}), triggering reflow in column ${col}`);

					// Immediately reposition nodes below this one (Requirements: 10.2)
					// This pushes down all nodes below by the height delta
					await this.repositionNodesInColumn(col, nodeInfo.row);
				}

				return { col, row: nodeInfo.row };
			}
		}

		return null;
	}

	/**
	 * Update the tracked width for a node and update column maxWidth if needed
	 * Called when node content changes during streaming
	 *
	 * @param nodeId - Semantic ID of the node
	 * @param newWidth - New actual width of the node
	 * @returns true if column maxWidth was updated, false otherwise
	 *
	 * Requirements: 8.2 - Track actual width for column spacing calculations
	 */
	private updateNodeWidthTracking(
		nodeId: string,
		newWidth: number
	): boolean {
		// Update nodeActualSizes with new width
		const existingSize = this.nodeActualSizes.get(nodeId);
		if (existingSize) {
			// Only update if width actually changed
			if (Math.abs(existingSize.width - newWidth) > 1) {
				this.nodeActualSizes.set(nodeId, { width: newWidth, height: existingSize.height });

				// Find the column this node belongs to and update maxWidth if needed
				for (const [col, colTrack] of this.columnTracks.entries()) {
					const nodeInfo = colTrack.nodes.find(n => n.nodeId === nodeId);
					if (nodeInfo) {
						// Update column maxWidth if this node is now wider
						if (newWidth > colTrack.maxWidth) {
							const oldMaxWidth = colTrack.maxWidth;
							colTrack.maxWidth = newWidth;
							console.log(`[StreamingNodeCreator] Column ${col} maxWidth updated from ${oldMaxWidth} to ${newWidth} (node ${nodeId} width changed)`);
							return true;
						}
						break;
					}
				}
			}
		} else {
			// Node not yet tracked, add it
			this.nodeActualSizes.set(nodeId, { width: newWidth, height: this.settings.gridNodeHeight || 200 });
		}

		return false;
	}

	/**
	 * Create a node from XML format
	 * Now uses dependency-aware creation: creates related nodes first, then edges, then the node itself
	 *
	 * Detects pre-created group context and routes to anchor-based positioning when:
	 * - nodeXML.groupId matches preCreatedGroupSemanticId
	 * - anchorState is available
	 *
	 * Requirements: 2.1 - Relative Node Positioning Within Group
	 */
	async createNodeFromXML(nodeXML: NodeXML): Promise<CanvasNode | null> {
		// Store the node in pending nodes if not already created
		if (!this.createdNodeIds.has(nodeXML.id)) {
			this.pendingNodes.set(nodeXML.id, nodeXML);
		}

		// Detect pre-created group context for anchor-based positioning
		const isInPreCreatedGroup = this.isNodeInPreCreatedGroup(nodeXML);
		if (isInPreCreatedGroup) {
			console.log(`[StreamingNodeCreator] Node ${nodeXML.id} detected in pre-created group context, will use anchor-based positioning`);
		}

		// Use dependency-aware creation (which will route to anchor-based positioning if in pre-created group)
		return await this.createNodeWithDependencies(nodeXML);
	}

	/**
	 * Check if a node belongs to the pre-created group context
	 * Used to determine whether to use anchor-based positioning
	 *
	 * @param nodeXML - Node data with optional groupId
	 * @returns true if node should use anchor-based positioning
	 */
	private isNodeInPreCreatedGroup(nodeXML: NodeXML): boolean {
		return !!(
			nodeXML.groupId &&
			this.preCreatedGroup &&
			this.preCreatedGroupSemanticId === nodeXML.groupId &&
			this.anchorState
		);
	}

	/**
	 * Update an existing node with partial content during streaming
	 *
	 * IMPORTANT: This method preserves node position during content updates.
	 * Only text and height are updated, NOT x/y coordinates.
	 * This ensures node position stability under streaming (Property 3).
	 *
	 * When height changes, triggers repositioning of nodes below in the same column
	 * to maintain dynamic stack layout (Property 6, 7).
	 *
	 * Real-Time Reflow Behavior (Requirements 10.1, 10.2):
	 * 1. When content grows, immediately recalculates the actual rendered height
	 * 2. Immediately pushes down all nodes below in the same column by the height delta
	 * 3. Updates are batched within a single animation frame to prevent visual stuttering
	 *
	 * Requirements: 5.2 - Position preservation during content updates
	 * Requirements: 6.2 - Recalculate and reposition nodes when content grows
	 * Requirements: 10.1, 10.2 - Real-time reflow on content growth
	 */
	async updatePartialNode(nodeXML: NodeXML): Promise<void> {
		const node = this.createdNodeMap.get(nodeXML.id);

		if (node) {
			// If node exists, update its text and height if it changed
			// CRITICAL: Do NOT update x/y coordinates - position must remain stable
			if (node.text !== nodeXML.content) {
				// Capture current position and dimensions before any updates
				const currentX = node.x;
				const currentY = node.y;
				const oldHeight = node.height;
				const oldWidth = node.width;

				// Update text content only
				node.setText(nodeXML.content);

				// Immediately recalculate height based on new content (Requirements: 10.1)
				// This ensures we detect height changes as soon as content grows
				// 使用配置中的常量
				// Requirements: 5.10 - 布局计算使用配置管理器中的常量
				const newHeight = Math.max(
					this.config.nodeHeight,
					calcHeight({ text: nodeXML.content })
				);

				const heightChanged = Math.abs(oldHeight - newHeight) > 1;

				if (heightChanged) {
					// Update height only, explicitly preserve x/y position
					node.setData({
						height: newHeight,
						// Explicitly set x/y to current values to prevent any drift
						x: currentX,
						y: currentY
					});

					// Immediately trigger repositioning of nodes below this one (Requirements: 10.2)
					// This pushes down all nodes below by the height delta
					// The repositioning is batched within a single animation frame (Requirements: 10.4, 10.5)
					await this.updateNodeHeightAndReposition(nodeXML.id, newHeight);
				}

				// Track width changes for column spacing calculations (Requirements 8.2)
				// After content update, check if the node's actual width changed
				// This ensures column maxWidth is updated if node content causes width increase
				const newWidth = node.width;
				if (Math.abs(oldWidth - newWidth) > 1) {
					this.updateNodeWidthTracking(nodeXML.id, newWidth);
				}

				// If node is in a group, update group bounds
				// Note: updateGroupBounds will expand the group if needed but won't move this node
				const groupId = this.nodeToGroup.get(nodeXML.id);
				if (groupId) {
					await this.updateGroupBounds(groupId);
				}

				// Verify position was preserved (debug logging)
				if (Math.abs(node.x - currentX) > 0.1 || Math.abs(node.y - currentY) > 0.1) {
					console.warn(`[StreamingNodeCreator] Position drift detected for node ${nodeXML.id}: was (${currentX}, ${currentY}), now (${node.x}, ${node.y})`);
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
			// Determine position calculation method based on group membership
			let pixelPos: { x: number; y: number };

			// Check if node belongs to pre-created group and should use anchor-based positioning
			// Uses the helper method for consistent detection
			const belongsToPreCreatedGroup = this.isNodeInPreCreatedGroup(nodeXML);

			if (belongsToPreCreatedGroup) {
				// Use anchor-based positioning for nodes in pre-created groups
				pixelPos = this.calculateNodePositionInPreCreatedGroup(nodeXML);
				console.log(`[StreamingNodeCreator] Using anchor-based positioning for node ${nodeXML.id} in pre-created group`);
			} else {
				// Fallback to relationship-driven position calculation for non-group nodes
				pixelPos = this.calculatePositionFromRelations(nodeXML.id);
			}

			// Get color based on type, with guaranteed non-null result for visual clarity
			// Requirements: 11.1 - All created nodes must have a solid background color
			const color = getColorForTypeWithDefault(nodeXML.type);

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

			// Apply color - always set since getColorForTypeWithDefault guarantees a value
			// Requirements: 11.1 - Ensure all created nodes have a solid background color
			newNode.setData({ color });

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

				// Get color based on type, with guaranteed non-null result for visual clarity
				// Requirements: 11.1 - All created nodes must have a solid background color
				const color = getColorForTypeWithDefault(nodeXML.type);
				const nodeId = randomHexString(16);

				groupNodes.push({
					id: nodeId,
					type: "text",
					text: nodeXML.content,
					x: nodePixelPos.x,
					y: nodePixelPos.y,
					width: this.settings.gridNodeWidth || 360,
					height: this.settings.gridNodeHeight || 200,
					color: color, // Always set - getColorForTypeWithDefault guarantees a value
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
	 *
	 * For pre-created groups with anchor state:
	 * - Only modify width/height when expanding for positive coordinates
	 * - When negative coordinates appear, shift anchor and reposition all nodes
	 * - Maintain 2-pixel tolerance for minor adjustments
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

		// Check if this is a pre-created group with anchor state
		const isPreCreatedGroup = this.preCreatedGroup &&
			this.preCreatedGroupSemanticId === groupId &&
			this.anchorState;

		if (isPreCreatedGroup && this.anchorState) {
			// Use anchor-preserving bounds update for pre-created groups
			await this.updateGroupBoundsPreservingAnchor(groupId, memberNodes, padding);
		} else {
			// Use standard bounds calculation for non-anchored groups
			await this.updateGroupBoundsStandard(groupNode, memberNodes, padding);
		}
	}

	/**
	 * Standard group bounds update (for non-anchored groups)
	 * Simply calculates bounds to fit all member nodes
	 */
	private async updateGroupBoundsStandard(
		groupNode: CanvasNode,
		memberNodes: CanvasNode[],
		padding: number
	): Promise<void> {
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
	 * Update group bounds while preserving anchor position
	 *
	 * CRITICAL: This method implements anchor immutability during streaming.
	 * The group's x and y coordinates are NEVER modified during streaming.
	 * Only width and height can change to expand the group downward and rightward.
	 *
	 * This prevents the "jitter" effect where the group visually vibrates during streaming
	 * because the group was trying to re-center itself on every token update.
	 *
	 * For negative coordinates: nodes are repositioned within the existing anchor bounds,
	 * but the anchor itself remains immutable. This is a design decision to prioritize
	 * visual stability over perfect layout for edge cases.
	 *
	 * Group Height Expansion (Requirement 12.3, 12.4):
	 * - Group height expands immediately when first node is created
	 * - Formula: group.height = max(currentHeight, node.relativeY + node.height + PADDING_BOTTOM)
	 * - Group container SHALL NOT shrink during the initial streaming phase
	 *
	 * Requirements: 9.1, 9.2, 9.3, 9.4 - Anchor Stabilization During Streaming
	 * Requirements: 3.1, 3.2, 3.3 - Group Bounds Dynamic Expansion
	 * Requirements: 12.3, 12.4 - Immediate container expansion, no shrinking
	 *
	 * 重构说明：使用 layoutEngine.calculateGroupBounds 计算组边界
	 * Requirements: 3.1, 3.2, 3.3, 3.4 - 布局逻辑提取为纯函数
	 */
	private async updateGroupBoundsPreservingAnchor(
		groupId: string,
		memberNodes: CanvasNode[],
		padding: number
	): Promise<void> {
		if (!this.anchorState || !this.preCreatedGroup) {
			console.warn("[StreamingNodeCreator] updateGroupBoundsPreservingAnchor called without anchor state");
			return;
		}

		const groupNode = this.preCreatedGroup;

		// CRITICAL: Capture original anchor position for immutability assertion
		const originalAnchorX = this.anchorState.anchorX;
		const originalAnchorY = this.anchorState.anchorY;

		// 收集成员节点的位置和尺寸
		const memberPositions = memberNodes
			.filter(node => node.x !== undefined)
			.map(node => ({
				x: node.x,
				y: node.y,
				width: node.width,
				height: node.height,
			}));

		// If no valid nodes, nothing to do
		if (memberPositions.length === 0) {
			return;
		}

		// 使用 layoutEngine 中的纯函数计算组边界
		// Requirements: 3.1, 3.2, 3.3, 3.4 - 布局逻辑提取为纯函数
		const currentBounds = {
			x: groupNode.x,
			y: groupNode.y,
			width: groupNode.width,
			height: groupNode.height,
		};

		const newDimensions = calculateGroupBounds(
			currentBounds,
			memberPositions,
			this.anchorState,
			this.config
		);

		// Only update if dimensions changed significantly (2-pixel tolerance)
		// CRITICAL: Group can only GROW, never shrink during streaming (Requirements 12.4)
		const widthChanged = newDimensions.width > groupNode.width + 2;
		const heightChanged = newDimensions.height > groupNode.height + 2;

		if (widthChanged || heightChanged) {
			// CRITICAL: Only update width and height - NEVER x or y
			// This is the key fix for the jitter issue
			groupNode.setData({
				width: newDimensions.width,
				height: newDimensions.height
				// x and y are intentionally NOT included - anchor is immutable during streaming
			});

			await this.canvas.requestFrame();

			console.log(`[StreamingNodeCreator] Expanded group bounds: width=${newDimensions.width}, height=${newDimensions.height} (anchor immutable at ${originalAnchorX}, ${originalAnchorY})`);
		}

		// CRITICAL: Verify anchor immutability assertion (Requirements 9.1)
		// This is a debug assertion to detect any anchor drift
		this.assertAnchorImmutability(originalAnchorX, originalAnchorY, groupNode);
	}

	/**
	 * Assert that anchor position has not changed during streaming
	 *
	 * This is a debug assertion to detect any anchor drift that would cause
	 * visual jitter. If drift is detected, a warning is logged but the
	 * operation continues (fail-safe behavior).
	 *
	 * Requirements: 9.1 - Anchor Stabilization During Streaming
	 *
	 * @param expectedX - Expected anchor X position
	 * @param expectedY - Expected anchor Y position
	 * @param groupNode - The group canvas node to check
	 */
	private assertAnchorImmutability(
		expectedX: number,
		expectedY: number,
		groupNode: CanvasNode
	): void {
		const actualX = groupNode.x;
		const actualY = groupNode.y;

		// Check for any drift (exact match required, no tolerance)
		const driftX = Math.abs(actualX - expectedX);
		const driftY = Math.abs(actualY - expectedY);

		if (driftX > 0 || driftY > 0) {
			console.warn(
				"[StreamingNodeCreator] ANCHOR DRIFT DETECTED! " +
				`Expected (${expectedX}, ${expectedY}), ` +
				`Actual (${actualX}, ${actualY}), ` +
				`Drift: (${driftX}, ${driftY}). ` +
				"This may cause visual jitter during streaming."
			);
		}

		// Also verify anchorState matches
		if (this.anchorState) {
			const anchorStateDriftX = Math.abs(this.anchorState.anchorX - expectedX);
			const anchorStateDriftY = Math.abs(this.anchorState.anchorY - expectedY);

			if (anchorStateDriftX > 0 || anchorStateDriftY > 0) {
				console.warn(
					"[StreamingNodeCreator] ANCHOR STATE DRIFT DETECTED! " +
					`Expected (${expectedX}, ${expectedY}), ` +
					`AnchorState (${this.anchorState.anchorX}, ${this.anchorState.anchorY}), ` +
					`Drift: (${anchorStateDriftX}, ${anchorStateDriftY}).`
				);
			}
		}
	}

	/**
	 * Shift anchor position and reposition all existing nodes
	 *
	 * This is called when negative grid coordinates cause nodes to extend
	 * beyond the original anchor point. We need to:
	 * 1. Calculate the new anchor position
	 * 2. Calculate the shift delta
	 * 3. Reposition all existing nodes by the delta to maintain relative positions
	 * 4. Update the group bounds
	 *
	 * Requirements: 3.3 (relative position preservation)
	 */
	private async shiftAnchorAndRepositionNodes(
		groupId: string,
		memberNodes: CanvasNode[],
		newX: number,
		newY: number,
		newWidth: number,
		newHeight: number,
		padding: number
	): Promise<void> {
		if (!this.anchorState || !this.preCreatedGroup) return;

		const groupNode = this.preCreatedGroup;

		// Calculate how much the anchor needs to shift
		const deltaX = this.anchorState.anchorX - newX;
		const deltaY = this.anchorState.anchorY - newY;

		console.log(`[StreamingNodeCreator] Shifting anchor by (${deltaX}, ${deltaY}) due to negative coordinates`);

		// Only reposition if there's a significant shift (> 2 pixels)
		if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
			// Reposition all existing nodes to maintain relative positions
			// When anchor shifts left/up, nodes need to shift right/down by the same amount
			for (const node of memberNodes) {
				const currentX = node.x;
				const currentY = node.y;
				const newNodeX = currentX + deltaX;
				const newNodeY = currentY + deltaY;

				node.setData({
					x: newNodeX,
					y: newNodeY
				});

				// Update our position tracking
				const nodeSemanticId = this.findSemanticIdForNode(node);
				if (nodeSemanticId) {
					this.nodePositions.set(nodeSemanticId, { x: newNodeX, y: newNodeY });
				}
			}
		}

		// Update anchor state to new position
		this.anchorState.anchorX = newX;
		this.anchorState.anchorY = newY;

		// Recalculate bounds after repositioning
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		memberNodes.forEach(node => {
			minX = Math.min(minX, node.x);
			minY = Math.min(minY, node.y);
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		});

		const finalWidth = maxX - minX + padding * 2;
		const finalHeight = maxY - minY + padding * 2;

		// Update group bounds
		groupNode.setData({
			x: newX,
			y: newY,
			width: finalWidth,
			height: finalHeight
		});

		await this.canvas.requestFrame();

		console.log(`[StreamingNodeCreator] Anchor shifted to (${newX}, ${newY}), group bounds: ${finalWidth}x${finalHeight}`);
	}

	/**
	 * Find the semantic ID for a canvas node
	 * Used when repositioning nodes to update position tracking
	 */
	private findSemanticIdForNode(targetNode: CanvasNode): string | null {
		for (const [semanticId, node] of this.createdNodeMap.entries()) {
			if (node.id === targetNode.id) {
				return semanticId;
			}
		}
		return null;
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
			console.error("[StreamingNodeCreator] Failed to create Markdown node:", error);
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
				console.log("[StreamingNodeCreator] Using AI suggestion (no collision)");
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
		console.log("[StreamingNodeCreator] Fallback: AI suggestion with offset");
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
		_targetNodeId: string
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

