import { App, ItemView, Notice, setIcon, setTooltip } from "obsidian";
import { around } from "monkey-around";
import { CanvasView } from "../../obsidian/canvas-patches";
import { CanvasNode } from "../../obsidian/canvas-internal";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { addAskAIButton } from "../canvas/askAI";
import { addRegenerateResponse } from "../canvas/regenerateResponse";
import { handleCallGPT_Question } from "../canvas/askQuestion";
import { CustomQuestionModal } from "../../Modals/CustomQuestionModal";
import { handlePatchNoteMenu } from "../menuPatches/noteMenuPatch";

/**
 * Check if already patched to avoid duplicate menu items
 */
const isAlreadyPatched = (menuEl: HTMLElement): boolean => {
	return !!menuEl.querySelector(".gpt-menu-item");
};

/**
 * Check if selected node is an edge (connection)
 */
const isEdge = (selectedNode: any): boolean => {
	return !!selectedNode.from;
};

/**
 * Add edge menu items (for generated connections)
 */
const addEdgeMenuItems = (
	app: App,
	settings: AugmentedCanvasSettings,
	menuEl: HTMLElement,
	selectedNode: any
) => {
	if (!selectedNode.unknownData.isGenerated) return;
	addRegenerateResponse(app, settings, menuEl);
};

/**
 * Add node menu items (Ask AI, Ask Question, AI Questions)
 */
const addNodeMenuItems = (
	app: App,
	settings: AugmentedCanvasSettings,
	menuEl: HTMLElement,
	canvas: any
) => {
	// Add "Ask AI" button
	addAskAIButton(app, settings, menuEl);

	// Add "Ask question with AI" button
	const buttonEl_AskQuestion = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl_AskQuestion, "Ask question with AI", { placement: "top" });
	setIcon(buttonEl_AskQuestion, "lucide-help-circle");
	menuEl.appendChild(buttonEl_AskQuestion);
	buttonEl_AskQuestion.addEventListener("click", () => {
		console.log("Ask question with AI button clicked");
		let modal = new CustomQuestionModal(
			app,
			(question2: string) => {
				console.log("Modal callback received question:", question2);
				handleCallGPT_Question(
					app,
					settings,
					<CanvasNode>Array.from(canvas.selection)?.first()!,
					question2
				);
			}
		);
		console.log("Opening modal...");
		modal.open();
	});

	// Add "AI generated questions" button
	const buttonEl_AIQuestions = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl_AIQuestions, "AI generated questions", { placement: "top" });
	setIcon(buttonEl_AIQuestions, "lucide-file-question");
	menuEl.appendChild(buttonEl_AIQuestions);
	buttonEl_AIQuestions.addEventListener("click", () =>
		handlePatchNoteMenu(buttonEl_AIQuestions, menuEl, {
			app,
			settings,
			canvas: canvas,
		})
	);
};

/**
 * Patch the canvas menu render method
 */
export const createCanvasMenuPatch = (
	app: App,
	settings: AugmentedCanvasSettings,
	uninstallCallback: (uninstaller: () => void) => void
) => {
	return () => {
		const canvasView = app.workspace
			.getLeavesOfType("canvas")
			.first()?.view;
		if (!canvasView) return false;

		const menu = (canvasView as CanvasView)?.canvas?.menu;
		if (!menu) return false;

		const selection = menu.selection;
		if (!selection) return false;

		const menuUninstaller = around(menu.constructor.prototype, {
			render: (next: any) =>
				function (...args: any) {
					const result = next.call(this, ...args);

					const maybeCanvasView = app.workspace.getActiveViewOfType(ItemView) as CanvasView | null;
					if (!maybeCanvasView || maybeCanvasView.canvas?.selection?.size !== 1) {
						return result;
					}

					if (isAlreadyPatched(this.menuEl)) {
						return result;
					}

					const selectedNode = Array.from(maybeCanvasView.canvas?.selection)[0];

					if (isEdge(selectedNode)) {
						addEdgeMenuItems(app, settings, this.menuEl, selectedNode);
					} else {
						addNodeMenuItems(app, settings, this.menuEl, this.canvas);
					}

					return result;
				},
		});

		uninstallCallback(menuUninstaller);
		app.workspace.trigger("collapse-node:patched-canvas");

		return true;
	};
};

