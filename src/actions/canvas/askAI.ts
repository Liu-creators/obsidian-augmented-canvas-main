import { App, Notice, setIcon, setTooltip } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";

export const addAskAIButton = async (
	app: App,
	settings: AugmentedCanvasSettings,
	menuEl: HTMLElement
) => {
	const buttonEl_AskAI = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl_AskAI, "AI 问答", {
		placement: "top",
	});
	setIcon(buttonEl_AskAI, "lucide-sparkles");
	menuEl.appendChild(buttonEl_AskAI);

	buttonEl_AskAI.addEventListener("click", async (e) => {
		e.stopPropagation();
		try {
			const { generateNote } = noteGenerator(app, settings);
			await generateNote();
		} catch (error) {
			console.error("Error in Ask AI:", error);
			new Notice(`Error: ${error?.message || error}`);
		}
	});
};

