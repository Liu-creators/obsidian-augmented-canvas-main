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

		// Use a generic encoding for token counting (independent of actual model)
		const encoding = getEncoding("cl100k_base");

		const messages: any[] = [];
		let tokenCount = 0;

		// Note: We are not checking for system prompt longer than context window.
		// That scenario makes no sense, though.
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
					// will exceed input limit

					shouldContinue = false;

					// Leaving one token margin, just in case
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

	const generateNote = async (question?: string) => {
		console.log("generateNote called", { question, fromNode, toNode });
		
		if (!canCallAI()) {
			console.log("canCallAI returned false");
			return;
		}

		logDebug("Creating AI note");
		console.log("Creating AI note");

		const canvas = getActiveCanvas();
		if (!canvas) {
			logDebug("No active canvas");
			console.log("No active canvas");
			new Notice("No active canvas found. Please open a canvas view.");
			return;
		}
		console.log("Canvas found:", canvas);

		await canvas.requestFrame();

		let node: CanvasNode;
		if (!fromNode) {
			const selection = canvas.selection;
			console.log("Selection size:", selection?.size);
			if (selection?.size !== 1) {
				new Notice("Please select exactly one note to ask AI.");
				return;
			}
			const values = Array.from(selection.values());
			node = values[0];
			console.log("Selected node:", node);
		} else {
			node = fromNode;
		}

		if (node) {
			// Last typed characters might not be applied to note yet
			await canvas.requestSave();
			await sleep(200);

			const nodeContent = await readNodeContent(node);
			console.log("Node content:", nodeContent?.substring(0, 100));

			const { messages, tokenCount } = await buildMessages(node, {
				prompt: question,
			});
			console.log("Built messages:", messages.length, "tokens:", tokenCount);
			
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
						// text: "```loading...```",
						text: `\`\`\`Calling AI (${settings.apiModel})...\`\`\``,
						size: { height: placeholderNoteHeight },
					},
					node,
					{
						color: assistantColor,
						chat_role: "assistant",
					},
					question
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
				// logDebug("messages", messages);

				let firstDelta = true;
				await streamResponse(
					settings.apiKey,
					// settings.apiModel,
					messages,
					{
						model: settings.apiModel,
						max_tokens: settings.maxResponseTokens || undefined,
						temperature: settings.temperature,
						// max_tokens: getTokenLimit(settings) - tokenCount - 1,
					},
					(delta?: string) => {
						// * Last call
						if (!delta) {
							// const height = calcHeight({
							// 	text: created.text,
							// 	parentHeight: node.height,
							// });
							// created.moveAndResize({
							// 	height,
							// 	width: created.width,
							// 	x: created.x,
							// 	y: created.y,
							// });
							return;
						}

						let newText;
						if (firstDelta) {
							newText = delta;
							firstDelta = false;

							created.moveAndResize({
								height: NOTE_MIN_HEIGHT,
								width: created.width,
								x: created.x,
								y: created.y,
							});
						} else {
							const height = calcHeight({
								text: created.text,
								// parentHeight: node.height,
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
							newText = created.text + delta;
						}
						created.setText(newText);
					}
				);

				// if (generated == null) {
				// 	new Notice(`Empty or unreadable response from GPT`);
				// 	canvas.removeNode(created);
				// 	return;
				// }

				// * Update Node
				// created.setText(generated.response);
				// const nodeData = created.getData();
				// created.setData({
				// 	...nodeData,
				// 	questions: generated.questions,
				// });
				// const height = calcHeight({
				// 	text: generated.response,
				// 	parentHeight: node.height,
				// });
				// created.moveAndResize({
				// 	height,
				// 	width: created.width,
				// 	x: created.x,
				// 	y: created.y,
				// });

				// const selectedNoteId =
				// 	canvas.selection?.size === 1
				// 		? Array.from(canvas.selection.values())?.[0]?.id
				// 		: undefined;

				// if (selectedNoteId === node?.id || selectedNoteId == null) {
				// 	// If the user has not changed selection, select the created node
				// 	canvas.selectOnly(created, false /* startEditing */);
				// }
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
