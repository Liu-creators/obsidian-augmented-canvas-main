import {
	Canvas,
	CanvasView,
	ItemView,
	Menu,
	MenuItem,
	Notice,
	Plugin,
	TFolder,
	setIcon,
	setTooltip,
} from "obsidian";
import {
	AugmentedCanvasSettings,
	DEFAULT_SETTINGS,
	SystemPrompt,
} from "./settings/AugmentedCanvasSettings";
import SettingsTab from "./settings/SettingsTab";
import SystemPromptsModal from "./modals/SystemPromptsModal";
import { createFlashcards } from "./actions/contextMenu/flashcards";
import { parseCsv } from "./utils/csvUtils";
import { handleAddRelevantQuestions } from "./actions/commands/relevantQuestions";
import { initLogDebug } from "./logDebug";
import FolderSuggestModal from "./modals/FolderSuggestModal";
import { insertSystemPrompt } from "./actions/commands/insertSystemPrompt";
import { runPromptFolder } from "./actions/commands/runPromptFolder";
import { getActiveCanvas } from "./utils";
import { createCanvasMenuPatch } from "./actions/menuPatches/canvasMenuPatch";

// @ts-expect-error - CSV text import
import promptsCsvText from "./data/prompts.csv.txt";

export default class AugmentedCanvasPlugin extends Plugin {
	triggerByPlugin: boolean = false;
	patchSucceed: boolean = false;

	settings: AugmentedCanvasSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			initLogDebug(this.settings);

			this.patchCanvasMenu();
			this.addCommands();
			this.patchNoteContextMenu();

			if (this.settings.systemPrompts.length === 0) {
				this.fetchSystemPrompts();
			}
		});
	}

	onunload() {
		// Plugin cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	/**
	 * Patch the canvas menu to add AI-related buttons
	 */
	patchCanvasMenu() {
		const patchMenu = createCanvasMenuPatch(
			this.app,
			this.settings,
			(uninstaller) => this.register(uninstaller)
		);

		this.app.workspace.onLayoutReady(() => {
			if (!patchMenu()) {
				const evt = this.app.workspace.on("layout-change", () => {
					patchMenu() && this.app.workspace.offref(evt);
				});
				this.registerEvent(evt);
			}
		});
	}

	/**
	 * Fetch system prompts from bundled CSV
	 */
	async fetchSystemPrompts() {
		const parsedCsv = parseCsv(promptsCsvText);

		const systemPrompts: SystemPrompt[] = parsedCsv
			.slice(1)
			.map((value: string[], index: number) => ({
				id: index,
				act: value[0],
				prompt: value[1],
			}));

		this.settings.systemPrompts = systemPrompts;

		this.saveSettings();
	}

	/**
	 * Add flashcards menu item to canvas node context menu
	 */
	patchNoteContextMenu() {
		const settings = this.settings;
		// * no event name to add to Canvas context menu ("canvas-menu" does not exist)
		this.registerEvent(
			this.app.workspace.on("canvas:node-menu", (menu) => {
				menu.addSeparator();
				menu.addItem((item) => {
					item.setTitle("Create flashcards")
						.setIcon("lucide-wallet-cards")
						.onClick(() => {
							createFlashcards(this.app, settings);
						});
				});
			})
		);
	}

	/**
	 * Register plugin commands
	 */
	addCommands() {
		const app = this.app;

		this.addCommand({
			id: "run-prompt-folder",
			name: "Run a system prompt on a folder",
			checkCallback: (checking: boolean) => {
				if (checking) {
					if (!getActiveCanvas(app)) return false;
					return true;
				}

				new SystemPromptsModal(
					app,
					this.settings,
					(systemPrompt: SystemPrompt) => {
						new Notice(
							`Selected system prompt ${systemPrompt.act}`
						);

						new FolderSuggestModal(app, (folder: TFolder) => {
							runPromptFolder(
								app,
								this.settings,
								systemPrompt,
								folder
							);
						}).open();
					}
				).open();
			},
		});

		this.addCommand({
			id: "insert-system-prompt",
			name: "Insert system prompt",
			checkCallback: (checking: boolean) => {
				if (checking) {
					if (!getActiveCanvas(app)) return false;
					return true;
				}

				new SystemPromptsModal(
					app,
					this.settings,
					(systemPrompt: SystemPrompt) =>
						insertSystemPrompt(app, systemPrompt)
				).open();
			},
		});

		this.addCommand({
			id: "insert-relevant-questions",
			name: "Insert relevant questions",
			checkCallback: (checking: boolean) => {
				if (checking) {
					if (!getActiveCanvas(app)) return false;
					return true;
				}

				handleAddRelevantQuestions(app, this.settings);
			},
		});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
