/**
 * 组生成模块 - 统一导出入口
 *
 * 此模块提供组生成系统的所有公共接口和函数的统一导出。
 * 使用此入口可以方便地导入所需的类型、函数和类。
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5 - 模块组织
 *
 * @example
 * ```typescript
 * // 导入配置
 * import { createConfig, LAYOUT_CONSTANTS } from './utils/groupGeneration';
 *
 * // 导入类型
 * import type {
 *   NodePosition,
 *   StreamingStatus,
 *   GenerationOptions
 * } from './utils/groupGeneration';
 *
 * // 导入类
 * import {
 *   GroupStreamManager,
 *   CanvasRenderer
 * } from './utils/groupGeneration';
 *
 * // 导入布局函数
 * import {
 *   calculateNodePosition,
 *   calculateGroupBounds
 * } from './utils/groupGeneration';
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// 配置模块导出
// Requirements: 10.3 - 配置模块组织
// ============================================================================

export {
	// 常量
	LAYOUT_CONSTANTS,
	DEFAULT_CONFIG,
	// 类型
	type LayoutConstantsType,
	type EdgeDirection,
	type GroupGenerationConfig,
	// 函数
	createConfig,
	createConfigFromSettings,
} from "./config";

// ============================================================================
// 类型模块导出
// Requirements: 10.4 - 类型和接口模块组织
// ============================================================================

export type {
	// 布局相关类型
	NodePosition,
	NodeDimensions,
	NodeBounds,
	// 列追踪类型
	ColumnNodeInfo,
	ColumnTrack,
	// 锚点状态类型
	AnchorState,
	// 流式处理类型
	StreamingStatus,
	StreamingState,
	GenerationOptions,
	StreamingCallbacks,
	// 节点尺寸追踪
	NodeActualSize,
	// 位置更新类型
	PositionUpdate,
	OverlapCorrection,
	// 组状态类型
	GroupBounds,
	GroupState,
	// 节点状态类型
	NodeState,
} from "./types";

// 重新导出 EdgeDirection 类型（从 types 模块）
export type { EdgeDirection as EdgeDirectionType } from "./types";

// ============================================================================
// 布局引擎导出
// Requirements: 10.2 - 布局模块组织
// ============================================================================

export {
	// 核心布局计算函数
	calculateNodePosition,
	registerNodeInColumn,
	calculateRepositioning,
	detectOverlaps,
	detectAllOverlaps,
	calculateGroupBounds,
	// 辅助函数
	updateNodeHeight,
	normalizeCoordinates,
	calculateSafeZones,
	validateNoOverlapInvariant,
	cloneColumnTracks,
} from "./layoutEngine";

// ============================================================================
// Canvas 渲染器导出
// Requirements: 10.2 - 渲染模块组织
// ============================================================================

export {
	CanvasRenderer,
	type NodeCreationResult,
	type EdgeCreationOptions,
} from "./canvasRenderer";

// ============================================================================
// 流管理器导出
// Requirements: 10.1 - 流式模块组织
// ============================================================================

export {
	GroupStreamManager,
	type StreamCallback,
	type StreamResponseFunction,
	type ChatMessage,
	type ModelConfig,
} from "./groupStreamManager";

// ============================================================================
// Hook 导出（从 hooks 目录重新导出）
// Requirements: 10.1 - 流式模块组织
// ============================================================================

// 注意：useGroupStream 位于 src/hooks 目录，这里提供便捷的重新导出
export {
	useGroupStream,
	createMockStreamResponseFn,
	createMockErrorStreamResponseFn,
	type UseGroupStreamReturn,
	type UseGroupStreamOptions,
} from "../../hooks/useGroupStream";
