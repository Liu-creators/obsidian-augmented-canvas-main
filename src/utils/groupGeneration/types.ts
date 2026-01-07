/**
 * 类型模块 - 组生成系统的共享接口定义
 *
 * 此模块定义了组生成系统中使用的所有共享类型和接口，
 * 确保类型安全和模块间的一致性。
 *
 * Requirements: 9.1, 9.3, 9.4 - 类型安全增强
 *
 * @module groupGeneration/types
 *
 * @example
 * ```typescript
 * import type {
 *   NodePosition,
 *   NodeDimensions,
 *   StreamingStatus,
 *   AnchorState,
 *   GenerationOptions,
 * } from './types';
 *
 * // 使用类型定义函数参数
 * function updateNodePosition(
 *   nodeId: string,
 *   position: NodePosition,
 *   dimensions: NodeDimensions
 * ): void {
 *   // ...
 * }
 *
 * // 使用状态类型
 * const status: StreamingStatus = 'streaming';
 * ```
 */

import { NodeXML, EdgeXML } from "../../types/xml.d";

// ============================================================================
// 布局相关类型
// ============================================================================

/**
 * 节点位置（像素坐标）
 * 用于表示节点在画布上的绝对位置
 *
 * Requirements: 3.3, 3.4 - 布局计算输入输出
 */
export interface NodePosition {
	/** X 坐标（像素） */
	x: number;

	/** Y 坐标（像素） */
	y: number;
}

/**
 * 节点尺寸
 * 用于表示节点的宽度和高度
 *
 * Requirements: 3.4 - 布局计算输入
 */
export interface NodeDimensions {
	/** 宽度（像素） */
	width: number;

	/** 高度（像素） */
	height: number;
}

/**
 * 节点位置和尺寸的组合
 * 用于表示节点的完整几何信息
 */
export interface NodeBounds extends NodePosition, NodeDimensions {}

// ============================================================================
// 列追踪相关类型
// ============================================================================

/**
 * 列中节点的信息
 * 用于动态垂直堆叠布局
 *
 * Requirements: 3.5, 3.6 - 动态高度堆叠
 */
export interface ColumnNodeInfo {
	/** 节点的语义 ID */
	nodeId: string;

	/** 列内的行索引 */
	row: number;

	/** 节点当前的 Y 位置（像素） */
	y: number;

	/** 节点基于内容的实际渲染高度（像素） */
	actualHeight: number;
}

/**
 * 列追踪信息
 * 追踪特定列中的所有节点，用于动态布局
 *
 * Requirements: 3.5, 3.6 - 动态高度堆叠
 */
export interface ColumnTrack {
	/** 列索引 */
	col: number;

	/** 此列中的节点，按行排序 */
	nodes: ColumnNodeInfo[];

	/** 此列中任何节点的最大宽度（像素） */
	maxWidth: number;
}

// ============================================================================
// 锚点状态相关类型
// ============================================================================

/**
 * 边缘方向类型
 * 用于确定安全区域放置位置
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4 - 边缘标签安全区域
 */
export type EdgeDirection = "left" | "top" | "right" | "bottom";

/**
 * 锚点状态
 * 用于预创建组的稳定定位，防止流式传输期间的布局跳动
 *
 * Requirements: 7.1, 7.4 - 锚点不可变性
 */
export interface AnchorState {
	/** 预创建组的原始 X 位置（像素） */
	anchorX: number;

	/** 预创建组的原始 Y 位置（像素） */
	anchorY: number;

	/** 锚点是否已锁定（创建组时设置） */
	anchorLocked: boolean;

	/** 看到的最小行值（用于处理负坐标） */
	minRowSeen: number;

	/** 看到的最小列值（用于处理负坐标） */
	minColSeen: number;

	/** 主边缘连接到组的方向（用于安全区域计算）
	 * Requirements: 7.1, 7.2, 7.3
	 */
	edgeDirection: EdgeDirection;
}

// ============================================================================
// 流式处理相关类型
// ============================================================================

/**
 * 流式传输状态枚举
 * 表示组生成的当前状态
 *
 * Requirements: 2.6 - 流式状态转换
 */
export type StreamingStatus = "idle" | "streaming" | "complete" | "error";

/**
 * 流式传输状态
 * 包含流式传输过程中的所有状态信息
 *
 * Requirements: 2.3, 2.6, 2.7 - 流式状态管理
 */
export interface StreamingState {
	/** 当前流式传输状态 */
	status: StreamingStatus;

	/** 已解析的节点（按语义 ID 索引） */
	nodes: Map<string, NodeXML>;

	/** 已解析的边缘列表 */
	edges: EdgeXML[];

	/** 错误信息（如果有） */
	error: Error | null;

	/** 进度百分比（0-100） */
	progress: number;
}

/**
 * 生成选项
 * 用于配置组生成行为
 *
 * Requirements: 2.4, 2.5, 6.1, 6.2, 6.3 - 重新生成支持
 */
export interface GenerationOptions {
	/** 目标组 ID（用于重新生成现有组） */
	targetGroupId?: string;

	/** 是否清除现有内容 */
	clearExisting?: boolean;

	/** 是否保留组边界 */
	preserveBounds?: boolean;
}

// ============================================================================
// 回调接口
// ============================================================================

/**
 * 流式传输生命周期回调
 * 用于在生成过程中接收事件通知
 *
 * Requirements: 6.5 - 生命周期回调
 */
export interface StreamingCallbacks {
	/** 生成开始时调用 */
	onStart?: () => void;

	/** 创建新节点时调用 */
	onNodeCreated?: (nodeId: string, node: NodeXML) => void;

	/** 更新现有节点时调用 */
	onNodeUpdated?: (nodeId: string, node: NodeXML) => void;

	/** 创建边缘时调用 */
	onEdgeCreated?: (edge: EdgeXML) => void;

	/** 进度更新时调用 */
	onProgress?: (progress: number) => void;

	/** 生成完成时调用 */
	onComplete?: () => void;

	/** 发生错误时调用 */
	onError?: (error: Error) => void;
}

// ============================================================================
// 节点实际尺寸追踪
// ============================================================================

/**
 * 节点实际渲染尺寸
 * 用于追踪节点的实际渲染大小
 *
 * Requirements: 3.5 - 动态高度追踪
 */
export interface NodeActualSize {
	/** 实际渲染宽度（像素） */
	width: number;

	/** 实际渲染高度（像素） */
	height: number;
}

// ============================================================================
// 位置更新相关类型
// ============================================================================

/**
 * 位置更新信息
 * 用于批量更新节点位置
 *
 * Requirements: 8.3, 8.5 - 批量更新效率
 */
export interface PositionUpdate {
	/** 节点语义 ID */
	nodeId: string;

	/** 新的 Y 位置（像素） */
	newY: number;
}

/**
 * 重叠校正信息
 * 用于检测和校正节点重叠
 *
 * Requirements: 7.2 - 无重叠不变量
 */
export interface OverlapCorrection {
	/** 节点语义 ID */
	nodeId: string;

	/** 校正后的 Y 位置（像素） */
	correctedY: number;
}

// ============================================================================
// 组状态相关类型
// ============================================================================

/**
 * 组边界
 * 表示组的位置和尺寸
 */
export interface GroupBounds {
	/** X 坐标（像素） */
	x: number;

	/** Y 坐标（像素） */
	y: number;

	/** 宽度（像素） */
	width: number;

	/** 高度（像素） */
	height: number;
}

/**
 * 组状态
 * 包含组的完整状态信息
 *
 * Requirements: 6.2, 6.3 - 组位置保留
 */
export interface GroupState {
	/** 组的语义 ID */
	semanticId: string;

	/** 锚点状态（用于稳定定位） */
	anchorState: AnchorState;

	/** 成员节点 ID 列表 */
	memberIds: string[];

	/** 当前边界 */
	bounds: GroupBounds;
}

// ============================================================================
// 节点状态相关类型
// ============================================================================

/**
 * 节点状态
 * 包含节点的完整状态信息
 *
 * Requirements: 9.1 - 显式接口定义
 */
export interface NodeState {
	/** 语义 ID（来自 XML） */
	semanticId: string;

	/** XML 数据 */
	xml: NodeXML;

	/** 布局位置 */
	position: NodePosition;

	/** 尺寸 */
	dimensions: NodeDimensions;

	/** 列索引 */
	column: number;

	/** 行索引 */
	row: number;

	/** 所属组 ID（如果有） */
	groupId: string | null;
}
