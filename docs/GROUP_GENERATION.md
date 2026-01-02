# Group Generation 功能文档

## 概述

Group Generation 是 Obsidian Augmented Canvas 插件的新功能，允许 AI 一次性生成包含多个节点的 Group（分组），而不是仅生成单个节点。这对于创建结构化的知识卡片、概念分解、学习指南等场景特别有用。

## 功能特性

### 核心特性

1. **AI 驱动的多节点生成**
   - AI 根据上下文和用户问题生成 3-6 个相关节点
   - 每个节点包含独特的内容和视角
   - 自动为节点添加清晰的标题

2. **智能布局算法**
   - 根据节点数量自动选择最佳布局：
     - 1-2 个节点：水平排列
     - 3-4 个节点：2x2 网格
     - 5-6 个节点：2x3 网格
     - 7+ 个节点：3 列网格，自动换行
   - 节点高度根据内容长度动态调整
   - 统一的间距和对齐

3. **Markdown 格式解析和完整支持**
   - 使用新的分隔符格式：`---[NODE]---`（避免与 Markdown 语法冲突）
   - 节点内容**完整支持 Markdown 语法**：
     - **粗体** 和 *斜体*
     - 列表（有序和无序）
     - 代码块和内联代码
     - 标题（###、## 等）
     - 水平线（---）
     - 链接和其他 Markdown 特性
   - Canvas 会自动解析和渲染节点中的 Markdown
   - 向后兼容旧的 `###` 和 `---` 格式（作为降级选项）

4. **可配置选项**
   - Group 颜色
   - 节点间距
   - Group 内边距
   - 启用/禁用功能

## 使用方法

### 基本使用流程

1. **打开 Canvas**
   - 在 Obsidian 中打开一个 Canvas 文件

2. **选择源节点**
   - 选择一个现有节点（可以是文本节点、文件节点或 Group）
   - 如果选择 Group，AI 会读取 Group 内所有节点的内容作为上下文

3. **点击 "Generate Group with AI" 按钮**
   - 在 Canvas 菜单中找到 "Generate Group with AI" 按钮（图标：layers）
   - 点击按钮

4. **输入问题或指令**
   - 在弹出的对话框中输入你的问题或指令
   - 例如：
     - "请生成关于量子物理基础的学习指南"
     - "Create a breakdown of machine learning concepts"
     - "总结这个主题的关键要点"

5. **等待 AI 生成**
   - AI 会流式生成内容
   - 占位符节点会显示当前进度
   - 生成完成后自动创建 Group 和内部节点

6. **查看结果**
   - 新生成的 Group 会出现在源节点下方
   - Group 和源节点之间有连线
   - 连线上显示你输入的问题（如果有）

### 使用场景示例

#### 场景 1：知识卡片生成

**源节点内容**：
```
人工智能的定义和历史
```

**用户问题**：
```
请创建关于人工智能的知识卡片
```

**AI 生成的 Group**（包含 4-5 个节点）：
- **定义和范畴**：AI 的基本定义和研究领域
- **发展历史**：从图灵测试到深度学习的演进
- **核心技术**：机器学习、神经网络、自然语言处理等
- **应用领域**：医疗、金融、自动驾驶等实际应用
- **未来展望**：AGI、伦理问题等

#### 场景 2：概念分解

**源节点内容**：
```
RESTful API 设计
```

**用户问题**：
```
Break down the key principles and best practices
```

**AI 生成的 Group**（包含 5-6 个节点）：
- **Core Principles**：REST 架构约束
- **HTTP Methods**：GET、POST、PUT、DELETE 的使用
- **Resource Design**：资源命名和层级
- **Status Codes**：常用状态码和含义
- **Authentication**：认证和授权机制
- **Versioning**：API 版本管理策略

#### 场景 3：从 Group 扩展

**源 Group** 包含：
- 节点 1：项目背景
- 节点 2：核心功能
- 节点 3：技术栈

**用户问题**：
```
基于这些信息，生成项目实施计划
```

**AI 生成的新 Group**（包含 4-5 个节点）：
- **阶段一：准备阶段**：环境搭建、团队组建
- **阶段二：开发阶段**：核心功能实现、测试
- **阶段三：部署阶段**：上线准备、监控设置
- **阶段四：维护阶段**：bug 修复、功能迭代

## AI Prompt 格式

### System Prompt

插件使用以下 System Prompt 指导 AI 生成多节点内容：

```
You are helping to generate content for multiple connected nodes in a visual canvas.

IMPORTANT: Separate each node using this EXACT separator (on its own line, with blank lines before and after):
---[NODE]---

Each node can contain full Markdown syntax including:
- **Bold text** and *italic text*
- Lists (bulleted or numbered)
- Code blocks with `backticks`
- Headers like ### if needed
- Horizontal rules with ---
- Links and other Markdown features

Guidelines:
- Create 3-6 related nodes that comprehensively cover different aspects of the topic
- Each node should be focused and concise (2-5 paragraphs)
- Feel free to use Markdown formatting within each node to enhance readability
- Make sure each node adds unique value and different perspective
- Use the same language as the user's question
```

### AI 响应格式示例

**新格式：`---[NODE]---` 分隔符（推荐）**

```markdown
First node content with **bold** and *italic* text.
- List item 1
- List item 2
- List item 3

Here's more content with `code` examples.

---[NODE]---

Second node content with more Markdown formatting.

### Subheading
- Another list
- With **formatted** items

Here's a horizontal rule:
---

---[NODE]---

Third node content with [links](https://example.com) and more...

\`\`\`javascript
// Code blocks work too
const example = "Hello";
\`\`\`
```

**特点**：
- ✅ 不会与内容中的 `###` 标题冲突
- ✅ 不会与内容中的 `---` 水平线冲突
- ✅ 节点内容可以包含完整的 Markdown 语法
- ✅ Canvas 自动渲染所有 Markdown 格式

**向后兼容格式**：

如果 AI 未使用新分隔符，插件会尝试解析旧格式：
- `### 标题` 格式（作为降级选项）
- `---` 分隔线格式（作为降级选项）

## 配置选项

在插件设置中，可以配置以下选项：

### 启用 Group 生成功能
- **类型**：布尔值
- **默认**：true
- **说明**：启用或禁用 "Generate Group with AI" 功能

### 默认 Group 颜色
- **类型**：字符串
- **默认**："4"（绿色）
- **可选值**：
  - "1" = 红色
  - "2" = 橙色
  - "3" = 黄色
  - "4" = 绿色
  - "5" = 青色
  - "6" = 紫色
  - "#RRGGBB" = 自定义颜色

### Group 内节点间距
- **类型**：数字
- **默认**：40
- **单位**：像素
- **说明**：Group 内节点之间的水平和垂直间距

### Group 内边距
- **类型**：数字
- **默认**：60
- **单位**：像素
- **说明**：Group 边框到内部节点的内边距

## 技术实现

### 架构概览

```
用户操作
  ↓
Canvas 菜单按钮
  ↓
输入对话框
  ↓
generateGroupWithAI()
  ↓
AI 流式响应
  ↓
parseNodesFromMarkdown()
  ↓
calculateSmartLayout()
  ↓
createGroupWithNodes()
  ↓
Canvas 渲染
```

### 核心函数

#### `parseNodesFromMarkdown(markdown: string): ParsedNode[]`

解析 AI 响应的 Markdown 文本，提取多个节点。

**解析策略**（优先级顺序）：
1. **新格式**：`---[NODE]---` 分隔符（避免与 Markdown 语法冲突）
2. **降级 1**：`### 标题` 格式（向后兼容）
3. **降级 2**：`---` 分隔线格式（向后兼容）
4. **降级 3**：单节点（如果未找到任何分隔符）

**输入示例**（新格式）：
```markdown
First node with **bold** and *italic* text.
- List item
- Another item

---[NODE]---

Second node with `code` and more markdown...
```

**输出**：
```typescript
[
  { content: "First node with **bold** and *italic* text.\n- List item\n- Another item" },
  { content: "Second node with `code` and more markdown..." }
]
```

**注意**：节点内容完整保留，所有 Markdown 语法都会传递给 Canvas 进行渲染。

#### `calculateSmartLayout(nodeContents: string[], options): NodeLayout[]`

根据节点数量和内容计算智能布局。

**输入**：
- `nodeContents`: 节点内容数组
- `options`: 配置选项（节点宽度、间距）

**输出**：
```typescript
[
  { x: 0, y: 0, width: 360, height: 150 },
  { x: 400, y: 0, width: 360, height: 150 },
  // ...
]
```

#### `createGroupWithNodes(canvas, parsedNodes, options): Promise<CanvasNode>`

在 Canvas 中创建 Group 和内部节点。

**主要步骤**：
1. 计算节点布局
2. 计算 Group 边界
3. 确定 Group 位置（相对于父节点）
4. 使用 `canvas.importData()` 创建 Group
5. 创建内部文本节点
6. 创建父节点到 Group 的连线

## 降级策略

### 单节点降级

如果 AI 只生成一个节点的内容（未使用分隔符），插件会：
1. 检测到只有一个节点
2. 不创建 Group
3. 创建单个普通文本节点
4. 显示提示："AI generated single node. Creating as regular note."

### 解析失败处理

如果无法解析任何节点：
1. 将完整响应作为单个节点显示
2. 显示错误提示
3. 不创建 Group

## 已知限制

1. **节点数量限制**
   - 建议生成 3-6 个节点
   - 超过 10 个节点可能导致布局拥挤

2. **内容长度**
   - 每个节点高度最大 600px
   - 超长内容会被截断并显示滚动条

3. **嵌套限制**
   - 不支持在生成的 Group 内再嵌套 Group
   - 所有生成的节点都是文本节点

4. **实时预览**
   - 由于需要等待完整响应才能确定节点数量
   - 无法在流式过程中实时显示节点
   - 使用占位符显示进度

## 故障排除

### 问题：点击按钮后没有反应

**可能原因**：
- 未选择节点
- 选择了多个节点
- 未设置 API 密钥

**解决方案**：
1. 确保只选择了一个节点
2. 在设置中配置 DeepSeek API 密钥

### 问题：AI 返回单个节点

**可能原因**：
- 问题过于简单
- AI 没有理解多节点格式要求

**解决方案**：
1. 在问题中明确要求多个部分
2. 使用更具体的指令，如："创建 5 个卡片"
3. 尝试不同的提问方式

### 问题：节点布局不理想

**可能原因**：
- 节点数量不适合当前布局策略
- 节点内容长度差异过大

**解决方案**：
1. 调整设置中的节点间距和内边距
2. 手动调整生成后的节点位置
3. 在问题中指定期望的节点数量

## 未来改进方向

1. **实时预览**
   - 在流式过程中逐步显示节点
   - 动态调整布局

2. **自定义布局**
   - 支持用户指定布局方式（垂直、水平、网格）
   - 思维导图式的层级布局

3. **模板系统**
   - 预定义的 Group 模板（如 SWOT 分析、5W1H 等）
   - 自定义模板配置

4. **节点关系**
   - 在 Group 内部节点之间添加连线
   - 表达节点间的逻辑关系

5. **批量操作**
   - 从多个源节点生成 Group
   - 合并多个 Group

## 版本历史

### v0.1.16 (2026-01-02)
- ✨ 新增 Group 生成功能
- 🎨 智能布局算法
- ⚙️ 可配置的 Group 参数
- 📝 支持 Markdown 分隔符解析

## 贡献

欢迎提交 Issue 和 Pull Request！

特别感谢：
- Obsidian Canvas JSON 格式规范
- DeepSeek AI API
- 社区反馈和建议

