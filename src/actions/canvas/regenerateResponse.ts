import { App, setIcon, setTooltip } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { getActiveCanvasNodes } from "../../utils";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";

const handleRegenerateResponse = async (
	app: App,
	settings: AugmentedCanvasSettings
) => {
	const activeNode = getActiveCanvasNodes(app)![0];

	const { generateNote } = noteGenerator(
		app,
		settings,
		// @ts-expect-error - Edge properties
		activeNode.from.node,
		// @ts-expect-error - Edge properties
		activeNode.to.node
	);

	await generateNote();
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

