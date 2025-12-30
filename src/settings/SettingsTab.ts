import {
	App,
	ButtonComponent,
	Notice,
	PluginSettingTab,
	Setting,
	TextAreaComponent,
	TextComponent,
} from "obsidian";
import AugmentedCanvasPlugin from "./../AugmentedCanvasPlugin";
import {
	SystemPrompt,
	getImageModels,
	getModels,
} from "./AugmentedCanvasSettings";
import { initLogDebug } from "src/logDebug";
import { getResponse } from "src/utils/chatgpt";

export class SettingsTab extends PluginSettingTab {
	plugin: AugmentedCanvasPlugin;

	constructor(app: App, plugin: AugmentedCanvasPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("模型")
			.setDesc("选择要使用的 DeepSeek 模型。")
			.addDropdown((cb) => {
				getModels().forEach((model) => {
					cb.addOption(model, model);
				});
				cb.setValue(this.plugin.settings.apiModel);
				cb.onChange(async (value) => {
					this.plugin.settings.apiModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("图像模型")
			.setDesc("注意：DeepSeek API 不支持图像生成。此设置仅用于保持兼容性。如果使用 DeepSeek 进行图像生成，将会报错。如需使用图像生成功能，请切换到支持该功能的提供商（如 OpenAI）。")
			.addDropdown((cb) => {
				getImageModels().forEach((model) => {
					cb.addOption(model, model);
				});
				cb.setValue(this.plugin.settings.imageModel);
				cb.onChange(async (value) => {
					this.plugin.settings.imageModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("API 密钥")
			.setDesc(
				"请求时使用的 API 密钥 - 从 DeepSeek 获取 (https://platform.deepseek.com)"
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("API 密钥")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("测试 DeepSeek API 密钥")
			.setDesc(
				"向 DeepSeek 发送一个简单的测试请求，以验证您的 API 密钥和网络连接是否正常。"
			)
			.addButton((button) => {
				button.setButtonText("测试").onClick(async () => {
					const apiKey = this.plugin.settings.apiKey;
					const model = this.plugin.settings.apiModel;

					if (!apiKey) {
						new Notice(
							"请在测试前设置您的 DeepSeek API 密钥。"
						);
						return;
					}

					new Notice("正在测试 DeepSeek API 密钥...");

					try {
						await getResponse(
							apiKey,
							[
								{
									role: "user",
									content:
										"请回复一条短消息：DeepSeek 测试成功。",
								},
							],
							{
								model,
								max_tokens: 16,
								temperature: 0,
							}
						);

						new Notice("DeepSeek API 密钥测试成功 ✅");
					} catch (error: any) {
						console.error("DeepSeek test error:", error);
						const message =
							error?.message || error?.toString() || "未知错误";
						new Notice(
							`DeepSeek API 密钥测试失败：${message}`
						);
					}
				});
			});

		new Setting(containerEl)
			.setName("YouTube API 密钥")
			.setDesc("用于获取字幕的 YouTube API 密钥")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("API 密钥")
					.setValue(this.plugin.settings.youtubeApiKey)
					.onChange(async (value) => {
						this.plugin.settings.youtubeApiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("默认系统提示词 (System Prompt)")
			.setDesc(
				`每次向 API 发送请求时附带的系统提示词。\n（注意：您可以通过在笔记流开头添加一个以 'SYSTEM PROMPT' 开头的笔记来覆盖此设置。该笔记的剩余内容将作为系统提示词。）`
			)
			.addTextArea((component) => {
				component.inputEl.rows = 6;
				// component.inputEl.style.width = "300px";
				// component.inputEl.style.fontSize = "10px";
				component.inputEl.addClass("augmented-canvas-settings-prompt");
				component.setValue(this.plugin.settings.systemPrompt);
				component.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				});
			});

		this.displaySystemPromptsSettings(containerEl);

		new Setting(containerEl)
			.setName("闪卡系统提示词")
			.setDesc(`用于生成闪卡文件的系统提示词。`)
			.addTextArea((component) => {
				component.inputEl.rows = 6;
				// component.inputEl.style.width = "300px";
				// component.inputEl.style.fontSize = "10px";
				component.inputEl.addClass("augmented-canvas-settings-prompt");
				component.setValue(this.plugin.settings.flashcardsSystemPrompt);
				component.onChange(async (value) => {
					this.plugin.settings.flashcardsSystemPrompt = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("相关问题系统提示词")
			.setDesc(
				`用于“插入相关问题”命令生成相关问题的系统提示词。`
			)
			.addTextArea((component) => {
				component.inputEl.rows = 6;
				// component.inputEl.style.width = "300px";
				// component.inputEl.style.fontSize = "10px";
				component.inputEl.addClass("augmented-canvas-settings-prompt");
				component.setValue(
					this.plugin.settings.relevantQuestionsSystemPrompt
				);
				component.onChange(async (value) => {
					this.plugin.settings.relevantQuestionsSystemPrompt = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("插入相关问题时参考的文件数量")
			.setDesc(
				'“插入相关问题”命令在生成时考虑的文件数量。必须是正整数。'
			)
			.addText((text) =>
				text
					.setValue(
						this.plugin.settings.insertRelevantQuestionsFilesCount.toString()
					)
					.onChange(async (value) => {
						const parsed = parseInt(value);
						if (isNaN(parsed) || parsed < 1) {
							new Notice("请输入一个正整数（1 或更大）");
							return;
						}
						this.plugin.settings.insertRelevantQuestionsFilesCount = parsed;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("最大输入 Token 数")
			.setDesc(
				"发送的最大 Token 数量（在模型限制内）。0 表示尽可能多。必须是非负整数。"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.maxInputTokens.toString())
					.onChange(async (value) => {
						const parsed = parseInt(value);
						if (isNaN(parsed) || parsed < 0) {
							new Notice("请输入一个非负整数（0 或更大）");
							return;
						}
						this.plugin.settings.maxInputTokens = parsed;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("最大响应 Token 数")
			.setDesc(
				"API 返回的最大 Token 数量。0 表示不限制。（1 个 Token 约为 4 个字符）。必须是非负整数。"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.maxResponseTokens.toString())
					.onChange(async (value) => {
						const parsed = parseInt(value);
						if (isNaN(parsed) || parsed < 0) {
							new Notice("请输入一个非负整数（0 或更大）");
							return;
						}
						this.plugin.settings.maxResponseTokens = parsed;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("最大深度")
			.setDesc(
				"包含祖先笔记的最大深度。0 表示不限制。必须是非负整数。"
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.maxDepth.toString())
					.onChange(async (value) => {
						const parsed = parseInt(value);
						if (isNaN(parsed) || parsed < 0) {
							new Notice("请输入一个非负整数（0 或更大）");
							return;
						}
						this.plugin.settings.maxDepth = parsed;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("温度 (Temperature)")
			.setDesc("采样温度 (0-2)。0 表示没有随机性。")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.temperature.toString())
					.onChange(async (value) => {
						const parsed = parseFloat(value);
						if (!isNaN(parsed) && parsed >= 0 && parsed <= 2) {
							this.plugin.settings.temperature = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		// new Setting(containerEl)
		// 	.setName("API URL")
		// 	.setDesc(
		// 		"The chat completions URL to use. You probably won't need to change this."
		// 	)
		// 	.addText((text) => {
		// 		text.inputEl.style.width = "300px";
		// 		text.setPlaceholder("API URL")
		// 			.setValue(this.plugin.settings.apiUrl)
		// 			.onChange(async (value) => {
		// 				this.plugin.settings.apiUrl = value;
		// 				await this.plugin.saveSettings();
		// 			});
		// 	});

		new Setting(containerEl)
			.setName("调试输出")
			.setDesc("在控制台中启用调试输出")
			.addToggle((component) => {
				component
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
						initLogDebug(this.plugin.settings);
					});
			});
	}

	displaySystemPromptsSettings(containerEl: HTMLElement): void {
		const setting = new Setting(containerEl);

		setting
			.setName("添加系统提示词")
			.setClass("augmented-canvas-setting-item")
			.setDesc(
				`创建自定义系统提示词，以便在执行“插入系统提示词”或“在文件夹上运行系统提示词”等命令时快速选择。在下方提供名称和提示词内容。`
			);

		const nameInput = new TextComponent(setting.controlEl);
		nameInput.setPlaceholder("名称");
		// colorInput.inputEl.addClass("highlighter-settings-color");

		let promptInput: TextAreaComponent;
		setting.addTextArea((component) => {
			component.inputEl.rows = 6;
			// component.inputEl.style.width = "300px";
			// component.inputEl.style.fontSize = "10px";
			component.setPlaceholder("提示词");
			component.inputEl.addClass("augmented-canvas-settings-prompt");
			promptInput = component;
		});

		setting.addButton((button) => {
			button
				.setIcon("lucide-plus")
				.setTooltip("添加")
				.onClick(async (buttonEl: any) => {
					let name = nameInput.inputEl.value;
					const prompt = promptInput.inputEl.value;

					// console.log({ name, prompt });

					if (!name || !prompt) {
						name && !prompt
							? new Notice("缺少提示词")
							: !name && prompt
							? new Notice("缺少名称")
							: new Notice("缺少内容"); // else
						return;
					}

					// * Handles multiple with the same name
					// if (
					// 	this.plugin.settings.systemPrompts.filter(
					// 		(systemPrompt: SystemPrompt) =>
					// 			systemPrompt.act === name
					// 	).length
					// ) {
					// 	name += " 2";
					// }
					// let count = 3;
					// while (
					// 	this.plugin.settings.systemPrompts.filter(
					// 		(systemPrompt: SystemPrompt) =>
					// 			systemPrompt.act === name
					// 	).length
					// ) {
					// 	name = name.slice(0, -2) + " " + count;
					// 	count++;
					// }

					if (
						!this.plugin.settings.systemPrompts.filter(
							(systemPrompt: SystemPrompt) =>
								systemPrompt.act === name
						).length &&
						!this.plugin.settings.userSystemPrompts.filter(
							(systemPrompt: SystemPrompt) =>
								systemPrompt.act === name
						).length
					) {
						this.plugin.settings.userSystemPrompts.push({
							id:
								this.plugin.settings.systemPrompts.length +
								this.plugin.settings.userSystemPrompts.length,
							act: name,
							prompt,
						});
						await this.plugin.saveSettings();
						this.display();
					} else {
						buttonEl.stopImmediatePropagation();
						new Notice("该系统提示词名称已存在");
					}
				});
		});

		const listContainer = containerEl.createEl("div", {
			cls: "augmented-canvas-list-container",
		});

		this.plugin.settings.userSystemPrompts.forEach(
			(systemPrompt: SystemPrompt) => {
				const listElement = listContainer.createEl("div", {
					cls: "augmented-canvas-list-element",
				});

				const nameInput = new TextComponent(listElement);
				nameInput.setValue(systemPrompt.act);

				const promptInput = new TextAreaComponent(listElement);
				promptInput.inputEl.addClass(
					"augmented-canvas-settings-prompt"
				);
				promptInput.setValue(systemPrompt.prompt);

				const buttonSave = new ButtonComponent(listElement);
				buttonSave
					.setIcon("lucide-save")
					.setTooltip("保存")
					.onClick(async (buttonEl: any) => {
						let name = nameInput.inputEl.value;
						const prompt = promptInput.inputEl.value;

						// console.log({ name, prompt });
						this.plugin.settings.userSystemPrompts =
							this.plugin.settings.userSystemPrompts.map(
								(systemPrompt2: SystemPrompt) =>
									systemPrompt2.id === systemPrompt.id
										? {
												...systemPrompt2,
												act: name,
												prompt,
										  }
										: systemPrompt2
							);
						await this.plugin.saveSettings();
						this.display();
						new Notice("系统提示词已更新");
					});

				const buttonDelete = new ButtonComponent(listElement);
				buttonDelete
					.setIcon("lucide-trash")
					.setTooltip("删除")
					.onClick(async (buttonEl: any) => {
						let name = nameInput.inputEl.value;
						const prompt = promptInput.inputEl.value;

						// console.log({ name, prompt });
						this.plugin.settings.userSystemPrompts =
							this.plugin.settings.userSystemPrompts.filter(
								(systemPrompt2: SystemPrompt) =>
									systemPrompt2.id !== systemPrompt.id
							);
						await this.plugin.saveSettings();
						this.display();
						new Notice("系统提示词已删除");
					});
			}
		);
	}
}

export default SettingsTab;
