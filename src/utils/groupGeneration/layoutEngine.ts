/**
 * 布局引擎模块 - 纯函数实现的布局计算
 *
 * 此模块从 StreamingNodeCreator 中提取布局计算逻辑，
 * 实现为无副作用的纯函数，便于测试和复用。
 *
 * 主要功能：
 * - 节点位置计算（动态高度堆叠）
 * - 列追踪管理
 * - 重叠检测和校正
 * - 组边界计算
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 - 布局逻辑提取
 *
 * @module groupGeneration/layoutEngine
 *
 * @example
 * ```typescript
 * import {
 *   calculateNodePosition,
 *   registerNodeInColumn,
 *   calculateGroupBounds,
 *   detectOverlaps,
 * } from './layoutEngine';
 *
 * // 计算节点位置
 * const position = calculateNodePosition(
 *   'node-1',
 *   0, // row
 *   0, // col
 *   anchorState,
 *   columnTracks,
 *   config
 * );
 *
 * // 注册节点到列追踪
 * registerNodeInColumn(
 *   'node-1',
 *   0, // col
 *   0, // row
 *   position.y,
 *   200, // height
 *   360, // width
 *   columnTracks,
 *   360 // defaultNodeWidth
 * );
 *
 * // 检测重叠
 * const overlaps = detectOverlaps(0, columnTracks, config);
 * ```
 */

import {
	NodePosition,
	ColumnTrack,
	ColumnNodeInfo,
	AnchorState,
	PositionUpdate,
	OverlapCorrection,
	GroupBounds,
	NodeBounds,
} from "./types";
import { GroupGenerationConfig } from "./config";

// ============================================================================
// 节点位置计算
// ============================================================================

/**
 * 计算节点在预创建组中的位置
 *
 * 使用动态堆叠布局：Y 位置基于上方节点的实际高度累积。
 * 此方法不使用固定网格高度计算，而是累积实际高度以确保正确堆叠无重叠。
 *
 * 位置计算公式：
 * - 对于第 0 行: `y = anchorY + GROUP_HEADER_HEIGHT + padding + topSafeZone`
 * - 对于第 N 行: `y = prevNode.y + prevNode.actualHeight + VERTICAL_GAP`
 *
 * 安全区域根据边缘方向应用，以防止与边缘标签重叠：
 * - 如果边缘从 'top' 连接：为第一行添加 topSafeZone
 * - 如果边缘从 'left' 连接：为第一列添加 leftSafeZone
 *
 * @param nodeId - 节点的语义 ID
 * @param row - 网格行坐标（可以是负数）
 * @param col - 网格列坐标（可以是负数）
 * @param anchorState - 当前锚点状态，包含锚点位置和边缘方向
 * @param columnTracks - 列追踪数据的 Map（只读），用于获取前一个节点的位置
 * @param config - 布局配置，包含间距和尺寸参数
 * @returns 计算出的像素位置 `{ x, y }`
 *
 * @example
 * ```typescript
 * const anchorState: AnchorState = {
 *   anchorX: 100,
 *   anchorY: 100,
 *   anchorLocked: true,
 *   minRowSeen: 0,
 *   minColSeen: 0,
 *   edgeDirection: 'top',
 * };
 *
 * const position = calculateNodePosition(
 *   'node-1',
 *   0, // 第一行
 *   0, // 第一列
 *   anchorState,
 *   new Map(),
 *   config
 * );
 * // position = { x: 140, y: 260 }
 * ```
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4 - 纯函数布局计算
 * Requirements: 3.5, 3.6 - 动态高度堆叠
 */
export function calculateNodePosition(
	nodeId: string,
	row: number,
	col: number,
	anchorState: AnchorState,
	columnTracks: ReadonlyMap<number, ColumnTrack>,
	config: GroupGenerationConfig
): NodePosition {
	const {
		verticalGap,
		horizontalGap,
		edgeLabelSafeZone,
		groupHeaderHeight,
		nodeWidth: defaultNodeWidth,
		groupPadding: padding,
		maxGridCoord,
	} = config;

	// 限制坐标到合理范围
	const clampedRow = Math.max(-maxGridCoord, Math.min(maxGridCoord, row));
	const clampedCol = Math.max(-maxGridCoord, Math.min(maxGridCoord, col));

	// 标准化坐标：如果 minRow 是 -1，则行 0 在计算中变为行 1
	const normalizedRow = clampedRow - anchorState.minRowSeen;
	const normalizedCol = clampedCol - anchorState.minColSeen;

	// 根据边缘方向计算安全区域（Requirements: 7.1, 7.2, 7.3, 7.4）
	const topSafeZone = anchorState.edgeDirection === "top" ? edgeLabelSafeZone : 0;
	const leftSafeZone = anchorState.edgeDirection === "left" ? edgeLabelSafeZone : 0;

	// 使用动态列宽追踪计算 X 位置
	// 公式：x = anchorX + padding + leftSafeZone + Σ(colWidths[0..col-1] + HORIZONTAL_GAP)
	let x = anchorState.anchorX + padding + leftSafeZone;
	for (let c = 0; c < normalizedCol; c++) {
		const colTrack = columnTracks.get(c);
		const colWidth = colTrack?.maxWidth || defaultNodeWidth;
		x += colWidth + horizontalGap;
	}

	// 使用动态堆叠布局计算 Y 位置
	// 关键（需求 12）：第一行必须清除组头部
	let y: number;
	const colTrack = columnTracks.get(normalizedCol);

	if (normalizedRow === 0 || !colTrack || colTrack.nodes.length === 0) {
		// 列中的第一个节点：必须清除组头部 + 内边距 + 安全区域
		y = anchorState.anchorY + groupHeaderHeight + padding + topSafeZone;
	} else {
		// 查找此列中的前一个节点（行号最高且小于 normalizedRow 的节点）
		const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);
		let prevNodeInfo: ColumnNodeInfo | null = null;

		for (const nodeInfo of sortedNodes) {
			if (nodeInfo.row < normalizedRow) {
				prevNodeInfo = nodeInfo;
			} else {
				break;
			}
		}

		if (prevNodeInfo) {
			// 使用动态高度堆叠在前一个节点下方
			y = prevNodeInfo.y + prevNodeInfo.actualHeight + verticalGap;
		} else {
			// 未找到前一个节点，使用带头部清除的基础位置
			y = anchorState.anchorY + groupHeaderHeight + padding + topSafeZone;
		}
	}

	return { x, y };
}

// ============================================================================
// 列追踪管理
// ============================================================================

/**
 * 在列追踪中注册节点
 *
 * 如果列追踪不存在则创建，添加/更新节点条目，按行排序。
 * 同时追踪列宽用于水平间距计算。
 *
 * 注意：此函数会修改传入的 columnTracks Map。
 *
 * @param nodeId - 节点的语义 ID
 * @param col - 标准化的列索引（从 0 开始）
 * @param row - 标准化的行索引（从 0 开始）
 * @param y - 当前 Y 位置（像素）
 * @param height - 实际渲染高度（像素）
 * @param width - 实际渲染宽度（像素）
 * @param columnTracks - 列追踪数据的 Map（会被修改）
 * @param defaultNodeWidth - 默认节点宽度（像素）
 *
 * @example
 * ```typescript
 * const columnTracks = new Map<number, ColumnTrack>();
 *
 * // 注册第一个节点
 * registerNodeInColumn(
 *   'node-1',
 *   0, // col
 *   0, // row
 *   160, // y
 *   200, // height
 *   360, // width
 *   columnTracks,
 *   360 // defaultNodeWidth
 * );
 *
 * // 注册第二个节点
 * registerNodeInColumn(
 *   'node-2',
 *   0, // col
 *   1, // row
 *   440, // y = 160 + 200 + 80
 *   150, // height
 *   360, // width
 *   columnTracks,
 *   360
 * );
 * ```
 *
 * Requirements: 3.5, 3.6 - 动态高度追踪
 */
export function registerNodeInColumn(
	nodeId: string,
	col: number,
	row: number,
	y: number,
	height: number,
	width: number,
	columnTracks: Map<number, ColumnTrack>,
	defaultNodeWidth: number
): void {
	// 如果列追踪不存在则创建
	if (!columnTracks.has(col)) {
		columnTracks.set(col, {
			col,
			nodes: [],
			maxWidth: defaultNodeWidth,
		});
	}

	const colTrack = columnTracks.get(col)!;

	// 移除此节点的现有条目（用于更新）
	colTrack.nodes = colTrack.nodes.filter(n => n.nodeId !== nodeId);

	// 添加新条目
	colTrack.nodes.push({
		nodeId,
		row,
		y,
		actualHeight: height,
	});

	// 按行排序
	colTrack.nodes.sort((a, b) => a.row - b.row);

	// 如果此节点更宽则更新最大宽度
	if (width > colTrack.maxWidth) {
		colTrack.maxWidth = width;
	}
}

// ============================================================================
// 重新定位计算
// ============================================================================

/**
 * 计算给定行以下所有节点的重新定位
 *
 * 当节点高度在流式传输期间变化时调用此函数。
 * 使用动态堆叠公式确保变化节点下方的节点被正确推下，
 * 以维持无重叠不变量。
 *
 * 重新定位公式：`newY = prevNode.y + prevNode.actualHeight + VERTICAL_GAP`
 *
 * @param col - 标准化的列索引
 * @param changedRow - 高度变化的节点所在行
 * @param columnTracks - 列追踪数据的 Map（只读）
 * @param config - 布局配置
 * @returns 位置更新数组，每个元素包含 `{ nodeId, newY }`
 *
 * @example
 * ```typescript
 * // 假设节点 'node-1' 在第 0 行，高度从 200 变为 300
 * // 需要重新定位第 1 行及以下的节点
 *
 * const updates = calculateRepositioning(
 *   0, // col
 *   0, // changedRow
 *   columnTracks,
 *   config
 * );
 *
 * // updates = [
 * //   { nodeId: 'node-2', newY: 460 }, // 原来是 360
 * //   { nodeId: 'node-3', newY: 620 }, // 原来是 520
 * // ]
 * ```
 *
 * Requirements: 3.5, 3.6 - 动态高度堆叠
 */
export function calculateRepositioning(
	col: number,
	changedRow: number,
	columnTracks: ReadonlyMap<number, ColumnTrack>,
	config: GroupGenerationConfig
): PositionUpdate[] {
	const colTrack = columnTracks.get(col);
	if (!colTrack || colTrack.nodes.length === 0) {
		return []; // 此列中没有节点
	}

	const { verticalGap } = config;
	const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);
	const updates: PositionUpdate[] = [];

	// 追踪前一个节点的位置和高度用于堆叠
	let prevY = 0;
	let prevHeight = 0;

	for (const nodeInfo of sortedNodes) {
		if (nodeInfo.row <= changedRow) {
			// 对于变化行及之前的节点，只追踪它们的位置
			prevY = nodeInfo.y;
			prevHeight = nodeInfo.actualHeight;
			continue;
		}

		// 基于前一个节点使用累积高度计算新 Y 位置
		// 公式：Y = prevNode.y + prevNode.actualHeight + VERTICAL_GAP
		const newY = prevY + prevHeight + verticalGap;

		// 检查位置是否实际变化（超过 1 像素差异）
		if (Math.abs(nodeInfo.y - newY) > 1) {
			updates.push({
				nodeId: nodeInfo.nodeId,
				newY,
			});
		}

		// 使用（可能更新的）位置更新下一次迭代的追踪
		prevY = newY;
		prevHeight = nodeInfo.actualHeight;
	}

	return updates;
}

// ============================================================================
// 重叠检测
// ============================================================================

/**
 * 检测列中的重叠
 *
 * 检查列中所有相邻节点对是否存在重叠，返回需要校正的节点列表。
 *
 * 重叠判定条件：`nodeB.y < nodeA.y + nodeA.actualHeight + VERTICAL_GAP`
 * （其中 nodeA.row < nodeB.row）
 *
 * @param col - 列索引
 * @param columnTracks - 列追踪数据的 Map（只读）
 * @param config - 布局配置
 * @returns 重叠校正数组，每个元素包含 `{ nodeId, correctedY }`
 *
 * @example
 * ```typescript
 * const corrections = detectOverlaps(0, columnTracks, config);
 *
 * if (corrections.length > 0) {
 *   // 应用校正
 *   for (const { nodeId, correctedY } of corrections) {
 *     updateNodePosition(nodeId, correctedY);
 *   }
 * }
 * ```
 *
 * Requirements: 7.2 - 无重叠不变量
 */
export function detectOverlaps(
	col: number,
	columnTracks: ReadonlyMap<number, ColumnTrack>,
	config: GroupGenerationConfig
): OverlapCorrection[] {
	const colTrack = columnTracks.get(col);
	if (!colTrack || colTrack.nodes.length < 2) {
		return []; // 需要至少 2 个节点才能有重叠
	}

	const { verticalGap } = config;
	const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);
	const corrections: OverlapCorrection[] = [];

	// 检查每对相邻节点是否重叠
	for (let i = 0; i < sortedNodes.length - 1; i++) {
		const nodeA = sortedNodes[i];
		const nodeB = sortedNodes[i + 1];

		// 计算 nodeB 避免重叠的最小 Y 位置
		const minYForNodeB = nodeA.y + nodeA.actualHeight + verticalGap;

		// 检查 nodeB 是否与 nodeA 重叠（1 像素容差）
		if (nodeB.y < minYForNodeB - 1) {
			corrections.push({
				nodeId: nodeB.nodeId,
				correctedY: minYForNodeB,
			});
		}
	}

	return corrections;
}

/**
 * 检测所有列中的重叠
 *
 * @param columnTracks - 列追踪数据的 Map（只读）
 * @param config - 布局配置
 * @returns 按列分组的重叠校正 Map
 */
export function detectAllOverlaps(
	columnTracks: ReadonlyMap<number, ColumnTrack>,
	config: GroupGenerationConfig
): Map<number, OverlapCorrection[]> {
	const allCorrections = new Map<number, OverlapCorrection[]>();

	for (const [col] of columnTracks) {
		const corrections = detectOverlaps(col, columnTracks, config);
		if (corrections.length > 0) {
			allCorrections.set(col, corrections);
		}
	}

	return allCorrections;
}

// ============================================================================
// 组边界计算
// ============================================================================

/**
 * 计算适合所有成员节点的组边界
 *
 * 此函数实现流式传输期间的锚点不可变性：
 * - 组的 x 和 y 坐标在流式传输期间永不修改
 * - 只有 width 和 height 可以改变以向下和向右扩展组
 * - 边界只扩展，不收缩（用于流式传输稳定性）
 *
 * @param currentBounds - 当前组边界 `{ x, y, width, height }`
 * @param memberPositions - 成员节点位置和尺寸数组
 * @param anchorState - 锚点状态，用于保持锚点不可变
 * @param config - 布局配置
 * @returns 新的尺寸 `{ width, height }`（x/y 保持不变）
 *
 * @example
 * ```typescript
 * const currentBounds = {
 *   x: 100,
 *   y: 100,
 *   width: 400,
 *   height: 300,
 * };
 *
 * const memberPositions = [
 *   { x: 140, y: 160, width: 360, height: 200 },
 *   { x: 140, y: 440, width: 360, height: 150 },
 * ];
 *
 * const newDimensions = calculateGroupBounds(
 *   currentBounds,
 *   memberPositions,
 *   anchorState,
 *   config
 * );
 * // newDimensions = { width: 440, height: 510 }
 * ```
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4 - 纯函数布局计算
 */
export function calculateGroupBounds(
	currentBounds: GroupBounds,
	memberPositions: ReadonlyArray<NodeBounds>,
	anchorState: AnchorState,
	config: GroupGenerationConfig
): { width: number; height: number } {
	const { groupPadding: padding } = config;

	// 如果没有成员，返回当前尺寸
	if (memberPositions.length === 0) {
		return {
			width: currentBounds.width,
			height: currentBounds.height,
		};
	}

	// 计算所有成员节点的边界框
	let maxX = -Infinity;
	let maxY = -Infinity;

	for (const member of memberPositions) {
		maxX = Math.max(maxX, member.x + member.width);
		maxY = Math.max(maxY, member.y + member.height);
	}

	// 如果没有有效节点，返回当前尺寸
	if (!isFinite(maxX) || !isFinite(maxY)) {
		return {
			width: currentBounds.width,
			height: currentBounds.height,
		};
	}

	// 关键：计算新尺寸 - 组只能向下和向右增长
	// 锚点（x, y）在流式传输期间是不可变的 - 只有 width/height 可以改变
	const newWidth = Math.max(
		currentBounds.width,
		maxX - anchorState.anchorX + padding
	);

	// 高度计算使用 PADDING_BOTTOM 作为适当的底部边距
	const newHeight = Math.max(
		currentBounds.height,
		maxY - anchorState.anchorY + padding
	);

	return { width: newWidth, height: newHeight };
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 更新列追踪中节点的高度
 * 返回更新后的列追踪（不修改原始数据）
 *
 * @param nodeId - 节点的语义 ID
 * @param newHeight - 新的实际高度
 * @param columnTracks - 列追踪数据的 Map（只读）
 * @returns 更新后的列追踪 Map，如果未找到节点则返回 null
 */
export function updateNodeHeight(
	nodeId: string,
	newHeight: number,
	columnTracks: ReadonlyMap<number, ColumnTrack>
): { updatedTracks: Map<number, ColumnTrack>; col: number; row: number } | null {
	// 在列追踪中查找节点
	for (const [col, colTrack] of columnTracks.entries()) {
		const nodeIndex = colTrack.nodes.findIndex(n => n.nodeId === nodeId);
		if (nodeIndex !== -1) {
			const nodeInfo = colTrack.nodes[nodeIndex];

			// 创建更新后的列追踪
			const updatedTracks = new Map(columnTracks);
			const updatedColTrack: ColumnTrack = {
				...colTrack,
				nodes: colTrack.nodes.map(n =>
					n.nodeId === nodeId
						? { ...n, actualHeight: newHeight }
						: { ...n }
				),
			};
			updatedTracks.set(col, updatedColTrack);

			return {
				updatedTracks,
				col,
				row: nodeInfo.row,
			};
		}
	}

	return null;
}

/**
 * 标准化网格坐标
 * 将原始行/列坐标转换为基于最小值的标准化坐标
 *
 * @param row - 原始行坐标
 * @param col - 原始列坐标
 * @param minRowSeen - 看到的最小行值
 * @param minColSeen - 看到的最小列值
 * @param maxGridCoord - 最大网格坐标值
 * @returns 标准化的行和列
 */
export function normalizeCoordinates(
	row: number,
	col: number,
	minRowSeen: number,
	minColSeen: number,
	maxGridCoord: number
): { normalizedRow: number; normalizedCol: number } {
	// 限制坐标到合理范围
	const clampedRow = Math.max(-maxGridCoord, Math.min(maxGridCoord, row));
	const clampedCol = Math.max(-maxGridCoord, Math.min(maxGridCoord, col));

	return {
		normalizedRow: clampedRow - minRowSeen,
		normalizedCol: clampedCol - minColSeen,
	};
}

/**
 * 计算安全区域偏移
 * 根据边缘方向返回顶部和左侧的安全区域值
 *
 * @param edgeDirection - 边缘连接方向
 * @param edgeLabelSafeZone - 安全区域大小
 * @returns 顶部和左侧安全区域值
 */
export function calculateSafeZones(
	edgeDirection: AnchorState["edgeDirection"],
	edgeLabelSafeZone: number
): { topSafeZone: number; leftSafeZone: number } {
	return {
		topSafeZone: edgeDirection === "top" ? edgeLabelSafeZone : 0,
		leftSafeZone: edgeDirection === "left" ? edgeLabelSafeZone : 0,
	};
}

/**
 * 验证无重叠不变量
 * 检查列中所有节点对是否满足 B.y >= A.y + A.height + gap
 *
 * @param columnTracks - 列追踪数据的 Map（只读）
 * @param config - 布局配置
 * @returns 验证结果，包含是否有效和违规详情
 */
export function validateNoOverlapInvariant(
	columnTracks: ReadonlyMap<number, ColumnTrack>,
	config: GroupGenerationConfig
): { valid: boolean; violations: Array<{ col: number; nodeA: string; nodeB: string; gap: number; required: number }> } {
	const violations: Array<{ col: number; nodeA: string; nodeB: string; gap: number; required: number }> = [];
	const { verticalGap } = config;

	for (const [col, colTrack] of columnTracks) {
		if (colTrack.nodes.length < 2) continue;

		const sortedNodes = [...colTrack.nodes].sort((a, b) => a.row - b.row);

		for (let i = 0; i < sortedNodes.length - 1; i++) {
			const nodeA = sortedNodes[i];
			const nodeB = sortedNodes[i + 1];

			const actualGap = nodeB.y - (nodeA.y + nodeA.actualHeight);

			if (actualGap < verticalGap - 1) { // 1 像素容差
				violations.push({
					col,
					nodeA: nodeA.nodeId,
					nodeB: nodeB.nodeId,
					gap: actualGap,
					required: verticalGap,
				});
			}
		}
	}

	return {
		valid: violations.length === 0,
		violations,
	};
}

/**
 * 深拷贝列追踪 Map
 * 用于在不修改原始数据的情况下进行计算
 *
 * @param columnTracks - 原始列追踪 Map
 * @returns 深拷贝的列追踪 Map
 */
export function cloneColumnTracks(
	columnTracks: ReadonlyMap<number, ColumnTrack>
): Map<number, ColumnTrack> {
	const cloned = new Map<number, ColumnTrack>();

	for (const [col, track] of columnTracks) {
		cloned.set(col, {
			col: track.col,
			nodes: track.nodes.map(n => ({ ...n })),
			maxWidth: track.maxWidth,
		});
	}

	return cloned;
}
