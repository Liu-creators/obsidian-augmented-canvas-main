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
import { addGenerateGroupButton } from "../canvas/generateGroup";
import { smartConnectNodes } from "../canvas/smartConnect";
import { smartGroupExistingNodes } from "../canvas/smartGrouping";

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
 * Add node menu items (Ask AI, Ask Question, Generate Group, AI Questions)
 * For single node selection
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
	setTooltip(buttonEl_AskQuestion, "针对卡片提问", { placement: "top" });
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

	// Add "Generate Group with AI" button
	addGenerateGroupButton(app, settings, menuEl);

	// Add "AI generated questions" button
	const buttonEl_AIQuestions = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl_AIQuestions, "AI 生成相关问题", { placement: "top" });
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
 * Add multi-node menu items (Smart Connect, Smart Grouping)
 * For multiple node selection (2+)
 */
const addMultiNodeMenuItems = (
	app: App,
	settings: AugmentedCanvasSettings,
	menuEl: HTMLElement,
	selectedNodes: CanvasNode[]
) => {
	// Add "Smart Connect" button
	const buttonEl_SmartConnect = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl_SmartConnect, "智能连线 - AI 创建连接", { placement: "top" });
	setIcon(buttonEl_SmartConnect, "lucide-git-branch");
	menuEl.appendChild(buttonEl_SmartConnect);
	buttonEl_SmartConnect.addEventListener("click", () => {
		let modal = new CustomQuestionModal(
			app,
			async (instruction: string) => {
				await smartConnectNodes(app, settings, selectedNodes, instruction);
			}
		);
		modal.setPlaceholder("例如：'按因果关系连接' 或 '按时间顺序连线'");
		modal.open();
	});

	// Add "Smart Grouping" button
	const buttonEl_SmartGroup = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl_SmartGroup, "智能分组 - AI 组织成组", { placement: "top" });
	setIcon(buttonEl_SmartGroup, "lucide-group");
	menuEl.appendChild(buttonEl_SmartGroup);
	buttonEl_SmartGroup.addEventListener("click", () => {
		let modal = new CustomQuestionModal(
			app,
			async (instruction: string) => {
				await smartGroupExistingNodes(app, settings, selectedNodes, instruction);
			}
		);
		modal.setPlaceholder("例如：'按技术栈分组' 或 '按优先级分类'");
		modal.open();
	});
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
					const selectionSize = maybeCanvasView?.canvas?.selection?.size || 0;
					
					if (!maybeCanvasView || selectionSize === 0) {
						return result;
					}

					if (isAlreadyPatched(this.menuEl)) {
						return result;
					}

					const selectedItems = Array.from(maybeCanvasView.canvas?.selection);

					// Handle single selection
					if (selectionSize === 1) {
						const selectedNode = selectedItems[0];

						if (isEdge(selectedNode)) {
							addEdgeMenuItems(app, settings, this.menuEl, selectedNode);
						} else {
							addNodeMenuItems(app, settings, this.menuEl, this.canvas);
						}
					}
					// Handle multiple node selection
					else if (selectionSize >= 2) {
						// Filter out edges, only keep nodes
						const selectedNodes = selectedItems.filter(item => !isEdge(item)) as CanvasNode[];
						
						if (selectedNodes.length >= 2) {
							addMultiNodeMenuItems(app, settings, this.menuEl, selectedNodes);
						}
					}

					return result;
				},
		});

		uninstallCallback(menuUninstaller);
		app.workspace.trigger("collapse-node:patched-canvas");

		return true;
	};
};

