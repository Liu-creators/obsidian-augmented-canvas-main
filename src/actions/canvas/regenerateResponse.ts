import { App, setIcon, setTooltip } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { getActiveCanvasNodes } from "../../utils";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";

const handleRegenerateResponse = async (
	app: App,
	settings: AugmentedCanvasSettings
) => {
	const activeNode = getActiveCanvasNodes(app)![0];

	// Extract edge label from the edge object (Requirements 5.1, 5.2)
	// @ts-expect-error - Edge properties
	const edgeLabel: string | undefined = activeNode.label;

	const { generateNote } = noteGenerator(
		app,
		settings,
		// @ts-expect-error - Edge properties
		activeNode.from.node,
		// @ts-expect-error - Edge properties
		activeNode.to.node
	);

	// Pass edge label to generateNote (Requirements 5.1, 5.2)
	await generateNote(undefined, edgeLabel);
};

export const addRegenerateResponse = async (
	app: App,
	settings: AugmentedCanvasSettings,
	menuEl: HTMLElement
) => {
	const buttonEl_AskAI = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl_AskAI, "重新生成回复", {
		placement: "top",
	});
	setIcon(buttonEl_AskAI, "lucide-rotate-cw");
	menuEl.appendChild(buttonEl_AskAI);

	buttonEl_AskAI.addEventListener("click", () =>
		handleRegenerateResponse(app, settings)
	);
};

