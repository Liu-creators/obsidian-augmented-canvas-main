import { App, Notice } from "obsidian";
import { CanvasNode } from "../../obsidian/canvas-internal";
import { getActiveCanvas } from "../../utils";
import { readNodeContent } from "../../obsidian/fileUtil";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { getResponse } from "../../utils/chatgpt";

const FLASHCARDS_SYSTEM_PROMPT = `
You must respond in this JSON format: {
	"filename": The filename,
	"flashcards": {
		"front": string,
		"back": string
	}[]
}

You must respond in the language the user used, default to english.
`.trim();

export const createFlashcards = async (
	app: App,
	settings: AugmentedCanvasSettings
) => {
	const canvas = getActiveCanvas(app);
	if (!canvas) return;

	new Notice("Flashcard file being created...");

	const node = <CanvasNode>Array.from(canvas.selection)?.first()!;
	const nodeText = (await readNodeContent(node))?.trim() || "";

	const gptResponse = await getResponse(
		settings.apiKey,
		[
			{
				role: "system",
				content: `${FLASHCARDS_SYSTEM_PROMPT}

${settings.flashcardsSystemPrompt}`,
			},
			{
				role: "user",
				content: nodeText,
			},
		],
		{
			model: settings.apiModel,
			max_tokens: settings.maxResponseTokens || undefined,
			temperature: settings.temperature,
			isJSON: true,
		}
	);

	const content = `
${gptResponse.flashcards
	.map(
		(flashcard: { front: string; back: string }) =>
			`${flashcard.front}::${flashcard.back}`
	)
	.join("\n\n")}
`.trim();

	const FLASHCARDS_PATH = "Home/Flashcards";
	try {
		await app.vault.createFolder(
			`${FLASHCARDS_PATH}/${gptResponse.filename}`
		);
	} catch {}
	await app.vault.create(
		`${FLASHCARDS_PATH}/${gptResponse.filename}/${gptResponse.filename}.md`,
		content
	);

	new Notice(`Flashcard file "${gptResponse.filename}" created successfully`);
};

