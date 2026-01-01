import { App } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { CanvasNode } from "../../obsidian/canvas-internal";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";
import { getResponse } from "../../utils/chatgpt";

const SYSTEM_PROMPT_QUESTIONS = `
You must respond in this JSON format: {
	"questions": Follow up questions the user could ask based on the chat history, must be an array
}
The questions must be asked in the same language the user used, default to English.
`.trim();

export const handleCallGPT_Question = async (
	app: App,
	settings: AugmentedCanvasSettings,
	node: CanvasNode,
	question: string
) => {
	if (node.unknownData.type === "group") {
		return;
	}

	const { generateNote } = noteGenerator(app, settings);
	await generateNote(question);
};

export const handleCallGPT_Questions = async (
	app: App,
	settings: AugmentedCanvasSettings,
	node: CanvasNode
) => {
	const { buildMessages } = noteGenerator(app, settings);
	const { messages, tokenCount } = await buildMessages(node, {
		systemPrompt: SYSTEM_PROMPT_QUESTIONS,
	});
	if (messages.length <= 1) return;

	const gptResponse = await getResponse(
		settings.apiKey,
		messages,
		{
			model: settings.apiModel,
			max_tokens: settings.maxResponseTokens || undefined,
			temperature: settings.temperature,
			isJSON: true,
		}
	);

	return gptResponse.questions;
};

