import { App, setIcon, setTooltip, Notice } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { getActiveCanvasNodes } from "../../utils";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";
import { Canvas, CanvasNode } from "../../obsidian/canvas-internal";
import { getNodesInGroup } from "../../utils/groupUtils";
import { streamResponse } from "../../utils/chatgpt";
import { IncrementalXMLParser } from "../../utils/incrementalXMLParser";
import { StreamingNodeCreator, EdgeDirection } from "../../utils/streamingNodeCreator";
import { ChatMessage } from "../../utils/groupGeneration/groupStreamManager";
import { logDebug } from "../../logDebug";

/**
 * 重新生成的系统提示 - XML 格式
 * 与 generateGroup.ts 中的 SYSTEM_PROMPT_SMART_EXPAND_XML 保持一致
 * 
 * Requirements: 1.1 - 统一流式处理管道
 */
const SYSTEM_PROMPT_REGENERATE_XML = `
You are an intelligent canvas assistant.
Goal: Regenerate content for an existing group based on the user's instruction.

IMPORTANT: This is a GROUP regeneration request. You MUST wrap all generated nodes inside a <group> element.
The user's question will be displayed on the edge connecting the source node to the group.

OUTPUT FORMAT (XML):
1. **ALWAYS wrap all generated nodes in a <group>** - This is required for group generation.
2. Use <group id="g1" title="..." row="0" col="0">...</group> to contain all nodes.
3. Inside the group, use <node id="..." type="..." title="..." row="Int" col="Int">Markdown</node>.
4. Node coordinates inside the group are relative to the group's position (use small values like 0, 1, 2).

TYPE RULES (affects node color):
- default: General text (Gray, use when unsure)
- concept: Key ideas/concepts (Orange)
- step: Steps/procedures/implementation (Blue)
- resource: Resources/files/references (Green)
- warning: Risks/errors/caveats (Red)
- insight: Insights/conclusions/summaries (Purple)
- question: Questions/TODOs/discussion points (Yellow)

COORDINATE GUIDELINES:
- Use row=0, col=0 for the first/main node
- Use row=1, col=0 for nodes below
- Use row=0, col=1 for nodes to the right
- Use row=1, col=1 for diagonal placement

CONTENT GUIDELINES:
- Each node can contain full Markdown: **bold**, *italic*, lists, code blocks, links
- Keep nodes focused (2-5 paragraphs each)
- Create 2-6 nodes depending on instruction complexity
- Node titles are optional but recommended for clarity
- Use the same language as the user's instruction

Example Output:
<group id="g1" title="Generated Content" row="0" col="0">
    <node id="n1" type="concept" title="First Concept" row="0" col="0">
    First concept content...
    </node>
    
    <node id="n2" type="step" title="Implementation" row="1" col="0">
    Implementation steps...
    </node>
    
    <node id="n3" type="insight" title="Conclusion" row="2" col="0">
    Final insights...
    </node>
</group>

Note: All nodes must be inside the group with id="g1". The group coordinates should be row="0" col="0" since this is a regeneration.
`.trim();

/**
 * 重新生成的生命周期回调接口
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5 - 状态同步与回调
 */
export interface RegenerationCallbacks {
	/** 重新生成开始时调用 */
	onStart?: () => void;
	/** 每个节点创建时调用 */
	onNodeCreated?: (nodeId: string) => void;
	/** 进度变化时调用 */
	onProgress?: (progress: number) => void;
	/** 重新生成成功完成时调用 */
	onComplete?: () => void;
	/** 发生错误时调用 */
	onError?: (error: Error) => void;
}

/**
 * 启动组重新生成流程
 * 
 * 核心流程（v1.1 修复版）：
 * 1. 保存组位置（锚点）
 * 2. 获取原始子节点引用
 * 3. 【立即删除原始子节点】← 关键改变！
 * 4. 收缩组到最小尺寸（400x300，与创建时一致）
 * 5. 触发布局更新（边缘 snap）
 * 6. 【完全复用 generateGroup.ts 的流式逻辑】← 关键改变！
 * 7. 完成后最终边界调整
 *
 * @param canvas - Canvas 实例
 * @param groupNode - 目标组节点
 * @param fromNode - 源节点（用于构建上下文）
 * @param messages - AI 消息数组
 * @param settings - 插件设置
 * @param edgeLabel - 边缘标签（作为提示词）
 * @param callbacks - 生命周期回调
 *
 * Requirements: 1.1 - 统一流式处理管道
 * Requirements: 2.1, 2.2, 2.3 - 收缩后增长行为
 * Requirements: 3.1, 3.2, 3.3 - 立即删除原始内容
 */
export async function startRegeneration(
	canvas: Canvas,
	groupNode: CanvasNode,
	fromNode: CanvasNode,
	messages: ChatMessage[],
	settings: AugmentedCanvasSettings,
	edgeLabel?: string,
	callbacks?: RegenerationCallbacks
): Promise<void> {
	// 检查 API 密钥
	if (!settings.apiKey) {
		const error = new Error("请在插件设置中设置 DeepSeek API 密钥");
		callbacks?.onError?.(error);
		new Notice(error.message);
		return;
	}

	// 验证目标是组节点
	const groupData = groupNode.getData();
	if (groupData.type !== "group") {
		const error = new Error("目标节点不是组节点");
		callbacks?.onError?.(error);
		new Notice(error.message);
		return;
	}

	console.log("[startRegeneration] 开始重新生成流程");
	console.log("[startRegeneration] 边缘标签:", edgeLabel);
	console.log("[startRegeneration] 消息数量:", messages.length);

	// 触发 onStart 回调
	// Requirements: 6.1 - 重新生成开始时调用 onStart 回调
	callbacks?.onStart?.();

	// 阶段 1: 保存组位置（锚点）
	// Requirements: 2.5 - 锚点不可变性
	const anchorX = groupNode.x;
	const anchorY = groupNode.y;
	console.log("[startRegeneration] 锚点位置:", anchorX, anchorY);

	// 阶段 2: 获取原始子节点引用
	const originalChildNodes = getNodesInGroup(groupNode, canvas);
	console.log("[startRegeneration] 原始子节点数量:", originalChildNodes.length);

	// 阶段 3: 【立即删除原始子节点】
	// Requirements: 3.1 - 立即删除所有原始子节点
	console.log("[startRegeneration] 立即删除原始子节点...");
	for (const node of originalChildNodes) {
		canvas.removeNode(node);
	}
	console.log("[startRegeneration] 原始子节点已删除");

	// 阶段 4: 收缩组到初始尺寸
	// Requirements: 2.1, 2.2, 2.3 - 收缩后增长行为
	const initialWidth = 400;
	const initialHeight = 300;
	groupNode.setData({
		width: initialWidth,
		height: initialHeight,
		// 保持锚点位置不变
	});
	await canvas.requestFrame();
	console.log("[startRegeneration] 组已收缩到初始尺寸 400x300");

	// 构建消息数组：系统提示 + 原始消息 + 边缘标签
	// Requirements: 1.1 - 添加系统提示让 AI 生成 XML 格式输出
	// Requirements: 5.1, 5.2 - 边缘标签传递
	const messagesWithSystemPrompt: ChatMessage[] = [
		{ role: "system", content: SYSTEM_PROMPT_REGENERATE_XML },
		...messages,
	];
	
	// 添加边缘标签作为用户消息
	if (edgeLabel) {
		messagesWithSystemPrompt.push({
			role: "user",
			content: edgeLabel,
		});
	}

	new Notice("正在为 Group 重新生成内容...");

	// 阶段 5: 创建 StreamingNodeCreator 实例
	// Requirements: 1.1 - 复用 StreamingNodeCreator（与 generateGroup.ts 相同）
	const nodeCreator = new StreamingNodeCreator(canvas, fromNode, settings);

	// 设置预创建组
	const preCreatedGroupSemanticId = "g1";
	const edgeDirection: EdgeDirection = determineEdgeDirection(fromNode, groupNode);
	nodeCreator.setPreCreatedGroup(
		groupNode,
		preCreatedGroupSemanticId,
		"", // mainEdgeId - 重新生成时边缘已存在
		edgeLabel || "",
		edgeDirection
	);

	// 初始化增量 XML 解析器（与 generateGroup.ts 相同）
	const xmlParser = new IncrementalXMLParser();
	let accumulatedResponse = "";
	let lastNodeUpdate = Date.now();
	let nodeCount = 0;

	try {
		// 阶段 6: 流式生成（完全复用 generateGroup.ts 的逻辑）
		// Requirements: 1.1, 1.2 - 使用相同的流式处理逻辑
		await streamResponse(
			settings.apiKey,
			messagesWithSystemPrompt as any,
			{
				model: settings.apiModel,
				max_tokens: settings.maxResponseTokens || undefined,
				temperature: settings.temperature,
			},
			async (chunk: string | null, error?: Error) => {
				// 处理错误
				if (error) {
					throw error;
				}

				// 流结束
				if (!chunk) {
					// 记录完整的 AI 响应
					console.log("[startRegeneration] ========== AI Response Complete ==========");
					console.log("[startRegeneration] 边缘标签:", edgeLabel || "(none)");
					console.log("[startRegeneration] 响应长度:", accumulatedResponse.length, "characters");
					logDebug("Regeneration AI Full Response", {
						edgeLabel: edgeLabel || "(none)",
						responseLength: accumulatedResponse.length,
						fullResponse: accumulatedResponse,
					});
					return;
				}

				accumulatedResponse += chunk;

				// 增量解析和节点创建（与 generateGroup.ts 完全相同）
				const now = Date.now();
				xmlParser.append(chunk);

				// 存储边缘以构建依赖图
				const completeEdges = xmlParser.detectCompleteEdges();
				completeEdges.forEach(edge => nodeCreator.storeEdge(edge));

				// 检测并创建完整节点
				const completeNodes = xmlParser.detectCompleteNodes();
				for (const nodeXML of completeNodes) {
					await nodeCreator.createNodeFromXML(nodeXML);
					await canvas.requestFrame();
					nodeCount++;

					// 触发 onNodeCreated 回调
					// Requirements: 6.2 - 每个节点创建时调用 onNodeCreated 回调
					callbacks?.onNodeCreated?.(nodeXML.id);
				}

				// 实时更新所有节点（包括不完整的）
				// 节流到 50ms 以提高性能（与 generateGroup.ts 相同）
				if (now - lastNodeUpdate > 50) {
					// 更新部分组
					const incompleteGroups = xmlParser.detectIncompleteGroups();
					for (const groupXML of incompleteGroups) {
						await nodeCreator.updatePartialGroup(groupXML);
					}

					// 更新部分节点
					const incompleteNodes = xmlParser.detectIncompleteNodes();
					for (const nodeXML of incompleteNodes) {
						await nodeCreator.updatePartialNode(nodeXML);
					}
					lastNodeUpdate = now;

					// 触发 onProgress 回调
					// Requirements: 6.3 - 进度变化时调用 onProgress 回调
					const estimatedProgress = Math.min(90, accumulatedResponse.length / 100);
					callbacks?.onProgress?.(estimatedProgress);
				}

				// 检测并创建组
				const completeGroups = xmlParser.detectCompleteGroups();
				for (const groupXML of completeGroups) {
					await nodeCreator.createGroupFromXML(groupXML);
					await canvas.requestFrame();
				}
			}
		);

		// 阶段 7: 流完成后的处理（与 generateGroup.ts 相同）
		await sleep(200);

		// 处理剩余内容
		const finalIncompleteGroups = xmlParser.detectIncompleteGroups();
		for (const groupXML of finalIncompleteGroups) {
			await nodeCreator.updatePartialGroup(groupXML);
		}

		const finalIncompleteNodes = xmlParser.detectIncompleteNodes();
		for (const nodeXML of finalIncompleteNodes) {
			await nodeCreator.updatePartialNode(nodeXML);
		}

		// 处理剩余边缘
		const remainingEdges = xmlParser.detectCompleteEdges();
		remainingEdges.forEach(edge => nodeCreator.storeEdge(edge));

		// 处理剩余节点
		const remainingNodes = xmlParser.detectCompleteNodes();
		for (const nodeXML of remainingNodes) {
			await nodeCreator.createNodeFromXML(nodeXML);
			await canvas.requestFrame();
			nodeCount++;
			callbacks?.onNodeCreated?.(nodeXML.id);
		}

		// 创建所有待处理节点
		await nodeCreator.createAllPendingNodes();
		await canvas.requestFrame();

		// 创建所有待处理边缘
		const edgeCount = await nodeCreator.createAllEdges();
		await canvas.requestFrame();

		// 阶段 8: 最终边界调整
		// Requirements: 4.4 - 流完成后进行最终边界计算
		const nodesInGroup = getNodesInGroup(groupNode, canvas);
		if (nodesInGroup.length > 0) {
			const padding = settings.groupPadding || 60;
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			nodesInGroup.forEach(node => {
				minX = Math.min(minX, node.x);
				minY = Math.min(minY, node.y);
				maxX = Math.max(maxX, node.x + node.width);
				maxY = Math.max(maxY, node.y + node.height);
			});
			groupNode.setData({
				x: minX - padding,
				y: minY - padding,
				width: maxX - minX + padding * 2,
				height: maxY - minY + padding * 2,
			});
			await canvas.requestFrame();
		}

		// 成功通知
		const totalNodes = nodeCreator.getCreatedNodeCount();
		const edgeMsg = edgeCount > 0 ? ` 和 ${edgeCount} 条连接` : "";
		new Notice(`✓ Group 重新生成完成，创建了 ${totalNodes} 个节点${edgeMsg}`);

		// 触发 onComplete 回调
		// Requirements: 6.4 - 重新生成成功完成时调用 onComplete 回调
		callbacks?.onComplete?.();

		// 触发最终进度
		callbacks?.onProgress?.(100);

		await canvas.requestSave();
		console.log("[startRegeneration] 重新生成成功完成");

	} catch (error: any) {
		const errorMessage = error?.message || error?.toString() || "Unknown error";
		console.error("[startRegeneration] 错误:", error);

		// 原始内容已被删除，通知用户
		// Requirements: 3.4 - 错误处理
		new Notice(`Group 重新生成出错: ${errorMessage}。原始内容已被清除。`);

		// 触发 onError 回调
		// Requirements: 6.5 - 发生错误时调用 onError 回调
		callbacks?.onError?.(error instanceof Error ? error : new Error(errorMessage));
	}
}

/**
 * 确定边缘方向（从源节点到目标组）
 * 用于安全区域计算
 */
function determineEdgeDirection(fromNode: CanvasNode, toNode: CanvasNode): EdgeDirection {
	const fromCenterX = fromNode.x + fromNode.width / 2;
	const fromCenterY = fromNode.y + fromNode.height / 2;
	const toCenterX = toNode.x + toNode.width / 2;
	const toCenterY = toNode.y + toNode.height / 2;

	const deltaX = toCenterX - fromCenterX;
	const deltaY = toCenterY - fromCenterY;

	if (Math.abs(deltaX) > Math.abs(deltaY)) {
		return deltaX > 0 ? "left" : "right";
	} else {
		return deltaY > 0 ? "top" : "bottom";
	}
}

/**
 * 辅助函数：延迟
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

const handleRegenerateResponse = async (
	app: App,
	settings: AugmentedCanvasSettings
) => {
	const activeNode = getActiveCanvasNodes(app)![0];

	// Extract edge label from the edge object (Requirements 5.1, 5.2)
	// @ts-expect-error - Edge properties
	const edgeLabel: string | undefined = activeNode.label;

	const { generateNote } = noteGenerator(
		app,
		settings,
		// @ts-expect-error - Edge properties
		activeNode.from.node,
		// @ts-expect-error - Edge properties
		activeNode.to.node
	);

	// Pass edge label to generateNote (Requirements 5.1, 5.2)
	await generateNote(undefined, edgeLabel);
};

export const addRegenerateResponse = async (
	app: App,
	settings: AugmentedCanvasSettings,
	menuEl: HTMLElement
) => {
	const buttonEl_AskAI = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl_AskAI, "重新生成回复", {
		placement: "top",
	});
	setIcon(buttonEl_AskAI, "lucide-rotate-cw");
	menuEl.appendChild(buttonEl_AskAI);

	buttonEl_AskAI.addEventListener("click", () =>
		handleRegenerateResponse(app, settings)
	);
};

