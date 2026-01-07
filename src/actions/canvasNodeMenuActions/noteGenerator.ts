import { getEncoding } from "js-tiktoken";
import { App, ItemView, Notice } from "obsidian";
import { CanvasNode } from "../../obsidian/canvas-internal";
import {
	CanvasView,
	calcHeight,
	createNode,
	addEdge,
} from "../../obsidian/canvas-patches";
import {
	AugmentedCanvasSettings,
} from "../../settings/AugmentedCanvasSettings";
import { visitNodeAndAncestors } from "../../obsidian/canvasUtil";
import { readNodeContent } from "../../obsidian/fileUtil";
import { streamResponse } from "../../utils/chatgpt";
import { CHAT_MODELS, chatModelByName } from "../../openai/models";
import { isGroup, getNodesInGroup } from "../../utils/groupUtils";
import { Canvas } from "../../obsidian/canvas-internal";
import {
	parseNodesFromMarkdown,
	calculateSmartLayout,
	NodeLayout,
} from "../../utils/groupGenerator";
import { randomHexString } from "../../utils";
// 新架构模块导入
import { GroupStreamManager, ChatMessage, ModelConfig } from "../../utils/groupGeneration/groupStreamManager";
import { createConfigFromSettings } from "../../utils/groupGeneration/config";
import { GenerationOptions, StreamingCallbacks } from "../../utils/groupGeneration/types";

/**
 * Color for assistant notes: 6 == purple
 */
const assistantColor = "6";

/**
 * Height to use for placeholder note
 */
const placeholderNoteHeight = 60;

export const NOTE_MIN_HEIGHT = 400;
export const NOTE_INCR_HEIGHT_STEP = 150;

// 调试日志函数（保留用于调试）
const logDebug = (_text: unknown) => null;

export function noteGenerator(
	app: App,
	settings: AugmentedCanvasSettings,
	fromNode?: CanvasNode,
	toNode?: CanvasNode
	// logDebug: Logger
) {
	const canCallAI = () => {
		// return true;
		if (!settings.apiKey) {
			new Notice("请在插件设置中设置 DeepSeek API 密钥");
			return false;
		}

		return true;
	};

	const getActiveCanvas = () => {
		const maybeCanvasView = app.workspace.getActiveViewOfType(
			ItemView
		) as CanvasView | null;
		return maybeCanvasView ? maybeCanvasView["canvas"] : null;
	};

	const isSystemPromptNode = (text: string) =>
		text.trim().startsWith("系统提示词");

	const getSystemPrompt = async (node: CanvasNode) => {
		// TODO
		let foundPrompt: string | null = null;

		await visitNodeAndAncestors(node, async (n: CanvasNode) => {
			const text = await readNodeContent(n);
			if (text && isSystemPromptNode(text)) {
				foundPrompt = text.replace("系统提示词", "").trim();
				return false;
			} else {
				return true;
			}
		});

		return foundPrompt || settings.systemPrompt;
	};

	const buildMessages = async (
		node: CanvasNode,
		{
			systemPrompt,
			prompt,
		}: {
			systemPrompt?: string;
			prompt?: string;
		} = {}
	) => {
		// return { messages: [], tokenCount: 0 };

		// 使用通用编码来计算 token 数（与具体模型无关）
		const encoding = getEncoding("cl100k_base");

		const messages: any[] = [];
		let tokenCount = 0;

		// 说明：这里不单独检查 system prompt 是否超过上下文窗口，正常使用下不会这么写
		const systemPrompt2 = systemPrompt || (await getSystemPrompt(node));
		if (systemPrompt2) {
			tokenCount += encoding.encode(systemPrompt2).length;
		}

		const visit = async (
			node: CanvasNode,
			depth: number,
			edgeLabel?: string
		) => {
			if (settings.maxDepth && depth > settings.maxDepth) return false;

			const nodeData = node.getData();
			let nodeText = (await readNodeContent(node))?.trim() || "";
			const inputLimit = getTokenLimit(settings);

			let shouldContinue = true;

			if (nodeText) {
				if (isSystemPromptNode(nodeText)) return true;

				const nodeTokens = encoding.encode(nodeText);
				let keptNodeTokens: number;

				if (tokenCount + nodeTokens.length > inputLimit) {
					// 将会超过模型允许的最大输入 token 数

					shouldContinue = false;

					// 预留 1 个 token 的安全余量，避免边界情况报错
					const keepTokens = nodeTokens.slice(
						0,
						inputLimit - tokenCount - 1
					);
					const truncateTextTo = encoding.decode(keepTokens).length;
					logDebug(
						`Truncating node text from ${nodeText.length} to ${truncateTextTo} characters`
					);
					new Notice(
						`节点文本从 ${nodeText.length} 截断至 ${truncateTextTo} 字符`
					);
					nodeText = nodeText.slice(0, truncateTextTo);
					keptNodeTokens = keepTokens.length;
				} else {
					keptNodeTokens = nodeTokens.length;
				}

				tokenCount += keptNodeTokens;

				const role: any =
					nodeData.chat_role === "assistant" ? "assistant" : "user";

				if (edgeLabel) {
					messages.unshift({
						content: edgeLabel,
						role: "user",
					});
				}
				messages.unshift({
					content: nodeText,
					role,
				});
			}

			return shouldContinue;
		};

		await visitNodeAndAncestors(node, visit);

		// if (messages.length) {
		if (systemPrompt2)
			messages.unshift({
				role: "system",
				content: systemPrompt2,
			});
		// }

		if (prompt)
			messages.push({
				role: "user",
				content: prompt,
			});

		return { messages, tokenCount };
	};

	const generateNote = async (question?: string, edgeLabel?: string) => {
		if (!canCallAI()) {
			return;
		}

		const canvas = getActiveCanvas();
		if (!canvas) {
			new Notice("No active canvas found. Please open a canvas view.");
			return;
		}

		await canvas.requestFrame();

		let node: CanvasNode;
		if (!fromNode) {
			const selection = canvas.selection;
			if (selection?.size !== 1) {
				new Notice("Please select exactly one note to ask AI.");
				return;
			}
			const values = Array.from(selection.values());
			node = values[0];
		} else {
			node = fromNode;
		}

		if (node) {
			// Last typed characters might not be applied to note yet
			await canvas.requestSave();
			await sleep(200);

			const nodeContent = await readNodeContent(node);

			const { messages, tokenCount } = await buildMessages(node, {
				prompt: question,
			});

			// If no messages, try to use node content directly or use a default prompt
			if (!messages.length) {
				const nodeText = nodeContent?.trim() || "";
				if (!nodeText && !question) {
					new Notice("所选笔记中未找到内容。请添加一些内容或提出问题。");
					return;
				}
				// If there's a question but no node content, use the question as the message
				if (question) {
					messages.push({
						role: "user",
						content: question,
					});
				} else if (nodeText) {
					messages.push({
						role: "user",
						content: nodeText,
					});
				}
			}

			let created: CanvasNode;
			if (!toNode) {
				created = createNode(
					canvas,
					{
						text: `\`\`\`正在调用 AI (${settings.apiModel})...\`\`\``,
						size: { height: placeholderNoteHeight },
					},
					node,
					{
						color: assistantColor,
						chat_role: "assistant",
					},
					edgeLabel !== undefined ? edgeLabel : question,
					settings // Pass settings to enable smart positioning
				);
			} else {
				// Check if target is a group - route to group regeneration logic
				if (isGroup(toNode)) {
					await regenerateGroup(canvas, toNode, node, messages, settings, edgeLabel);
					await canvas.requestSave();
					return;
				}

				// Non-group node: use existing setText() logic
				created = toNode;
				created.setText(
					`\`\`\`正在调用 AI (${settings.apiModel})...\`\`\``
				);
			}

			new Notice(
				`正在向 DeepSeek AI 发送 ${messages.length} 条笔记（共 ${tokenCount} 个 token）`
			);

			// Add edge label to messages if provided (Requirement 5.3)
			const messagesWithEdgeLabel = [...messages];
			if (edgeLabel) {
				messagesWithEdgeLabel.push({
					role: "user",
					content: edgeLabel,
				});
			}

			try {
				let firstDelta = true;

				await streamResponse(
					settings.apiKey,
					messagesWithEdgeLabel,
					{
						model: settings.apiModel,
						max_tokens: settings.maxResponseTokens || undefined,
						temperature: settings.temperature,
					},
					(chunk: string | null, error?: Error) => {
						// Handle errors
						if (error) {
							throw error;
						}

						// * Last call (stream completed)
						if (!chunk) {
							// Stream completed - resize to fit final content
							const finalText = created.text;
							if (finalText) {
								const finalHeight = calcHeight({ text: finalText });
								// Use calculated height with a reasonable minimum (80px)
								// Cap at a reasonable maximum to avoid excessive height
								const optimalHeight = Math.max(80, Math.min(finalHeight, NOTE_MIN_HEIGHT * 3));

								if (Math.abs(optimalHeight - created.height) > 20) {
									// Only resize if difference is significant (>20px)
									created.moveAndResize({
										height: optimalHeight,
										width: created.width,
										x: created.x,
										y: created.y,
									});
									console.log(`[noteGenerator] Final resize: ${created.height}px -> ${optimalHeight}px for text length ${finalText.length}`);
								}
							}
							return;
						}

						let newText;
						if (firstDelta) {
							newText = chunk;
							firstDelta = false;

							// Calculate height based on actual content instead of fixed minimum
							const calculatedHeight = calcHeight({ text: newText });
							// Use calculated height with a reasonable minimum (80px)
							// But don't exceed initial max (NOTE_MIN_HEIGHT) for first display
							const initialHeight = Math.max(80, Math.min(calculatedHeight, NOTE_MIN_HEIGHT));

							created.moveAndResize({
								height: initialHeight,
								width: created.width,
								x: created.x,
								y: created.y,
							});
						} else {
							const height = calcHeight({
								text: created.text,
							});
							if (height > created.height) {
								created.moveAndResize({
									height:
										created.height + NOTE_INCR_HEIGHT_STEP,
									width: created.width,
									x: created.x,
									y: created.y,
								});
							}
							newText = created.text + chunk;
						}

						created.setText(newText);
					}
				);
			} catch (error: any) {
				const errorMessage = error?.message || error?.toString() || "Unknown error";
				console.error("DeepSeek AI Error:", error);
				logDebug("DeepSeek AI Error: " + errorMessage);
				new Notice(`调用 DeepSeek AI 出错: ${errorMessage}`);
				if (!toNode && created) {
					canvas.removeNode(created);
				}
			}

			await canvas.requestSave();
		}
	};

	// return { nextNote, generateNote };
	return { generateNote, buildMessages };
}

/**
 * Regenerate content for a Group target
 * 使用新架构的 GroupStreamManager 和 CanvasRenderer 进行重构
 * Groups don't have setText(), so we need to clear child nodes and repopulate
 *
 * @param canvas - Canvas instance
 * @param groupNode - The group node to regenerate
 * @param fromNode - The source node for context
 * @param messages - AI messages array
 * @param settings - Plugin settings
 * @param edgeLabel - Optional edge label to use as prompt
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4 - 使用新架构支持重新生成
 */
async function regenerateGroup(
	canvas: Canvas,
	groupNode: CanvasNode,
	fromNode: CanvasNode,
	messages: any[],
	settings: AugmentedCanvasSettings,
	edgeLabel?: string
): Promise<void> {
	// 检查 API 密钥 (Requirement 4.1)
	if (!settings.apiKey) {
		new Notice("请在插件设置中设置 DeepSeek API 密钥");
		return;
	}

	// 存储组边界以便保留 (Requirement 6.3 - 保留组位置)
	const groupBounds = {
		x: groupNode.x,
		y: groupNode.y,
		width: groupNode.width,
		height: groupNode.height,
	};

	console.log("[regenerateGroup] 开始重新生成，组边界:", groupBounds);
	console.log("[regenerateGroup] 边缘标签:", edgeLabel);
	console.log("[regenerateGroup] 消息数量:", messages.length);

	// 获取现有子节点用于两阶段删除 (Requirement 6.2 - 清除现有节点)
	const originalChildNodes = getNodesInGroup(groupNode, canvas);
	console.log("[regenerateGroup] 原始子节点数量:", originalChildNodes.length);

	// 跟踪删除状态用于错误恢复
	let deletedOriginals = false;
	let accumulatedContent = "";
	let streamingError: Error | null = null;

	// 添加边缘标签到消息中 (Requirement 3.4, 5.1, 5.3)
	const messagesWithEdgeLabel: ChatMessage[] = messages.map(m => ({
		role: m.role,
		content: m.content,
	}));
	if (edgeLabel) {
		messagesWithEdgeLabel.push({
			role: "user",
			content: edgeLabel,
		});
	}

	new Notice("正在为 Group 重新生成内容...");

	// 创建配置（用于未来的完整重构）
	// 注意：当前实现使用简化的节点创建流程
	createConfigFromSettings(settings);

	// 设置生成选项 (Requirement 6.1 - 支持 targetGroupId)
	const generationOptions: GenerationOptions = {
		targetGroupId: groupNode.id,
		clearExisting: true,
		preserveBounds: true,
	};

	// 定义生命周期回调 (Requirement 6.5 - 生命周期回调)
	const callbacks: StreamingCallbacks = {
		onStart: () => {
			console.log("[regenerateGroup] 流式生成开始");
		},
		onProgress: (_progress: number) => {
			// 可选：显示进度
		},
		onComplete: () => {
			console.log("[regenerateGroup] 流式生成完成");
		},
		onError: (error: Error) => {
			console.error("[regenerateGroup] 流式生成错误:", error);
			streamingError = error;
		},
	};

	// 创建 GroupStreamManager 实例 (Requirement 6.1 - 使用 GroupStreamManager)
	const streamManager = new GroupStreamManager(callbacks);

	// 设置流式响应函数
	streamManager.setStreamResponseFunction(async (
		apiKey: string,
		msgs: ChatMessage[],
		modelConfig: { max_tokens?: number; model?: string; temperature?: number },
		callback: (chunk: string | null, error?: Error) => void
	): Promise<void> => {
		await streamResponse(
			apiKey,
			msgs as any,
			{
				model: modelConfig.model,
				max_tokens: modelConfig.max_tokens,
				temperature: modelConfig.temperature,
			},
			(chunk: string | null, error?: Error) => {
				// 处理错误
				if (error) {
					callback(null, error);
					return;
				}

				// 流结束
				if (chunk === null) {
					callback(null);
					return;
				}

				// 第一个成功的数据块 - 安全删除原始节点（两阶段删除）
				// 这确保了如果在任何数据到达之前发生错误，原始内容会被保留
				if (!deletedOriginals && chunk) {
					console.log("[regenerateGroup] 收到第一个数据块，删除原始子节点");
					for (const node of originalChildNodes) {
						canvas.removeNode(node);
					}
					deletedOriginals = true;
				}

				// 累积内容
				accumulatedContent += chunk;
				callback(chunk);
			}
		);
	});

	try {
		// 构建模型配置
		const modelConfig: ModelConfig = {
			model: settings.apiModel,
			max_tokens: settings.maxResponseTokens || undefined,
			temperature: settings.temperature,
		};

		// 开始生成 (Requirement 6.4 - 支持重新生成)
		await streamManager.startGeneration(
			settings.apiKey,
			messagesWithEdgeLabel,
			modelConfig,
			generationOptions
		);

		// 检查是否有流式错误
		if (streamingError) {
			throw streamingError;
		}

		// 解析累积的内容为节点 (Requirement 3.5)
		const { nodes: parsedNodes, connections } = parseNodesFromMarkdown(accumulatedContent);
		console.log("[regenerateGroup] 解析的节点数量:", parsedNodes.length);
		console.log("[regenerateGroup] 解析的连接数量:", connections.length);

		if (parsedNodes.length === 0 && accumulatedContent.trim()) {
			// 如果没有解析到节点，创建一个包含所有内容的单节点
			parsedNodes.push({ content: accumulatedContent });
		}

		// 计算新节点在组边界内的布局 (Requirement 3.6)
		const nodeContents = parsedNodes.map(n => n.content);
		const groupPadding = 60;
		const layouts = calculateSmartLayout(nodeContents, { nodeSpacing: 40 });

		// 在组内创建新节点
		const createdNodes: CanvasNode[] = [];
		const data = canvas.getData();
		const newTextNodes: any[] = [];

		for (let i = 0; i < parsedNodes.length; i++) {
			const node = parsedNodes[i];
			const layout = layouts[i];

			// 在组边界内定位节点
			const nodeX = groupBounds.x + groupPadding + layout.x;
			const nodeY = groupBounds.y + groupPadding + layout.y;

			const nodeId = randomHexString(16);
			newTextNodes.push({
				id: nodeId,
				type: "text",
				text: node.content,
				x: nodeX,
				y: nodeY,
				width: layout.width,
				height: layout.height,
			});
		}

		// 一次性导入所有新节点
		canvas.importData({
			nodes: [...data.nodes, ...newTextNodes],
			edges: data.edges,
		});

		await canvas.requestFrame();

		// 获取创建的节点引用
		for (const nodeData of newTextNodes) {
			const createdNode = canvas.nodes.get(nodeData.id);
			if (createdNode) {
				createdNodes.push(createdNode);
			}
		}

		// 根据连接信息创建子节点之间的边 (Requirement 3.7)
		if (connections.length > 0) {
			console.log("[regenerateGroup] 创建子节点之间的连接");
			for (const connection of connections) {
				if (connection.fromIndex >= 0 && connection.fromIndex < createdNodes.length &&
					connection.toIndex >= 0 && connection.toIndex < createdNodes.length) {

					const fromNodeRef = createdNodes[connection.fromIndex];
					const toNodeRef = createdNodes[connection.toIndex];

					if (fromNodeRef && toNodeRef) {
						// 根据节点位置确定边的连接侧
						const fromLayout = layouts[connection.fromIndex];
						const toLayout = layouts[connection.toIndex];
						const { fromSide, toSide } = determineEdgeSidesFromLayouts(fromLayout, toLayout);

						addEdge(
							canvas,
							randomHexString(16),
							{
								fromOrTo: "from",
								side: fromSide,
								node: fromNodeRef,
							},
							{
								fromOrTo: "to",
								side: toSide,
								node: toNodeRef,
							},
							connection.label,
							{
								isGenerated: true,
							}
						);
					}
				}
			}
		}

		new Notice(`Group 重新生成完成，创建了 ${createdNodes.length} 个节点`);
		console.log("[regenerateGroup] 成功完成");

	} catch (error: any) {
		const errorMessage = error?.message || error?.toString() || "Unknown error";
		console.error("[regenerateGroup] 错误:", error);

		// 只有在回调中没有显示过通知时才显示
		if (!streamingError) {
			// 错误发生在流式传输之外（例如节点创建期间）
			if (!deletedOriginals) {
				new Notice(`Group 重新生成出错: ${errorMessage}。原始内容已保留。`);
			} else {
				new Notice(`Group 重新生成出错: ${errorMessage}`);
			}
		} else {
			// 流式错误
			if (!deletedOriginals) {
				new Notice(`Group 重新生成出错: ${errorMessage}。原始内容已保留。`);
			} else {
				new Notice(`Group 重新生成出错: ${errorMessage}`);
			}
		}

		// 记录保留状态用于调试
		if (!deletedOriginals) {
			console.log("[regenerateGroup] 由于错误，原始子节点已保留");
		} else {
			console.log("[regenerateGroup] 原始子节点在错误发生前已被删除");
		}
	}
}

/**
 * Determine edge sides based on relative positions of two node layouts
 */
function determineEdgeSidesFromLayouts(
	fromLayout: NodeLayout,
	toLayout: NodeLayout
): { fromSide: string; toSide: string } {
	const fromCenterX = fromLayout.x + fromLayout.width / 2;
	const fromCenterY = fromLayout.y + fromLayout.height / 2;
	const toCenterX = toLayout.x + toLayout.width / 2;
	const toCenterY = toLayout.y + toLayout.height / 2;

	const deltaX = toCenterX - fromCenterX;
	const deltaY = toCenterY - fromCenterY;

	if (Math.abs(deltaX) > Math.abs(deltaY)) {
		if (deltaX > 0) {
			return { fromSide: "right", toSide: "left" };
		} else {
			return { fromSide: "left", toSide: "right" };
		}
	} else {
		if (deltaY > 0) {
			return { fromSide: "bottom", toSide: "top" };
		} else {
			return { fromSide: "top", toSide: "bottom" };
		}
	}
}

export function getTokenLimit(settings: AugmentedCanvasSettings) {
	const model =
		chatModelByName(settings.apiModel) || CHAT_MODELS.DEEPSEEK_CHAT;
	const tokenLimit = settings.maxInputTokens
		? Math.min(settings.maxInputTokens, model.tokenLimit)
		: model.tokenLimit;

	// console.log({ settings, tokenLimit });
	return tokenLimit;
}
