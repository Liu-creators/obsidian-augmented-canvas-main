/**
 * Canvas 渲染器模块 - 处理所有画布操作
 *
 * 此模块从 StreamingNodeCreator 中提取画布操作逻辑，
 * 提供节点创建、边缘创建和组边界更新的统一接口。
 *
 * 主要功能：
 * - 节点创建和内容更新
 * - 边缘创建
 * - 组边界更新
 * - 批量位置更新（性能优化）
 * - 组清除（用于重新生成）
 *
 * Requirements: 6.1, 6.2, 6.3, 8.3, 8.5 - 画布渲染和批量更新
 *
 * @module groupGeneration/canvasRenderer
 *
 * @example
 * ```typescript
 * import { CanvasRenderer } from './canvasRenderer';
 * import { createConfig } from './config';
 *
 * // 创建渲染器
 * const config = createConfig();
 * const renderer = new CanvasRenderer(canvas, config);
 *
 * // 创建节点
 * const result = await renderer.createNode(
 *   nodeXML,
 *   { x: 100, y: 200 },
 *   { width: 360, height: 200 }
 * );
 *
 * // 更新节点内容
 * await renderer.updateNodeContent('node-1', '新内容');
 *
 * // 创建边缘
 * await renderer.createEdge({ from: 'node-1', to: 'node-2', label: '关系' });
 *
 * // 批量更新位置
 * await renderer.batchUpdatePositions([
 *   { nodeId: 'node-2', newY: 500 },
 *   { nodeId: 'node-3', newY: 700 },
 * ]);
 * ```
 */

import { Canvas, CanvasNode } from "../../obsidian/canvas-internal";
import { NodeXML, EdgeXML } from "../../types/xml.d";
import { addEdge, calcHeight } from "../../obsidian/canvas-patches";
import { randomHexString } from "../../utils";
import { getColorForTypeWithDefault } from "../typeMapping";
import {
	NodePosition,
	NodeDimensions,
	ColumnTrack,
	AnchorState,
	PositionUpdate,
	GroupBounds,
} from "./types";
import { GroupGenerationConfig } from "./config";
import {
	registerNodeInColumn,
	calculateRepositioning,
	detectOverlaps,
	calculateGroupBounds,
} from "./layoutEngine";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 节点创建结果
 */
export interface NodeCreationResult {
	/** 创建的画布节点 */
	canvasNode: CanvasNode;
	/** 节点位置 */
	position: NodePosition;
	/** 节点尺寸 */
	dimensions: NodeDimensions;
}

/**
 * 边缘创建选项
 */
export interface EdgeCreationOptions {
	/** 边缘标签 */
	label?: string;
	/** 是否为生成的边缘 */
	isGenerated?: boolean;
}


// ============================================================================
// Canvas 渲染器类
// ============================================================================

/**
 * Canvas 渲染器
 *
 * 负责创建和更新画布节点/边缘的核心类。
 * 封装了所有与 Obsidian Canvas API 的交互。
 *
 * 主要职责：
 * - 节点的创建、更新和删除
 * - 边缘的创建
 * - 组边界的计算和更新
 * - 列追踪管理
 * - 批量位置更新（性能优化）
 *
 * @example
 * ```typescript
 * const renderer = new CanvasRenderer(canvas, config);
 *
 * // 创建节点
 * const { canvasNode, position, dimensions } = await renderer.createNode(
 *   { id: 'node-1', content: '内容', type: 'concept' },
 *   { x: 100, y: 200 }
 * );
 *
 * // 注册到列追踪
 * renderer.registerNodeInColumnTrack(
 *   'node-1', 0, 0, position.y, dimensions.height, dimensions.width
 * );
 *
 * // 清除组（用于重新生成）
 * await renderer.clearGroup('group-1');
 * ```
 *
 * Requirements: 6.1, 6.2, 6.3 - 画布操作
 * Requirements: 8.3, 8.5 - 批量更新效率
 */
export class CanvasRenderer {
	private canvas: Canvas;
	private config: GroupGenerationConfig;

	/** 已创建的节点映射（语义 ID -> 画布节点） */
	private createdNodes: Map<string, CanvasNode> = new Map();

	/** 已创建的边缘集合（用于避免重复） */
	private createdEdges: Set<string> = new Set();

	/** 列追踪数据 */
	private columnTracks: Map<number, ColumnTrack> = new Map();

	/** 节点到组的映射 */
	private nodeToGroup: Map<string, string> = new Map();

	/** 组成员映射 */
	private groupMembers: Map<string, string[]> = new Map();

	/** 批量更新计数器（用于测试） */
	private batchUpdateCount: number = 0;

	constructor(canvas: Canvas, config: GroupGenerationConfig) {
		this.canvas = canvas;
		this.config = config;
	}

	// ========================================================================
	// 节点创建
	// ========================================================================

	/**
	 * 在画布上创建节点
	 *
	 * 创建一个新的文本节点并添加到画布。节点会根据类型自动应用颜色。
	 *
	 * @param nodeXML - 节点 XML 数据，包含 id、content、type 等
	 * @param position - 节点位置 `{ x, y }`
	 * @param dimensions - 节点尺寸（可选），未指定时使用配置默认值
	 * @returns 创建结果，包含 canvasNode、position 和 dimensions
	 *
	 * @example
	 * ```typescript
	 * const result = await renderer.createNode(
	 *   {
	 *     id: 'node-1',
	 *     content: '# 标题\n\n这是内容',
	 *     type: 'concept',
	 *     groupId: 'group-1',
	 *   },
	 *   { x: 100, y: 200 },
	 *   { width: 400 } // 高度会自动计算
	 * );
	 * ```
	 *
	 * Requirements: 6.1 - 节点创建
	 */
	async createNode(
		nodeXML: NodeXML,
		position: NodePosition,
		dimensions?: Partial<NodeDimensions>
	): Promise<NodeCreationResult> {
		// 获取基于类型的颜色
		// Requirements: 11.1 - 所有创建的节点必须有实心背景色
		const color = getColorForTypeWithDefault(nodeXML.type);

		const width = dimensions?.width ?? this.config.nodeWidth;
		const height = dimensions?.height ?? Math.max(
			this.config.nodeHeight,
			calcHeight({ text: nodeXML.content })
		);

		// 创建文本节点
		const newNode = this.canvas.createTextNode({
			pos: { x: position.x, y: position.y },
			position: "left",
			size: { width, height },
			text: nodeXML.content,
			focus: false,
		});

		// 应用颜色
		newNode.setData({ color });

		// 添加到画布
		this.canvas.addNode(newNode);

		// 存储节点引用
		this.createdNodes.set(nodeXML.id, newNode);

		// 处理组成员关系
		if (nodeXML.groupId) {
			this.nodeToGroup.set(nodeXML.id, nodeXML.groupId);

			if (!this.groupMembers.has(nodeXML.groupId)) {
				this.groupMembers.set(nodeXML.groupId, []);
			}
			if (!this.groupMembers.get(nodeXML.groupId)!.includes(nodeXML.id)) {
				this.groupMembers.get(nodeXML.groupId)!.push(nodeXML.id);
			}
		}

		await this.canvas.requestFrame();

		return {
			canvasNode: newNode,
			position: { x: position.x, y: position.y },
			dimensions: { width, height },
		};
	}


	/**
	 * 更新节点内容（保留位置）
	 *
	 * 重要：此方法在内容更新期间保留节点位置。
	 * 只更新文本和高度，不更新 x/y 坐标。
	 * 这确保了流式传输下的节点位置稳定性（Property 11）。
	 *
	 * @param nodeId - 节点语义 ID
	 * @param content - 新内容
	 * @returns 是否成功更新
	 *
	 * Requirements: 7.5 - 内容更新时位置保留
	 */
	async updateNodeContent(nodeId: string, content: string): Promise<boolean> {
		const node = this.createdNodes.get(nodeId);
		if (!node) {
			console.warn(`[CanvasRenderer] 未找到节点: ${nodeId}`);
			return false;
		}

		// 捕获当前位置（用于验证位置保留）
		const currentX = node.x;
		const currentY = node.y;
		const oldHeight = node.height;

		// 只更新文本内容
		node.setText(content);

		// 计算新高度
		const newHeight = Math.max(
			this.config.nodeHeight,
			calcHeight({ text: content })
		);

		const heightChanged = Math.abs(oldHeight - newHeight) > 1;

		if (heightChanged) {
			// 只更新高度，显式保留 x/y 位置
			node.setData({
				height: newHeight,
				x: currentX,
				y: currentY,
			});
		}

		// 验证位置是否保留
		if (Math.abs(node.x - currentX) > 0.1 || Math.abs(node.y - currentY) > 0.1) {
			console.warn(
				`[CanvasRenderer] 检测到位置漂移: 节点 ${nodeId} ` +
				`原位置 (${currentX}, ${currentY}), 现位置 (${node.x}, ${node.y})`
			);
		}

		await this.canvas.requestFrame();

		return true;
	}

	/**
	 * 更新节点高度并重新定位受影响的节点
	 *
	 * @param nodeId - 节点语义 ID
	 * @param newHeight - 新高度
	 * @param col - 节点所在列
	 * @param row - 节点所在行
	 * @returns 重新定位的节点数量
	 *
	 * Requirements: 8.3, 8.5 - 批量更新效率
	 */
	async updateNodeHeight(
		nodeId: string,
		newHeight: number,
		col: number,
		row: number
	): Promise<number> {
		const node = this.createdNodes.get(nodeId);
		if (!node) {
			return 0;
		}

		// 更新列追踪中的高度
		const colTrack = this.columnTracks.get(col);
		if (colTrack) {
			const nodeInfo = colTrack.nodes.find(n => n.nodeId === nodeId);
			if (nodeInfo) {
				nodeInfo.actualHeight = newHeight;
			}
		}

		// 计算需要重新定位的节点
		const updates = calculateRepositioning(col, row, this.columnTracks, this.config);

		if (updates.length > 0) {
			// 批量更新位置
			await this.batchUpdatePositions(updates);
		}

		return updates.length;
	}


	// ========================================================================
	// 边缘创建
	// ========================================================================

	/**
	 * 在节点之间创建边缘
	 *
	 * @param edge - 边缘 XML 数据
	 * @param options - 创建选项
	 * @returns 是否成功创建
	 *
	 * Requirements: 6.1 - 边缘创建
	 */
	async createEdge(edge: EdgeXML, options?: EdgeCreationOptions): Promise<boolean> {
		// 避免创建重复边缘
		const edgeKey = `${edge.from}-${edge.to}`;
		if (this.createdEdges.has(edgeKey)) {
			return false;
		}

		const fromNode = this.createdNodes.get(edge.from);
		const toNode = this.createdNodes.get(edge.to);

		// 检查两个节点是否都存在且已渲染
		if (!fromNode || !toNode || fromNode.x === undefined || toNode.x === undefined) {
			console.warn(
				`[CanvasRenderer] 无法创建边缘: ${edge.from} -> ${edge.to} (节点未找到或未渲染)`
			);
			return false;
		}

		// 确定边缘连接侧
		const { fromSide, toSide } = this.determineEdgeSides(fromNode, toNode);

		// 创建边缘
		addEdge(
			this.canvas,
			randomHexString(16),
			{ fromOrTo: "from", side: fromSide, node: fromNode },
			{ fromOrTo: "to", side: toSide, node: toNode },
			edge.label ?? options?.label,
			{ isGenerated: options?.isGenerated ?? true }
		);

		this.createdEdges.add(edgeKey);

		await this.canvas.requestFrame();

		return true;
	}

	/**
	 * 确定边缘连接侧
	 * 基于节点位置确定最佳连接方向
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

		// 确定主要方向
		if (Math.abs(deltaX) > Math.abs(deltaY)) {
			// 水平连接
			if (deltaX > 0) {
				return { fromSide: "right", toSide: "left" };
			} else {
				return { fromSide: "left", toSide: "right" };
			}
		} else {
			// 垂直连接
			if (deltaY > 0) {
				return { fromSide: "bottom", toSide: "top" };
			} else {
				return { fromSide: "top", toSide: "bottom" };
			}
		}
	}


	// ========================================================================
	// 组边界更新
	// ========================================================================

	/**
	 * 更新组边界以适应所有成员节点
	 *
	 * @param groupId - 组语义 ID
	 * @param groupNode - 组画布节点
	 * @param anchorState - 锚点状态（用于保持锚点不可变）
	 * @returns 是否更新了边界
	 *
	 * Requirements: 6.2, 6.3 - 组边界更新和位置保留
	 */
	async updateGroupBounds(
		groupId: string,
		groupNode: CanvasNode,
		anchorState: AnchorState
	): Promise<boolean> {
		const memberIds = this.groupMembers.get(groupId);
		if (!memberIds || memberIds.length === 0) {
			return false;
		}

		// 收集成员节点的位置和尺寸
		const memberPositions: Array<{
			x: number;
			y: number;
			width: number;
			height: number;
		}> = [];

		for (const id of memberIds) {
			const node = this.createdNodes.get(id);
			if (node && node.x !== undefined) {
				memberPositions.push({
					x: node.x,
					y: node.y,
					width: node.width,
					height: node.height,
				});
			}
		}

		if (memberPositions.length === 0) {
			return false;
		}

		// 计算新边界
		const currentBounds: GroupBounds = {
			x: groupNode.x,
			y: groupNode.y,
			width: groupNode.width,
			height: groupNode.height,
		};

		const newDimensions = calculateGroupBounds(
			currentBounds,
			memberPositions,
			anchorState,
			this.config
		);

		// 检查是否需要更新（2 像素容差）
		const widthChanged = newDimensions.width > groupNode.width + 2;
		const heightChanged = newDimensions.height > groupNode.height + 2;

		if (widthChanged || heightChanged) {
			// 关键：只更新 width 和 height，不更新 x 或 y
			// 锚点在流式传输期间是不可变的
			groupNode.setData({
				width: newDimensions.width,
				height: newDimensions.height,
			});

			await this.canvas.requestFrame();

			return true;
		}

		return false;
	}


	// ========================================================================
	// 批量更新
	// ========================================================================

	/**
	 * 批量更新节点位置（单个动画帧）
	 *
	 * 此方法将所有位置更新收集并在单个 requestFrame 调用中应用，
	 * 以最小化重排操作并提高性能。这对于流式传输期间的
	 * 高频更新特别重要。
	 *
	 * @param updates - 位置更新数组，每个元素包含 `{ nodeId, newY }`
	 * @returns 实际更新的节点数量
	 *
	 * @example
	 * ```typescript
	 * // 当节点高度变化时，批量更新下方节点的位置
	 * const updates = calculateRepositioning(col, changedRow, columnTracks, config);
	 *
	 * const updatedCount = await renderer.batchUpdatePositions(updates);
	 * console.log(`更新了 ${updatedCount} 个节点的位置`);
	 * ```
	 *
	 * Requirements: 8.3, 8.5 - 批量更新效率
	 */
	async batchUpdatePositions(
		updates: PositionUpdate[]
	): Promise<number> {
		if (updates.length === 0) {
			return 0;
		}

		let updatedCount = 0;

		// 应用所有位置更新
		for (const update of updates) {
			const node = this.createdNodes.get(update.nodeId);
			if (node && node.x !== undefined) {
				// 保留 x 坐标，只更新 y
				node.setData({ y: update.newY });

				// 更新列追踪中的 y 位置
				for (const [, colTrack] of this.columnTracks) {
					const nodeInfo = colTrack.nodes.find(n => n.nodeId === update.nodeId);
					if (nodeInfo) {
						nodeInfo.y = update.newY;
						break;
					}
				}

				updatedCount++;
			}
		}

		// 单个 requestFrame 调用处理所有更新
		// Requirements: 8.3, 8.5 - 批量更新效率
		if (updatedCount > 0) {
			await this.canvas.requestFrame();
			this.batchUpdateCount++;
		}

		return updatedCount;
	}

	/**
	 * 获取批量更新计数（用于测试）
	 */
	getBatchUpdateCount(): number {
		return this.batchUpdateCount;
	}

	/**
	 * 重置批量更新计数（用于测试）
	 */
	resetBatchUpdateCount(): void {
		this.batchUpdateCount = 0;
	}


	// ========================================================================
	// 组清除（用于重新生成）
	// ========================================================================

	/**
	 * 清除组中的所有节点（用于重新生成支持）
	 *
	 * 此方法在重新生成组内容时调用，会：
	 * - 从画布移除所有成员节点
	 * - 清理内部追踪数据（createdNodes、columnTracks 等）
	 * - 清理相关边缘
	 * - 保留组本身（只清除内容）
	 *
	 * @param groupId - 组语义 ID
	 * @returns 被清除的节点列表
	 *
	 * @example
	 * ```typescript
	 * // 重新生成前清除现有内容
	 * const clearedNodes = await renderer.clearGroup('group-1');
	 * console.log(`清除了 ${clearedNodes.length} 个节点`);
	 *
	 * // 然后开始新的生成
	 * await startGeneration(messages, { targetGroupId: 'group-1' });
	 * ```
	 *
	 * Requirements: 6.2 - 重新生成时清除现有节点
	 */
	async clearGroup(groupId: string): Promise<CanvasNode[]> {
		const memberIds = this.groupMembers.get(groupId);
		if (!memberIds || memberIds.length === 0) {
			return [];
		}

		const clearedNodes: CanvasNode[] = [];

		// 移除所有成员节点
		for (const nodeId of memberIds) {
			const node = this.createdNodes.get(nodeId);
			if (node) {
				// 从画布移除节点
				this.canvas.removeNode(node);
				clearedNodes.push(node);

				// 清理内部追踪
				this.createdNodes.delete(nodeId);
				this.nodeToGroup.delete(nodeId);

				// 清理列追踪
				for (const [col, colTrack] of this.columnTracks) {
					colTrack.nodes = colTrack.nodes.filter(n => n.nodeId !== nodeId);
					if (colTrack.nodes.length === 0) {
						this.columnTracks.delete(col);
					}
				}

				// 清理相关边缘
				for (const edgeKey of this.createdEdges) {
					if (edgeKey.startsWith(`${nodeId}-`) || edgeKey.endsWith(`-${nodeId}`)) {
						this.createdEdges.delete(edgeKey);
					}
				}
			}
		}

		// 清空组成员列表
		this.groupMembers.set(groupId, []);

		await this.canvas.requestFrame();

		return clearedNodes;
	}

	// ========================================================================
	// 辅助方法
	// ========================================================================

	/**
	 * 注册节点到列追踪
	 */
	registerNodeInColumnTrack(
		nodeId: string,
		col: number,
		row: number,
		y: number,
		height: number,
		width: number
	): void {
		registerNodeInColumn(
			nodeId,
			col,
			row,
			y,
			height,
			width,
			this.columnTracks,
			this.config.nodeWidth
		);
	}

	/**
	 * 获取已创建的节点
	 */
	getCreatedNode(nodeId: string): CanvasNode | undefined {
		return this.createdNodes.get(nodeId);
	}

	/**
	 * 检查节点是否已创建
	 */
	hasNode(nodeId: string): boolean {
		return this.createdNodes.has(nodeId);
	}

	/**
	 * 获取组成员 ID 列表
	 */
	getGroupMembers(groupId: string): string[] {
		return this.groupMembers.get(groupId) ?? [];
	}

	/**
	 * 设置组成员列表
	 */
	setGroupMembers(groupId: string, memberIds: string[]): void {
		this.groupMembers.set(groupId, memberIds);
	}

	/**
	 * 获取列追踪数据
	 */
	getColumnTracks(): ReadonlyMap<number, ColumnTrack> {
		return this.columnTracks;
	}

	/**
	 * 清除所有状态（用于重置）
	 */
	reset(): void {
		this.createdNodes.clear();
		this.createdEdges.clear();
		this.columnTracks.clear();
		this.nodeToGroup.clear();
		this.groupMembers.clear();
		this.batchUpdateCount = 0;
	}

	/**
	 * 检测并校正列中的重叠
	 *
	 * @param col - 列索引
	 * @returns 是否检测到并校正了重叠
	 */
	async detectAndCorrectOverlapsInColumn(col: number): Promise<boolean> {
		const corrections = detectOverlaps(col, this.columnTracks, this.config);

		if (corrections.length === 0) {
			return false;
		}

		// 应用校正
		const updates: PositionUpdate[] = corrections.map(c => ({
			nodeId: c.nodeId,
			newY: c.correctedY,
		}));

		await this.batchUpdatePositions(updates);

		return true;
	}
}
