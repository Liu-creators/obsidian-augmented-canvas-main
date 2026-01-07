import { getEncoding } from "js-tiktoken";
import { App, ItemView, Notice } from "obsidian";
import { CanvasNode } from "../../obsidian/canvas-internal";
import {
	CanvasView,
	calcHeight,
	createNode,
} from "../../obsidian/canvas-patches";
import {
	AugmentedCanvasSettings,
} from "../../settings/AugmentedCanvasSettings";
import { visitNodeAndAncestors } from "../../obsidian/canvasUtil";
import { readNodeContent } from "../../obsidian/fileUtil";
import { streamResponse } from "../../utils/chatgpt";
import { CHAT_MODELS, chatModelByName } from "../../openai/models";
import { isGroup } from "../../utils/groupUtils";
// 新架构模块导入
import { ChatMessage } from "../../utils/groupGeneration/groupStreamManager";
// 导入新的 startRegeneration 函数
// Requirements: 1.1 - 统一流式处理管道
import { startRegeneration, RegenerationCallbacks } from "../canvas/regenerateResponse";

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
				// 检测目标是否为组节点 - 路由到 startRegeneration 函数
				// Requirements: 1.1 - 统一流式处理管道
				if (isGroup(toNode)) {
					// 转换消息格式为 ChatMessage[]
					// Requirements: 5.2 - 边缘标签包含在 AI 消息中
					const chatMessages: ChatMessage[] = messages.map(m => ({
						role: m.role,
						content: m.content,
					}));

					// 定义生命周期回调（用于调试和 UI 更新）
					// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5 - 状态同步与回调
					const callbacks: RegenerationCallbacks = {
						onStart: () => {
							console.log("[generateNote] 流式重新生成开始");
						},
						onNodeCreated: (nodeId: string) => {
							console.log(`[generateNote] 节点创建: ${nodeId}`);
						},
						onProgress: (progress: number) => {
							console.log(`[generateNote] 进度: ${progress}%`);
						},
						onComplete: () => {
							console.log("[generateNote] 流式重新生成完成");
						},
						onError: (error: Error) => {
							console.error("[generateNote] 流式重新生成错误:", error);
						},
					};

					// 直接调用 startRegeneration 函数
					// Requirements: 1.1 - 复用 StreamingNodeCreator
					// Requirements: 5.1, 5.2, 5.3 - 边缘标签传递
					await startRegeneration(
						canvas,
						toNode,
						node,
						chatMessages,
						settings,
						edgeLabel,
						callbacks
					);
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

export function getTokenLimit(settings: AugmentedCanvasSettings) {
	const model =
		chatModelByName(settings.apiModel) || CHAT_MODELS.DEEPSEEK_CHAT;
	const tokenLimit = settings.maxInputTokens
		? Math.min(settings.maxInputTokens, model.tokenLimit)
		: model.tokenLimit;

	// console.log({ settings, tokenLimit });
	return tokenLimit;
}
