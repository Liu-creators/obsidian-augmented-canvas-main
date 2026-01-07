/**
 * 配置模块 - 集中管理所有布局常量和配置
 *
 * 此模块提取了 streamingNodeCreator.ts 中的所有魔法数字，
 * 使视觉样式易于调整和维护。
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 *
 * @module groupGeneration/config
 *
 * @example
 * ```typescript
 * import { createConfig, LAYOUT_CONSTANTS, DEFAULT_CONFIG } from './config';
 *
 * // 使用默认配置
 * const config = createConfig();
 *
 * // 使用自定义配置
 * const customConfig = createConfig({
 *   nodeWidth: 400,
 *   verticalGap: 100,
 * });
 *
 * // 从插件设置创建配置
 * const settingsConfig = createConfigFromSettings({
 *   gridNodeWidth: 360,
 *   gridNodeHeight: 200,
 * });
 * ```
 */

/**
 * 布局常量 - 用于动态定位
 * 所有值均以像素为单位（除非另有说明）
 *
 * Requirements: 5.1-5.9 - 配置管理
 */
export const LAYOUT_CONSTANTS = {
	/** 同一列中节点之间的最小垂直间距（像素）
	 * Requirements: 5.4
	 */
	VERTICAL_GAP: 80,

	/** 相邻列之间的最小水平间距（像素）
	 * Requirements: 5.5
	 */
	HORIZONTAL_GAP: 80,

	/** 边缘标签的安全区域边距（像素）
	 * Requirements: 5.8
	 */
	EDGE_LABEL_SAFE_ZONE: 0,

	/** 组标题栏/头部区域的高度（像素）
	 * Requirements: 5.6 - GROUP_HEADER_HEIGHT 至少为 40 像素
	 */
	GROUP_HEADER_HEIGHT: 100,

	/** 默认节点宽度（像素）
	 * Requirements: 5.2
	 */
	DEFAULT_NODE_WIDTH: 360,

	/** 默认节点高度（像素）
	 * Requirements: 5.2
	 */
	DEFAULT_NODE_HEIGHT: 200,

	/** 最大网格坐标值（用于限制范围）
	 */
	MAX_GRID_COORD: 100,
} as const;

/**
 * 布局常量类型
 */
export type LayoutConstantsType = typeof LAYOUT_CONSTANTS;

/**
 * 边缘方向类型 - 用于确定安全区域放置
 * Requirements: 7.1, 7.2, 7.3
 */
export type EdgeDirection = "left" | "top" | "right" | "bottom";

/**
 * 组生成配置接口
 * 允许覆盖默认布局常量
 */
export interface GroupGenerationConfig {
	/** 节点宽度（像素）
	 * Requirements: 5.2
	 */
	nodeWidth: number;

	/** 节点高度（像素）
	 * Requirements: 5.2
	 */
	nodeHeight: number;

	/** 组内边距（像素）
	 * Requirements: 5.1
	 */
	groupPadding: number;

	/** 垂直间距（像素）
	 * Requirements: 5.4
	 */
	verticalGap: number;

	/** 水平间距（像素）
	 * Requirements: 5.5
	 */
	horizontalGap: number;

	/** 边缘标签安全区域（像素）
	 * Requirements: 5.8
	 */
	edgeLabelSafeZone: number;

	/** 组头部高度（像素）
	 * Requirements: 5.6
	 */
	groupHeaderHeight: number;

	/** 最大网格坐标值
	 */
	maxGridCoord: number;
}

/**
 * 默认配置值
 * 基于 LAYOUT_CONSTANTS 的默认设置
 */
export const DEFAULT_CONFIG: GroupGenerationConfig = {
	nodeWidth: LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH,
	nodeHeight: LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT,
	groupPadding: 20,
	verticalGap: LAYOUT_CONSTANTS.VERTICAL_GAP,
	horizontalGap: LAYOUT_CONSTANTS.HORIZONTAL_GAP,
	edgeLabelSafeZone: LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE,
	groupHeaderHeight: LAYOUT_CONSTANTS.GROUP_HEADER_HEIGHT,
	maxGridCoord: LAYOUT_CONSTANTS.MAX_GRID_COORD,
};

/**
 * 创建配置对象，合并用户设置与默认值
 *
 * 此函数接受部分配置设置，并将其与默认值合并，
 * 返回一个完整的配置对象。未指定的设置将使用默认值。
 *
 * @param settings - 部分配置设置，将覆盖默认值
 * @returns 完整的配置对象，包含所有布局参数
 *
 * @example
 * ```typescript
 * // 使用默认配置
 * const defaultConfig = createConfig();
 *
 * // 覆盖部分设置
 * const customConfig = createConfig({
 *   nodeWidth: 400,
 *   verticalGap: 100,
 *   horizontalGap: 120,
 * });
 *
 * // 使用配置进行布局计算
 * const position = calculateNodePosition(
 *   nodeId, row, col, anchorState, columnTracks, customConfig
 * );
 * ```
 *
 * Requirements: 5.9 - 从单一配置模块导出所有常量
 * Requirements: 5.10 - 布局计算使用配置管理器中的常量
 */
export function createConfig(settings?: Partial<GroupGenerationConfig>): GroupGenerationConfig {
	if (!settings) {
		return { ...DEFAULT_CONFIG };
	}

	return {
		nodeWidth: settings.nodeWidth ?? DEFAULT_CONFIG.nodeWidth,
		nodeHeight: settings.nodeHeight ?? DEFAULT_CONFIG.nodeHeight,
		groupPadding: settings.groupPadding ?? DEFAULT_CONFIG.groupPadding,
		verticalGap: settings.verticalGap ?? DEFAULT_CONFIG.verticalGap,
		horizontalGap: settings.horizontalGap ?? DEFAULT_CONFIG.horizontalGap,
		edgeLabelSafeZone: settings.edgeLabelSafeZone ?? DEFAULT_CONFIG.edgeLabelSafeZone,
		groupHeaderHeight: settings.groupHeaderHeight ?? DEFAULT_CONFIG.groupHeaderHeight,
		maxGridCoord: settings.maxGridCoord ?? DEFAULT_CONFIG.maxGridCoord,
	};
}

/**
 * 从 AugmentedCanvasSettings 创建配置
 *
 * 此函数从 Obsidian 插件设置对象创建布局配置，
 * 方便在插件中使用用户自定义的设置。
 *
 * @param settings - Obsidian 插件设置对象
 * @param settings.gridNodeWidth - 可选的节点宽度设置
 * @param settings.gridNodeHeight - 可选的节点高度设置
 * @param settings.groupPadding - 可选的组内边距设置
 * @returns 完整的配置对象
 *
 * @example
 * ```typescript
 * // 从插件设置创建配置
 * const config = createConfigFromSettings(plugin.settings);
 *
 * // 使用配置创建渲染器
 * const renderer = new CanvasRenderer(canvas, config);
 * ```
 */
export function createConfigFromSettings(settings: {
	gridNodeWidth?: number;
	gridNodeHeight?: number;
	groupPadding?: number;
}): GroupGenerationConfig {
	return createConfig({
		nodeWidth: settings.gridNodeWidth,
		nodeHeight: settings.gridNodeHeight,
		groupPadding: settings.groupPadding,
	});
}
