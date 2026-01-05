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
	DEFAULT_SETTINGS,
} from "../../settings/AugmentedCanvasSettings";
// import { Logger } from "./util/logging";
import { visitNodeAndAncestors } from "../../obsidian/canvasUtil";
import { readNodeContent } from "../../obsidian/fileUtil";
import { getResponse, streamResponse } from "../../utils/chatgpt";
import { CHAT_MODELS, chatModelByName } from "../../openai/models";

/**
 * Color for assistant notes: 6 == purple
 */
const assistantColor = "6";

/**
 * Height to use for placeholder note
 */
const placeholderNoteHeight = 60;

/**
 * Height to use for new empty note
 */
const emptyNoteHeight = 100;

const NOTE_MAX_WIDTH = 400;
export const NOTE_MIN_HEIGHT = 400;
export const NOTE_INCR_HEIGHT_STEP = 150;

// TODO : remove
const logDebug = (text: any) => null;

// const SYSTEM_PROMPT2 = `
// You must respond in this JSON format: {
// 	"response": Your response, must be in markdown,
// 	"questions": Follow up questions the user could ask based on your response, must be an array
// }
// The response must be in the same language the user used.
// `.trim();

const SYSTEM_PROMPT = `
You must respond in markdown.
The response must be in the same language the user used.
`.trim();

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
			new Notice("Please set your DeepSeek API key in the plugin settings");
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
		text.trim().startsWith("SYSTEM PROMPT");

	const getSystemPrompt = async (node: CanvasNode) => {
		// TODO
		let foundPrompt: string | null = null;

		await visitNodeAndAncestors(node, async (n: CanvasNode) => {
			const text = await readNodeContent(n);
			if (text && isSystemPromptNode(text)) {
				foundPrompt = text.replace("SYSTEM PROMPT", "").trim();
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

				let nodeTokens = encoding.encode(nodeText);
				let keptNodeTokens: number;

				if (tokenCount + nodeTokens.length > inputLimit) {
					// 将会超过模型允许的最大输入 token 数

					shouldContinue = false;

					// 预留 1 个 token 的安全余量，避免边界情况报错
					const keepTokens = nodeTokens.slice(
						0,
						inputLimit - tokenCount - 1
						// * needed because very large context is a little above
						// * should this be a number from settings.maxInput ?
						// TODO
						// (nodeTokens.length > 100000 ? 20 : 1)
					);
					const truncateTextTo = encoding.decode(keepTokens).length;
					logDebug(
						`Truncating node text from ${nodeText.length} to ${truncateTextTo} characters`
					);
					new Notice(
						`Truncating node text from ${nodeText.length} to ${truncateTextTo} characters`
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
		// } else {
		// 	return { messages: [], tokenCount: 0 };
		// }
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
					new Notice("No content found in the selected note. Please add some content or ask a question.");
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
						text: `\`\`\`Calling AI (${settings.apiModel})...\`\`\``,
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
				created = toNode;
				created.setText(
					`\`\`\`Calling AI (${settings.apiModel})...\`\`\``
				);
			}

			new Notice(
				`Sending ${messages.length} notes with ${tokenCount} tokens to DeepSeek AI`
			);

			try {
				let firstDelta = true;
				
				await streamResponse(
					settings.apiKey,
					messages,
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
				new Notice(`Error calling DeepSeek AI: ${errorMessage}`);
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
