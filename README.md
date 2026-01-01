# Obsidian Augmented Canvas | Obsidian 增强型画布

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.16-green.svg)](manifest.json)

[English](#english) | [中文](#chinese)

---

<a id="english"></a>

## English

An [Obsidian](https://obsidian.md) plugin that enhances Canvas with AI-powered features using DeepSeek.

### ✨ Features

#### Core Canvas AI Features

1. **Ask AI (for specific cards)**: Send the content of a card (text, Markdown file, or PDF) as a prompt to AI. The AI's response will be created as a new card below the original card.

   ![Ask AI](./assets/AugmentedCanvas-AskAI.gif)

2. **Ask Question with AI**: The AI will generate a new card with the answer, displaying the question on the connection line between the two cards.

   ![Ask Questions with AI](./assets/AugmentedCanvas-AskquestionwithAI.gif)

3. **AI Generated Questions**: Automatically generates relevant questions about specific card content to help you explore topics further.

   ![AI Generated Questions](./assets/AugmentedCanvas-AIgeneratedquestions.gif)

Connection relationships between cards are used to build conversation history sent to DeepSeek AI.

#### Additional Features

- **Create Flashcards**: Right-click on a card to create flashcards. Works great with the [Spaced Repetition plugin](https://github.com/st3v3nmw/obsidian-spaced-repetition). AI-generated content is saved in a folder specified in settings. Make sure to enable "Convert folders to decks and subdecks?" in the Spaced Repetition plugin settings.

  ![Create Flashcards](./assets/AugmentedCanvas-Createflashcards.gif)

- **Run System Prompt on Folder**: Read all md and canvas files in a specified folder and its subfolders, then insert AI responses into the current canvas.

- **Insert System Prompt**: Fetch and insert preset system prompts from [f/awesome-chatgpt-prompts](https://github.com/f/awesome-chatgpt-prompts), or add custom prompts in settings.

  ![Insert System Prompt](./assets/AugmentedCanvas-Insertsystemprompt.gif)

- **Insert Relevant Questions**: Based on your recently modified X files (configurable in settings), AI analyzes your history and generates relevant questions to insert into the canvas.

- **Regenerate Response**: Right-click on an edge (connection line) to regenerate the AI's response.

### 🚀 Installation

#### Not Yet Available in Official Plugin Market

#### Install via BRAT

You can install this plugin using [BRAT](https://github.com/TfTHacker/obsidian42-brat). See this guide: [Installing the BRAT plugin in Obsidian](https://ricraftis.au/obsidian/installing-the-brat-plugin-in-obsidian-a-step-by-step-guide/)

#### Manual Installation

1. Visit the Release page of this repository.
2. Download the latest release archive.
3. Extract and copy the folder to your Obsidian plugins directory (ensure the folder contains `main.js` and `manifest.json`).
4. Restart Obsidian or refresh the plugins list, then enable the plugin in settings.
5. Done!

### ⚙️ Configuration

1. Get your DeepSeek API Key from [DeepSeek Platform](https://platform.deepseek.com)
2. Open Obsidian Settings → Augmented Canvas
3. Enter your API key
4. Choose your preferred model (`deepseek-chat` or `deepseek-coder`)
5. Adjust temperature, token limits, and other parameters as needed

### 💡 Usage

#### Basic Workflow

1. Create a canvas in Obsidian
2. Add text cards, notes, or files
3. Right-click on a card to access AI features
4. Use the command palette for additional commands like "Insert System Prompt"

#### Privacy

You can view exactly what is sent to DeepSeek AI by enabling "Debug output" in settings and checking the console.

### 🛠️ Development

#### Prerequisites

- Node.js (v18 or higher)
- npm

#### Build from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/obsidian-augmented-canvas.git
cd obsidian-augmented-canvas

# Install dependencies
npm install

# Development mode (with hot reload)
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Auto-fix lint issues
npm run lint:fix
```

#### Project Structure

```
src/
├── actions/          # Action handlers
│   ├── canvas/       # Canvas-specific actions (Ask AI, regenerate)
│   ├── commands/     # Command palette commands
│   ├── contextMenu/  # Context menu actions (flashcards)
│   └── menuPatches/  # Menu patching logic
├── modals/           # UI modals
├── obsidian/         # Obsidian API extensions
├── settings/         # Plugin settings
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

### ⚠️ Important Notes

- This plugin uses DeepSeek API instead of OpenAI
- **Image generation is not available** (DeepSeek does not support this feature)
- API calls may incur costs based on your DeepSeek usage plan

### 🙏 Acknowledgments

- [rpggio/obsidian-chat-stream](https://github.com/rpggio/obsidian-chat-stream)
- [Quorafind/Obsidian-Collapse-Node](https://github.com/quorafind/obsidian-collapse-node)

### 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

### 💖 Support

If you find this plugin helpful, consider supporting the development:

<a href="https://www.buymeacoffee.com/metacorp"><img src="https://img.buymeacoffee.com/button-api/?text=Buy me a coffee&emoji=&slug=boninall&button_colour=6495ED&font_colour=ffffff&font_family=Lato&outline_colour=000000&coffee_colour=FFDD00"></a>

---

<a id="chinese"></a>

## 中文

一款为 [Obsidian](https://obsidian.md) 设计的插件，通过 DeepSeek AI 功能"增强" Obsidian Canvas (画布) 的使用体验。

### ✨ 功能特性

#### 核心画布 AI 功能

1. **AI 问答（针对特定卡片）**：将该卡片的内容作为提示词（Prompt）发送给 AI。卡片可以是文本卡片、Markdown 文件或 PDF 文件。AI 的回复将作为一个新卡片创建在原卡片下方。

   ![Augmented-Canvas-AskAI](./assets/AugmentedCanvas-AskAI.gif)

2. **针对卡片提问**：AI 会根据问题生成一个新卡片，并将问题显示在连接两个卡片的连线上。

   ![Augmented-Canvas-AskquestionswithAI](./assets/AugmentedCanvas-AskquestionwithAI.gif)

3. **AI 生成相关问题**：针对特定卡片内容自动生成相关问题，帮助您进一步深入探索该主题。

   ![Augmented-Canvas-AIgeneratedquestions](./assets/AugmentedCanvas-AIgeneratedquestions.gif)

卡片之间的连接关系会被用来构建发送给 DeepSeek AI 的对话历史。

#### 附加功能

- **生成闪卡（Flashcards）**：右键点击卡片即可创建闪卡，可配合 [Spaced Repetition 插件](https://github.com/st3v3nmw/obsidian-spaced-repetition) 进行复习。AI 生成的内容将保存在设置指定的文件夹中。请确保在 Spaced Repetition 插件设置中开启了"将文件夹转换为卡组（Convert folders to decks and subdecks?）"选项。

  ![Augmented-Canvas-Createflashcards](./assets/AugmentedCanvas-Createflashcards.gif)

- **对文件夹运行系统提示词**：读取指定文件夹及其子文件夹中的所有 md 和 canvas 文件，并将 AI 的响应插入当前画布。

- **插入系统提示词**：从 [f/awesome-chatgpt-prompts](https://github.com/f/awesome-chatgpt-prompts) 获取并插入预设的系统提示词，您也可以在设置中添加自定义提示词。

  ![Augmented-Canvas-Insertsystemprompt](./assets/AugmentedCanvas-Insertsystemprompt.gif)

- **插入相关问题**：基于您最近修改的 X 个文件（数量可在设置中调整），AI 会分析您的历史活动并生成相关问题插入画布。

- **重新生成回复**：在连线（Edge）的右键菜单中增加了一个操作，用于重新生成 AI 的回复。

### 🚀 安装方法

#### 暂未在官方插件市场上架

#### 通过 BRAT 插件安装

可以使用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件安装。参考这篇指南：[Installing the BRAT plugin in Obsidian](https://ricraftis.au/obsidian/installing-the-brat-plugin-in-obsidian-a-step-by-step-guide/)

#### 手动安装

1. 访问本项目的 Release 页面。
2. 下载最新的 Release 压缩包。
3. 解压后将文件夹复制到 Obsidian 的插件目录中（确保文件夹内包含 `main.js` 和 `manifest.json`）。
4. 重启 Obsidian 或刷新插件列表，在设置中启用该插件。
5. 完成！

### ⚙️ 配置说明

1. 从 [DeepSeek 开放平台](https://platform.deepseek.com) 获取 API Key
2. 打开 Obsidian 设置 → Augmented Canvas
3. 输入您的 API 密钥
4. 选择您偏好的模型（`deepseek-chat` 或 `deepseek-coder`）
5. 根据需要调整温度、Token 限制等参数

### 💡 使用指南

#### 基本工作流

1. 在 Obsidian 中创建画布
2. 添加文本卡片、笔记或文件
3. 右键点击卡片访问 AI 功能
4. 使用命令面板获取其他命令，如"插入系统提示词"

#### 隐私说明

发送给 DeepSeek AI 的具体内容可以通过开启"Debug output"设置在控制台中查看。

### 🛠️ 开发说明

#### 前置要求

- Node.js (v18 或更高版本)
- npm

#### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/yourusername/obsidian-augmented-canvas.git
cd obsidian-augmented-canvas

# 安装依赖
npm install

# 开发模式（支持热重载）
npm run dev

# 生产构建
npm run build

# 运行代码检查
npm run lint

# 自动修复代码规范问题
npm run lint:fix
```

#### 项目结构

```
src/
├── actions/          # 操作处理器
│   ├── canvas/       # 画布特定操作（询问 AI、重新生成）
│   ├── commands/     # 命令面板命令
│   ├── contextMenu/  # 右键菜单操作（闪卡）
│   └── menuPatches/  # 菜单补丁逻辑
├── modals/           # UI 模态框
├── obsidian/         # Obsidian API 扩展
├── settings/         # 插件设置
├── types/            # TypeScript 类型定义
└── utils/            # 实用工具函数
```

### ⚠️ 重要提示

- 本插件使用 DeepSeek API 而非 OpenAI
- **图像生成功能不可用**（DeepSeek 不支持该功能）
- API 调用可能会根据您的 DeepSeek 使用计划产生费用

### 🙏 致谢

- [rpggio/obsidian-chat-stream](https://github.com/rpggio/obsidian-chat-stream)
- [Quorafind/Obsidian-Collapse-Node](https://github.com/quorafind/obsidian-collapse-node)

### 📄 许可证

MIT 许可证 - 详情请见 [LICENSE](LICENSE) 文件。

### 💖 支持

如果您觉得这个插件对您有帮助，可以通过以下方式支持我的开发工作：

<a href="https://www.buymeacoffee.com/metacorp"><img src="https://img.buymeacoffee.com/button-api/?text=请我喝杯咖啡&emoji=&slug=boninall&button_colour=6495ED&font_colour=ffffff&font_family=Lato&outline_colour=000000&coffee_colour=FFDD00"></a>
