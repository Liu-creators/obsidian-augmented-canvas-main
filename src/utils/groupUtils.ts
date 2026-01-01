import { App } from "obsidian";
import { Canvas, CanvasNode } from "../obsidian/canvas-internal";
import { readNodeContent } from "../obsidian/fileUtil";

/**
 * 判断节点是否为 group 类型
 */
export function isGroup(node: CanvasNode): boolean {
	const nodeData = node.getData();
	return nodeData.type === "group";
}

/**
 * 判断一个节点是否在 group 的坐标区域内
 * 根据 Obsidian Canvas JSON 规范，group 内的节点通过坐标区域来判断包含关系
 * 
 * @param node - 要检查的节点
 * @param group - group 节点
 * @returns 如果节点在 group 内返回 true
 */
export function isNodeInGroup(node: CanvasNode, group: CanvasNode): boolean {
	if (!isGroup(group)) {
		return false;
	}

	const groupData = group.getData();
	const nodeData = node.getData();

	// group 的边界坐标
	const groupLeft = groupData.x;
	const groupRight = groupData.x + groupData.width;
	const groupTop = groupData.y;
	const groupBottom = groupData.y + groupData.height;

	// 节点的中心点坐标
	const nodeCenterX = nodeData.x + nodeData.width / 2;
	const nodeCenterY = nodeData.y + nodeData.height / 2;

	// 判断节点中心点是否在 group 边界内
	return (
		nodeCenterX >= groupLeft &&
		nodeCenterX <= groupRight &&
		nodeCenterY >= groupTop &&
		nodeCenterY <= groupBottom
	);
}

/**
 * 获取 group 内的所有节点
 * 
 * @param group - group 节点
 * @param canvas - Canvas 对象
 * @returns group 内的所有节点数组
 */
export function getNodesInGroup(
	group: CanvasNode,
	canvas: Canvas
): CanvasNode[] {
	if (!isGroup(group)) {
		return [];
	}

	const nodesInGroup: CanvasNode[] = [];
	
	// 获取 canvas 的所有节点数据
	const canvasData = canvas.getData();
	if (!canvasData || !canvasData.nodes) {
		return [];
	}

	// Canvas.nodes 是一个 Map<string, CanvasNode>
	// 遍历 canvas 中的所有节点
	for (const node of canvas.nodes.values()) {
		// 跳过 group 节点本身
		if (node.id === group.id) {
			continue;
		}

		// 判断节点是否在 group 内
		if (isNodeInGroup(node, group)) {
			nodesInGroup.push(node);
		}
	}

	// 按照从左到右、从上到下的顺序排序
	nodesInGroup.sort((a, b) => {
		const aData = a.getData();
		const bData = b.getData();

		// 先按 y 坐标排序（从上到下）
		if (Math.abs(aData.y - bData.y) > 10) {
			return aData.y - bData.y;
		}

		// y 坐标相近时，按 x 坐标排序（从左到右）
		return aData.x - bData.x;
	});

	return nodesInGroup;
}

/**
 * 读取 group 内所有节点的内容
 * 
 * @param group - group 节点
 * @returns 所有节点内容的组合文本，每个节点内容之间用两个换行符分隔
 */
export async function readGroupContent(group: CanvasNode): Promise<string> {
	if (!isGroup(group)) {
		// 如果不是 group，直接返回节点自身的内容
		return (await readNodeContent(group)) || "";
	}

	const canvas = group.canvas;
	const nodesInGroup = getNodesInGroup(group, canvas);

	if (nodesInGroup.length === 0) {
		return "";
	}

	const contents: string[] = [];

	for (const node of nodesInGroup) {
		const content = await readNodeContent(node);
		if (content?.trim()) {
			// 添加节点类型标识（可选，帮助 AI 理解内容结构）
			const nodeData = node.getData();
			
			// 如果是嵌套的 group，递归读取
			if (nodeData.type === "group") {
				const groupLabel = (nodeData as any).label || "Group";
				contents.push(`### ${groupLabel}\n\n${await readGroupContent(node)}`);
			} else if (nodeData.type === "file") {
				// 文件节点，添加文件名标识
				const fileName = (nodeData as any).file || "File";
				contents.push(`**[${fileName}]**\n\n${content}`);
			} else {
				// 普通文本节点
				contents.push(content);
			}
		}
	}

	return contents.join("\n\n");
}

/**
 * 获取 group 的标签（label）
 * 
 * @param group - group 节点
 * @returns group 的 label，如果没有则返回 "Group"
 */
export function getGroupLabel(group: CanvasNode): string {
	if (!isGroup(group)) {
		return "";
	}

	const nodeData = group.getData();
	return (nodeData as any).label || "Group";
}

/**
 * 读取 group 内容并生成适合 AI 的上下文描述
 * 
 * @param group - group 节点
 * @returns 格式化的上下文字符串
 */
export async function buildGroupContext(group: CanvasNode): Promise<string> {
	if (!isGroup(group)) {
		return (await readNodeContent(group)) || "";
	}

	const groupLabel = getGroupLabel(group);
	const canvas = group.canvas;
	const nodesInGroup = getNodesInGroup(group, canvas);

	if (nodesInGroup.length === 0) {
		return `Group "${groupLabel}" (empty)`;
	}

	const contents: string[] = [];
	contents.push(`# ${groupLabel}`);
	contents.push(`\nThis group contains ${nodesInGroup.length} item(s):\n`);

	for (let i = 0; i < nodesInGroup.length; i++) {
		const node = nodesInGroup[i];
		const content = await readNodeContent(node);
		const nodeData = node.getData();

		if (content?.trim()) {
			if (nodeData.type === "group") {
				// 嵌套 group
				contents.push(await buildGroupContext(node));
			} else {
				// 普通节点
				contents.push(`## Item ${i + 1}\n\n${content}`);
			}
		}
	}

	return contents.join("\n\n");
}

