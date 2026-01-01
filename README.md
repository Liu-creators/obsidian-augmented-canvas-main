# Obsidian 增强型画布

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.16-green.svg)](manifest.json)

一款为 [Obsidian](https://obsidian.md) 设计的插件，通过 DeepSeek AI 功能增强 Canvas (画布) 的使用体验。

## ✨ 功能特性

### 核心画布 AI 功能

#### 1. AI 问答（针对特定卡片）

将该卡片的内容作为提示词（Prompt）发送给 AI。卡片可以是文本卡片、Markdown 文件或 PDF 文件。AI 的回复将作为一个新卡片创建在原卡片下方。

![Augmented-Canvas-AskAI](./assets/AugmentedCanvas-AskAI.gif)

#### 2. 针对卡片提问

AI 会根据问题生成一个新卡片，并将问题显示在连接两个卡片的连线上。**现已支持 Group（分组）节点** - 当你选择一个 Group 时，AI 会读取 Group 内所有节点的内容作为上下文。

![Augmented-Canvas-AskquestionswithAI](./assets/AugmentedCanvas-AskquestionwithAI.gif)

#### 3. AI 生成相关问题

针对特定卡片内容自动生成相关问题，帮助您进一步深入探索该主题。

![Augmented-Canvas-AIgeneratedquestions](./assets/AugmentedCanvas-AIgeneratedquestions.gif)

卡片之间的连接关系会被用来构建发送给 DeepSeek AI 的对话历史。

### 附加功能

#### 生成闪卡（Flashcards）

右键点击卡片即可创建闪卡，可配合 [Spaced Repetition 插件](https://github.com/st3v3nmw/obsidian-spaced-repetition) 进行复习。AI 生成的内容将保存在设置指定的文件夹中。

![Augmented-Canvas-Createflashcards](./assets/AugmentedCanvas-Createflashcards.gif)

#### 对文件夹运行系统提示词

读取指定文件夹及其子文件夹中的所有 md 和 canvas 文件，并将 AI 的响应插入当前画布。

#### 插入系统提示词

从 [f/awesome-chatgpt-prompts](https://github.com/f/awesome-chatgpt-prompts) 获取并插入预设的系统提示词，您也可以在设置中添加自定义提示词。

![Augmented-Canvas-Insertsystemprompt](./assets/AugmentedCanvas-Insertsystemprompt.gif)

#### 插入相关问题

基于您最近修改的 X 个文件（数量可在设置中调整），AI 会分析您的历史活动并生成相关问题插入画布。

#### 重新生成回复

在连线（Edge）的右键菜单中增加了一个操作，用于重新生成 AI 的回复。

### 🎯 分组（Group）支持

本插件现已支持 **分组（Group）节点**，具备智能内容聚合功能：

- **自动识别**：当你选择一个 Group 节点时，插件会自动识别并读取 Group 内的所有节点内容
- **基于坐标的算法**：使用 Obsidian Canvas 官方 JSON 格式规范，通过坐标边界判断哪些节点位于 Group 内
- **智能排序**：Group 内的节点按照视觉顺序（从上到下、从左到右）读取
- **嵌套分组支持**：支持无限层级的嵌套 Group，通过递归处理所有层级
- **上下文构建**：Group 内的所有节点内容会被组合并作为上下文发送给 AI

**使用示例**：创建一个名为"项目需求"的 Group，包含多个节点（功能列表、技术栈、时间安排等）。选择该 Group 并使用"针对卡片提问"功能，让 AI 分析所有需求内容。

详细算法说明请参阅 [docs/GROUP_HANDLING.md](docs/GROUP_HANDLING.md)。

## 🚀 安装方法

### 通过 BRAT 插件安装

可以使用 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件安装。

### 手动安装

1. 访问本项目的 Release 页面
2. 下载最新的 Release 压缩包
3. 解压后将文件夹复制到 Obsidian 的插件目录中（确保文件夹内包含 `main.js` 和 `manifest.json`）
4. 重启 Obsidian 或刷新插件列表，在设置中启用该插件

## ⚙️ 配置说明

1. 从 [DeepSeek 开放平台](https://platform.deepseek.com) 获取 API Key
2. 打开 Obsidian 设置 → Augmented Canvas
3. 输入您的 API 密钥
4. 选择您偏好的模型（`deepseek-chat` 或 `deepseek-coder`）
5. 根据需要调整温度、Token 限制等参数

## 💡 使用指南

### 基本工作流

1. 在 Obsidian 中创建画布
2. 添加文本卡片、笔记或文件
3. 右键点击卡片访问 AI 功能
4. 使用命令面板获取其他命令，如"插入系统提示词"

### 隐私说明

发送给 DeepSeek AI 的具体内容可以通过开启"Debug output"设置在控制台中查看。

## ⚠️ 重要提示

- 本插件使用 DeepSeek API 而非 OpenAI
- API 调用可能会根据您的 DeepSeek 使用计划产生费用

## 📄 许可证

MIT 许可证 - 详情请见 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- [rpggio/obsidian-chat-stream](https://github.com/rpggio/obsidian-chat-stream)
- [Quorafind/Obsidian-Collapse-Node](https://github.com/quorafind/obsidian-collapse-node)
