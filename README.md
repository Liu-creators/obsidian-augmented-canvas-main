# Obsidian Augmented Canvas (增强型画布)

一款为 [Obsidian](https://obsidian.md) 设计的插件，通过 AI 功能“增强” Obsidian Canvas (画布) 的使用体验。

本插件需要 DeepSeek API Key 才能使用，您可以在设置中进行配置。插件支持 DeepSeek 模型：`deepseek-chat` (默认) 和 `deepseek-coder`。

**注意：** 本插件已修改为使用 DeepSeek API 而非 OpenAI。由于 DeepSeek 目前不支持图像生成，因此图像生成功能不可用。

## 核心功能

该插件在画布视图（Canvas View）的卡片菜单中增加了三个操作：

1. **AI 问答（针对特定卡片）**：将该卡片的内容作为提示词（Prompt）发送给 AI。卡片可以是文本卡片、Markdown 文件或 PDF 文件。AI 的回复将作为一个新卡片创建在原卡片下方。

![Augmented-Canvas-AskAI](./assets/AugmentedCanvas-AskAI.gif)

2. **针对卡片提问**：AI 会根据问题生成一个新卡片，并将问题显示在连接两个卡片的连线上。

![Augmented-Canvas-AskquestionswithAI](./assets/AugmentedCanvas-AskquestionwithAI.gif)

3. **AI 生成相关问题**：针对特定卡片内容自动生成相关问题，帮助您进一步深入探索该主题。

![Augmented-Canvas-AIgeneratedquestions](./assets/AugmentedCanvas-AIgeneratedquestions.gif)

卡片之间的连接关系会被用来构建发送给 DeepSeek AI 的对话历史。

## 附加功能

-   ~~**生成图像**~~：(由于 DeepSeek API 不支持图像生成，该功能目前不可用)

-   **对文件夹运行系统提示词**：读取指定文件夹及其子文件夹中的所有 md 和 canvas 文件，并将 AI 的响应插入当前画布。

-   **插入系统提示词**：从 [f/awesome-chatgpt-prompts](https://github.com/f/awesome-chatgpt-prompts) 获取并插入预设的系统提示词，您也可以在设置中添加自定义提示词。

![Augmented-Canvas-Insertsystemprompt](./assets/AugmentedCanvas-Insertsystemprompt.gif)

-   **生成闪卡（Flashcards）**：右键点击卡片即可创建闪卡，可配合 [Spaced Repetition 插件](https://github.com/st3v3nmw/obsidian-spaced-repetition) 进行复习。AI 生成的内容将保存在设置指定的文件夹中。请确保在 Spaced Repetition 插件设置中开启了“将文件夹转换为卡组（Convert folders to decks and subdecks?）”选项。

![Augmented-Canvas-Createflashcards](./assets/AugmentedCanvas-Createflashcards.gif)

-   **插入相关问题**：基于您最近修改的 X 个文件（数量可在设置中调整），AI 会分析您的历史活动并生成相关问题插入画布。

-   **重新生成回复**：在连线（Edge）的右键菜单中增加了一个操作，用于重新生成 AI 的回复。

## 隐私说明

发送给 DeepSeek AI 的具体内容可以通过开启“Debug output”设置在控制台中查看。

## API Key 获取

访问 [DeepSeek 开放平台](https://platform.deepseek.com) 注册账号并获取 API Key。

## 安装方法

-   **暂未在官方插件市场上架**
-   **通过 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件安装**
    可以参考这篇指南：[Installing the BRAT plugin in Obsidian](https://ricraftis.au/obsidian/installing-the-brat-plugin-in-obsidian-a-step-by-step-guide/)
-   **手动安装**

1. 访问本项目的 Release 页面。
2. 下载最新的 Release 压缩包。
3. 解压后将文件夹复制到 Obsidian 的插件目录中（确保文件夹内包含 `main.js` 和 `manifest.json`）。
4. 重启 Obsidian 或刷新插件列表，在设置中启用该插件。
5. 完成！

## 致谢

-   [rpggio/obsidian-chat-stream: Obsidian canvas plugin for using AI completion with threads of canvas nodes](https://github.com/rpggio/obsidian-chat-stream)
-   [Quorafind/Obsidian-Collapse-Node: A node collapsing plugin for Canvas in Obsidian.](https://github.com/quorafind/obsidian-collapse-node)

## 支持

如果您觉得这个插件对您有帮助，可以通过 [Buy me a coffee](https://www.buymeacoffee.com/metacorp) 支持我的开发工作。

<a href="https://www.buymeacoffee.com/metacorp"><img src="https://img.buymeacoffee.com/button-api/?text=请我喝杯咖啡&emoji=&slug=boninall&button_colour=6495ED&font_colour=ffffff&font_family=Lato&outline_colour=000000&coffee_colour=FFDD00"></a>
