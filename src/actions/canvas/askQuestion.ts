import { App, Notice } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { CanvasNode } from "../../obsidian/canvas-internal";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";
import { getResponse } from "../../utils/chatgpt";
import { isGroup, readGroupContent, getGroupLabel } from "../../utils/groupUtils";

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
	console.log("handleCallGPT_Question called", { node, question });

	// 特殊处理 group 节点
	if (isGroup(node)) {
		console.log("Node is a group, reading all content from group");

		const groupLabel = getGroupLabel(node);
		const groupContent = await readGroupContent(node);

		if (!groupContent && !question) {
			new Notice(`Group "${groupLabel}" is empty. Please add some content to the group or ask a question.`);
			return;
		}

		console.log(`Group "${groupLabel}" content length: ${groupContent.length} characters`);

		// 对于 group，构建包含 group 内容的完整 prompt
		// 但连线上只显示用户输入的问题
		const fullPrompt = groupContent
			? `Here is the content from group "${groupLabel}":\n\n${groupContent}\n\n---\n\n${question || "Please analyze this content."}`
			: question;

		console.log("Creating noteGenerator with node");
		const { generateNote } = noteGenerator(app, settings, node);
		console.log("Calling generateNote with full prompt but showing only question on edge");
		// 第一个参数是完整的 prompt（发送给 AI），第二个参数是边缘标签（显示在连线上）
		await generateNote(fullPrompt, question);
		return;
	}

	// 普通节点的处理流程
	console.log("Creating noteGenerator with node");
	const { generateNote } = noteGenerator(app, settings, node);
	console.log("Calling generateNote with question:", question);
	await generateNote(question);
};

export const handleCallGPT_Questions = async (
	app: App,
	settings: AugmentedCanvasSettings,
	node: CanvasNode
) => {
	const { buildMessages } = noteGenerator(app, settings);
	const { messages } = await buildMessages(node, {
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

