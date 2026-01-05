import { App, Notice, TFolder } from "obsidian";
import { ChatCompletionMessageParam } from "openai/resources";
import { calcHeight, createNode } from "src/obsidian/canvas-patches";
import {
	AugmentedCanvasSettings,
	SystemPrompt,
} from "src/settings/AugmentedCanvasSettings";
import { getActiveCanvas } from "src/utils";
import { streamResponse } from "src/utils/chatgpt";
import {
	NOTE_INCR_HEIGHT_STEP,
	NOTE_MIN_HEIGHT,
} from "../canvasNodeMenuActions/noteGenerator";
import { readFolderMarkdownContent } from "src/obsidian/fileUtil";

export const runPromptFolder = async (
	app: App,
	settings: AugmentedCanvasSettings,
	systemPrompt: SystemPrompt,
	folder: TFolder
) => {
	const canvas = getActiveCanvas(app);
	if (!canvas) return;

	// 结果节点的初始宽高
	const NODE_WIDTH = 800;
	const NODE_HEIGHT = 300;
	// 初始显示的占位文案
	const text = `\`\`\`正在呼叫 AI (${settings.apiModel})...\`\`\``;
	const created = createNode(canvas, {
		pos: {
			// @ts-expect-error
			x: canvas.x - NODE_WIDTH / 2,
			// @ts-expect-error
			y: canvas.y - NODE_HEIGHT / 2,
		},
		// position: "left",
		size: {
			height: calcHeight({
				// parentHeight: NODE_HEIGHT,
				text,
			}),
			width: NODE_WIDTH,
		},
		text,
		focus: false,
	});
	// canvas.menu.menuEl.append(new MenuItem())

	// 读取目标文件夹下所有 Markdown 内容，拼接为一个大输入
	const folderContentText = await readFolderMarkdownContent(app, folder);

	// 构建系统提示 + 用户输入（文件夹内容）消息
	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: systemPrompt.prompt,
		},
		{
			role: "user",
			content: folderContentText,
		},
	];

	let firstDelta = true;
	try {
		await streamResponse(
			settings.apiKey,
			messages,
			{
				model: settings.apiModel,
				max_tokens: settings.maxResponseTokens || undefined,
			},
			(chunk: string | null, error?: Error) => {
				// Handle errors
				if (error) {
					throw error;
				}

				// * Last call (stream completed)
				if (!chunk) {
					return;
				}

				let newText;
				if (firstDelta) {
					newText = chunk;
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
					});
					if (height > created.height) {
						created.moveAndResize({
							height: created.height + NOTE_INCR_HEIGHT_STEP,
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
		new Notice(`Error calling DeepSeek AI: ${errorMessage}`);
		canvas.removeNode(created);
		return;
	}

	canvas.requestSave();
};
