/**
 * Type to Color Mapping for AI Canvas v2.0
 * Maps semantic node types to Obsidian Canvas color codes
 */

/**
 * Node type enumeration as per PRD v2.0 Section 2.2
 */
export type NodeType = 
	| "default"    // 默认文本/详情
	| "concept"    // 核心概念
	| "step"       // 步骤/技术实现
	| "resource"   // 资源/引用
	| "warning"    // 风险/错误
	| "insight"    // 洞察/总结
	| "question";  // 问题/待办

/**
 * Type to Color mapping table
 * Based on PRD v2.0 Section 2.2
 */
export const TYPE_TO_COLOR: Record<NodeType, string | null> = {
	default: null,      // null = 无色/灰
	concept: "2",       // 橙色 - 强调项
	step: "5",          // 蓝色 - 流程节点
	resource: "4",      // 绿色 - 文件、图片、正面结果
	warning: "1",       // 红色 - 警示项
	insight: "6",       // 紫色 - 结论
	question: "3",      // 黄色 - 思考题
};

/**
 * Get Obsidian color code for a given node type
 * Returns null (default gray) for unknown types as per PRD Section 4.2
 * 
 * @param type - Node type string
 * @returns Obsidian color code or null
 */
export function getColorForType(type: string | undefined): string | null {
	if (!type) {
		return null; // Default fallback
	}
	
	const normalizedType = type.toLowerCase() as NodeType;
	
	// Check if it's a valid type
	if (normalizedType in TYPE_TO_COLOR) {
		return TYPE_TO_COLOR[normalizedType];
	}
	
	// Fallback to default for unknown types
	console.warn(`[TypeMapping] Unknown node type: "${type}", using default color`);
	return null;
}

/**
 * Validate if a string is a valid NodeType
 * 
 * @param type - Type string to validate
 * @returns True if valid, false otherwise
 */
export function isValidNodeType(type: string): type is NodeType {
	const validTypes: NodeType[] = [
		"default",
		"concept",
		"step",
		"resource",
		"warning",
		"insight",
		"question"
	];
	return validTypes.includes(type as NodeType);
}

/**
 * Get human-readable description for a node type
 * 
 * @param type - Node type
 * @returns Description string
 */
export function getTypeDescription(type: NodeType): string {
	const descriptions: Record<NodeType, string> = {
		default: "普通文本/详情",
		concept: "核心概念",
		step: "步骤/技术实现",
		resource: "资源/引用",
		warning: "风险/错误",
		insight: "洞察/总结",
		question: "问题/待办"
	};
	return descriptions[type] || "未知类型";
}

/**
 * Get all valid node types
 * 
 * @returns Array of all valid node types
 */
export function getAllNodeTypes(): NodeType[] {
	return Object.keys(TYPE_TO_COLOR) as NodeType[];
}




