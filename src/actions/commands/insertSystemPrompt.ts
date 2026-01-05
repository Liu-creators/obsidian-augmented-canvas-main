import { App, Notice } from "obsidian";
import { calcHeight, createNode } from "src/obsidian/canvas-patches";
import { SystemPrompt } from "src/settings/AugmentedCanvasSettings";
import { getActiveCanvas } from "src/utils";

export const insertSystemPrompt = (app: App, systemPrompt: SystemPrompt) => {
	new Notice(`已选择: ${systemPrompt.act}`);

	const canvas = getActiveCanvas(app);
	if (!canvas) return;

	const text = `
系统提示词

${systemPrompt.prompt.trim()}
`.trim();

	const NODE_WIDTH = 800;
	const NODE_HEIGHT = 300;
	const newNode = createNode(canvas, {
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
};
