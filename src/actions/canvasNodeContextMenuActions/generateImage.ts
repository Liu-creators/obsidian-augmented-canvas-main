import { App, Notice, TFile } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { createImage } from "../../utils/chatgpt";
import {
	getActiveCanvas,
	getActiveCanvasNodes,
	getCanvasActiveNoteText,
	getImageSaveFolderPath,
} from "../../utils";
import { saveBase64Image } from "../../obsidian/imageUtils";
import { createNode } from "../../obsidian/canvas-patches";
import { generateFileName, updateNodeAndSave } from "../../obsidian/fileUtil";

export const handleGenerateImage = async (
	app: App,
	settings: AugmentedCanvasSettings
) => {
	new Notice(`Generating image using ${settings.imageModel}...`);

	const canvas = getActiveCanvas(app);
	if (!canvas) return;

	const activeCanvasNodes = getActiveCanvasNodes(app);
	if (!activeCanvasNodes || activeCanvasNodes.length !== 1) return;

	const parentNode = activeCanvasNodes[0];

	const nodeText = await getCanvasActiveNoteText(app);
	if (!nodeText) return;

	const IMAGE_WIDTH = parentNode.width;
	const IMAGE_HEIGHT = IMAGE_WIDTH * (1024 / 1792) + 20;

	const node = createNode(
		canvas,
		{
			text: `\`Calling AI (${settings.imageModel})...\``,
			size: {
				width: IMAGE_WIDTH,
				height: IMAGE_HEIGHT,
			},
		},
		parentNode
	);

	try {
		const b64Image = await createImage(settings.apiKey, nodeText, {
			model: settings.imageModel,
		});

		const imageFileName = generateFileName("AI-Image");
		const imageFolder = await getImageSaveFolderPath(app, settings);
		await saveBase64Image(app, `${imageFolder}/${imageFileName}.png`, b64Image);
		new Notice(`Image "${imageFileName}" generated successfully.`);

		updateNodeAndSave(canvas, node, {
			text: `![[${imageFolder}/${imageFileName}.png]]`,
		});
	} catch (error: any) {
		const errorMessage = error?.message || String(error);
		let userMessage = "Failed to generate image.";
		
		if (errorMessage.includes("DeepSeek") || errorMessage.includes("does not support image generation")) {
			userMessage = "DeepSeek API does not support image generation. Please use a provider that supports image generation (e.g., OpenAI) or switch to a different API provider in settings.";
		} else if (errorMessage.includes("API key") || errorMessage.includes("401") || errorMessage.includes("403")) {
			userMessage = "Invalid API key or insufficient permissions. Please check your API key in settings.";
		} else if (errorMessage.includes("rate limit") || errorMessage.includes("429")) {
			userMessage = "Rate limit exceeded. Please try again later.";
		}
		
		new Notice(`Error: ${userMessage}`);
		console.error("Image generation error:", error);
		canvas.removeNode(node);
		return;
	}

	// TODO : For now Obsidian API to .createFileNode is bugged
	// canvas.removeNode(node);

	// await sleep(100);

	// const file = app.vault.getAbstractFileByPath(
	// 	`${imageFileName}.png`
	// ) as TFile;
	// console.log({ file });

	// const node2 = createNode(
	// 	canvas,
	// 	{
	// 		type: "file",
	// 		file,
	// 		size: {
	// 			width: IMAGE_WIDTH,
	// 			height: IMAGE_HEIGHT,
	// 		},
	// 	},
	// 	parentNode
	// );
	// node2.moveAndResize({
	// 	size: {
	// 		width: IMAGE_WIDTH,
	// 		height: IMAGE_HEIGHT,
	// 	},
	// });

	canvas.requestSave();
};
