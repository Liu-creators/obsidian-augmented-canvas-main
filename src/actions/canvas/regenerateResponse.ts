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
 * 基于用户之前的提示词，修改为重新生成场景
 * 
 * 关键修改：组的坐标从 row="0" col="1" 改为 row="0" col="0"
 * 
 * Requirements: 1.1 - 统一流式处理管道
 */
const SYSTEM_PROMPT_REGENERATE_XML = `
You are an Intelligent Canvas Architect.
Goal: Parse input content into a structured graph using the following logic protocols.

### 1. OBJECT DEFINITION
- Scope: ALL output must be wrapped in <group id="g1" title="..." row="0" col="0">...</group>.
- Node: <node id="..." type="..." row="int" col="int">Markdown</node> (Unit of content).
- Edge: <edge from="..." to="..." label="..." /> (Logical connection).
- Space: Relative coordinates to Group Center (0,0).

### 2. LOGIC PROTOCOLS
Analyze the relationship between items to select the strategy:

CASE A: Strong Logical Connection (Time, Cause, Dependency)
- Rule: MUST use <edge>.
- Layout:
  - Sequential: Flow Right (col+1) or Down (row+1).
  - Branching: Distribute vertically (row-1, row+1) while flowing Right.
- Example: Step 1 -> Step 2 -> Outcome.

CASE B: Weak/Parallel Connection (Categories, Lists, Aspects)
- Rule: FORBID <edge>. Use Spatial Positioning only.
- Layout: Distribute in Quadrants or Grid around center.
  - Top-Left: (-1,-1) | Top-Right: (-1,1)
  - Btm-Left: (1,-1)  | Btm-Right: (1,1)
- Example: 4 Pros & Cons; 3 different Departments.

CASE C: Hybrid (Process with Details)
- Rule: Use Edges for the main spine; use Coordinates for attached details.
- Layout: Main Node (0,0) -> Detail Node (1,0) [No edge, just proximity].

### 3. RENDERING PROTOCOLS
- Order:
  - If connected: Node A -> Edge -> Node B.
  - If independent: Node A -> Node B -> Node C.
- Node Types (Coloring):
  - concept (Orange): Core ideas
  - step (Blue): Action items
  - warning (Red): Risks
  - insight (Purple): Summaries
  - default (Gray): General text

### 4. XML STRUCTURE EXAMPLE
<group id="g1" title="Logic Map" row="0" col="0">
  <!-- Example: Causal Flow -->
  <node id="n1" type="concept" row="0" col="0">Core Problem</node>
  <edge from="n1" to="n2" label="causes" />
  <node id="n2" type="warning" row="0" col="1">Resulting Risk</node>
  
  <!-- Example: Detail Context (No Edge, placed below) -->
  <node id="n3" type="default" row="1" col="0">Context info for Problem</node>
</group>

IMPORTANT: This is a REGENERATION request. The group already exists, so use row="0" col="0" for the group coordinates.
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

	// 【关键修复】阶段 3: 在重置尺寸之前计算边缘方向
	// Requirements: 2.1 - 边缘安全区域计算
	// 
	// 重要：必须在组尺寸重置之前计算边缘方向，因为：
	// 1. determineEdgeDirection 使用组的中心点来计算方向
	// 2. 重置尺寸会改变组的中心点位置
	// 3. 使用改变后的中心点会导致计算出错误的边缘方向
	// 4. 错误的边缘方向会导致安全区域应用错误，进而导致节点位置计算错误
	const originalWidth = groupNode.width;
	const originalHeight = groupNode.height;
	console.log("[startRegeneration] 原始组尺寸:", { width: originalWidth, height: originalHeight });
	
	const edgeDirection: EdgeDirection = determineEdgeDirection(fromNode, groupNode);
	console.log("[startRegeneration] 边缘方向（重置前计算）:", edgeDirection);

	// 阶段 4: 【立即删除原始子节点】
	// Requirements: 3.1 - 立即删除所有原始子节点
	console.log("[startRegeneration] 立即删除原始子节点...");
	for (const node of originalChildNodes) {
		canvas.removeNode(node);
	}
	console.log("[startRegeneration] 原始子节点已删除");

	// 阶段 5: 收缩组到初始尺寸
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

	// 阶段 6: 创建 StreamingNodeCreator 实例
	// Requirements: 1.1 - 复用 StreamingNodeCreator（与 generateGroup.ts 相同）
	const nodeCreator = new StreamingNodeCreator(canvas, fromNode, settings);

	// 设置预创建组（使用之前计算的边缘方向）
	const preCreatedGroupSemanticId = "g1";
	nodeCreator.setPreCreatedGroup(
		groupNode,
		preCreatedGroupSemanticId,
		"", // mainEdgeId - 重新生成时边缘已存在
		edgeLabel || "",
		edgeDirection // 使用在重置前计算的边缘方向
	);

	// 初始化增量 XML 解析器（与 generateGroup.ts 相同）
	const xmlParser = new IncrementalXMLParser();
	let accumulatedResponse = "";
	let lastNodeUpdate = Date.now();
	let nodeCount = 0;

	try {
		// 阶段 7: 流式生成（完全复用 generateGroup.ts 的逻辑）
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

		// 阶段 8: 流完成后的处理（与 generateGroup.ts 相同）
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

		// 阶段 9: 最终边界调整
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
 * 
 * 返回值语义：
 * - "top": 边缘从组的顶部连接进来（组在源节点下方）
 * - "bottom": 边缘从组的底部连接进来（组在源节点上方）
 * - "left": 边缘从组的左侧连接进来（组在源节点右侧）
 * - "right": 边缘从组的右侧连接进来（组在源节点左侧）
 */
function determineEdgeDirection(fromNode: CanvasNode, toNode: CanvasNode): EdgeDirection {
	const fromCenterX = fromNode.x + fromNode.width / 2;
	const fromCenterY = fromNode.y + fromNode.height / 2;
	const toCenterX = toNode.x + toNode.width / 2;
	const toCenterY = toNode.y + toNode.height / 2;

	const deltaX = toCenterX - fromCenterX;
	const deltaY = toCenterY - fromCenterY;

	console.log("[determineEdgeDirection] 详细计算:");
	console.log("  源节点中心:", { x: fromCenterX, y: fromCenterY });
	console.log("  目标组中心:", { x: toCenterX, y: toCenterY });
	console.log("  Delta:", { deltaX, deltaY });
	console.log("  绝对值:", { absDeltaX: Math.abs(deltaX), absDeltaY: Math.abs(deltaY) });

	let direction: EdgeDirection;
	if (Math.abs(deltaX) > Math.abs(deltaY)) {
		// 水平方向为主
		direction = deltaX > 0 ? "left" : "right";
		console.log("  主方向: 水平", deltaX > 0 ? "(组在右侧)" : "(组在左侧)");
	} else {
		// 垂直方向为主
		direction = deltaY > 0 ? "top" : "bottom";
		console.log("  主方向: 垂直", deltaY > 0 ? "(组在下方)" : "(组在上方)");
	}
	
	console.log("  最终边缘方向:", direction);
	return direction;
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

