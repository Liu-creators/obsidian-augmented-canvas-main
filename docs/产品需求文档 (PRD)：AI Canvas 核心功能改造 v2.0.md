## 1. 改造目标
在保留现有业务逻辑（基于节点/组发散）的基础上，通过**协议升级（XML Stream）**和**逻辑网格布局**，解决生成不稳定、无法流式展示、布局重叠的问题。同时增强“智能连线”与“智能分组”的交互性，支持用户自定义指令。

---

## 2. 核心协议规范 (Protocol Spec)

### 2.1 基础 XML 结构
AI 输出必须是扁平或简单的嵌套 XML 流。

#### A. 节点 (`<node>`)
```xml
<node id="sem_id" type="Enum" title="标题" row="Int" col="Int">
Markdown 内容
</node>
```

#### B. 组 (`<group>`) —— *针对“生成新Group”场景*
如果 AI 认为生成的内容应该聚合在一起（例如生成了一个完整的方案），应使用 `<group>` 包裹 `<node>`。
```xml
<group id="g_id" title="分组标题" row="Int" col="Int">
    <node id="n1" ...>...</node>
    <node id="n2" ...>...</node>
</group>
```
*   **布局逻辑**：`<group>` 的 `row/col` 决定分组框的位置；内部 `<node>` 的 `row/col` 变为**组内相对坐标**。

#### C. 连线 (`<edge>`)
```xml
<edge from="id_a" to="id_b" dir="forward|bi|none" label="连线文字" />
```

### 2.2 类型与颜色映射表 (Type Mapping)
**新增规则**：增加 `default` 类型作为默认兜底。

| AI Type | 业务含义 | Obsidian Color | 备注 |
| :--- | :--- | :--- | :--- |
| **`default`** | **普通文本/详情** | **`null` (无色/灰)** | **默认值，兜底类型** |
| `concept` | 核心概念 | `"2"` (橙) | 强调项 |
| `step` | 步骤/技术实现 | `"5"` (蓝) | 流程节点 |
| `resource` | 资源/引用 | `"4"` (绿) | 文件、图片、正面结果 |
| `warning` | 风险/错误 | `"1"` (红) | 警示项 |
| `insight` | 洞察/总结 | `"6"` (紫) | 结论 |
| `question` | 问题/待办 | `"3"` (黄) | 思考题 |

---

## 3. 功能模块详细定义

### 3.1 功能一：智能发散 (Smart Expand)
**场景**：用户选中一个节点（或分组），输入指令（如“列出反面观点”），AI 生成新的节点或分组。

*   **输入参数**：
    1.  `sourceContext`: 选中节点/组的 Markdown 内容。
    2.  `linkedContext`: (可选) 与该节点已连接的其他节点内容（提供上下文）。
    3.  **`userInstruction`**: 用户输入的具体指令（例如："展开讲讲技术实现的三个步骤" 或 "把这个概念拆解成一个分组方案"）。
*   **AI 行为逻辑**：
    1.  结合 `sourceContext` 和 `userInstruction` 生成内容。
    2.  **布局策略**：
        *   AI 以 `sourceContext` 为原点 `(0,0)`。
        *   新内容放置在 `col=1` (右侧) 或 `row=1` (下方)。
    3.  **结构决策**：根据指令决定是生成散落的 `<node>` 还是一个包裹的 `<group>`。
*   **System Prompt 核心片段**：
    ```markdown
    You are an intelligent canvas assistant.
    Goal: Expand on the user's input node based on their instruction.

    OUTPUT FORMAT (XML):
    1. Use <node id="..." type="..." title="..." row="Int" col="Int">Markdown</node>
    2. If the user asks for a specific module/plan, wrap nodes in <group id="..." title="..." row="Int" col="Int">...</group>.
    3. Coordinates (row, col) are relative to the source node (0,0).
       - Place response to the Right (col=1) or Bottom (row=1).

    TYPE RULES:
    - default: General text (Standard gray).
    - concept: Key ideas (Orange).
    - warning: Risks (Red).
    [...include other types...]
    ```

### 3.2 功能二：智能连线 (Smart Connect)
**场景**：用户选中多个已有节点，输入指令（如“按时间顺序连线”），AI 仅建立连接。

*   **输入参数**：
    1.  `nodesList`: 选中节点的 ID、Title、Content 摘要。
    2.  **`userInstruction`**: 连线逻辑（例如："找出因果关系"、"按执行顺序连线"、"标出冲突点"）。
*   **AI 行为逻辑**：
    1.  **严禁生成 `<node>` 或 `<group>`**。
    2.  仅输出 `<edge>` 列表。
    3.  `dir` 属性需根据 `userInstruction` 决定（因果用 `forward`，关联用 `none`）。
    4.  `label` 必须简短（如“导致”、“包含”）。
*   **System Prompt 核心片段**：
    ```markdown
    Task: Generate connections between existing nodes based on User Instruction: "{userInstruction}".
    Input Nodes: {nodesList}

    Constraint:
    - Output ONLY <edge> tags.
    - Do NOT create new nodes.
    - Verify that 'from' and 'to' IDs match the Input Nodes exactly.
    ```

### 3.3 功能三：智能分组 (Smart Grouping)
**场景**：用户选中一批散点，输入指令（如“按技术栈分类”），AI 创建分组框并归类节点。

*   **输入参数**：
    1.  `nodesList`: 选中节点的 ID、Title、Content 摘要。
    2.  **`userInstruction`**: 分组依据（例如："按前端/后端分类"、"按紧急程度分类"）。
*   **AI 行为逻辑**：
    1.  输出 XML 结构必须包含 `<group>` 标签。
    2.  AI 不需要移动节点坐标（因为组是新创建的），但在 XML 表达上，需要列出成员关系。
    3.  **注意**：Obsidian Canvas 的 Group 实际上是一个节点，覆盖在其他节点之上。
    4.  **优化策略**：AI 输出“哪些 ID 属于 哪个 Group ID”。前端代码负责：
        *   创建 Group 节点。
        *   计算这些成员节点的 Bounding Box (包围盒)。
        *   将 Group 节点的大小设置为包围盒大小 + Padding。
        *   (可选) 如果用户希望“整理”，前端才移动成员节点；否则只套框。
*   **XML 输出格式 (特化)**：
    ```xml
    <group id="new_g1" title="Frontend Stack">
        <member id="existing_node_a" />
        <member id="existing_node_b" />
    </group>
    ```

---

## 4. 前端解析与实现细节 (Implementation)

### 4.1 坐标转换系统的微调
由于引入了 Group，坐标转换需要支持递归或相对计算。

*   **普通节点**：
    `x = Parent.x + (col * (W + Gap))`
*   **新生成的 Group**：
    如果 AI 输出：
    ```xml
    <group row="0" col="1">
       <node row="0" col="0">...</node>
       <node row="1" col="0">...</node>
    </group>
    ```
    *   **计算 Group 绝对坐标**：`Group_X = Source.x + (1 * Group_Width_Placeholder)`
    *   **计算 内部 Node 绝对坐标**：`Node_X = Group_X + Padding + (node.col * W)`
    *   *注：这种计算比较复杂，建议简化：* 让 AI 认为 Group 只是一个大容器，内部节点坐标相对于 Group 左上角。

### 4.2 容错与兜底
*   **默认类型**：解析 XML 时，如果 `type` 属性缺失或不在枚举表中，强制赋值为 `color: undefined` (Obsidian 默认灰)。
*   **ID 匹配**：智能连线/分组时，如果 AI 返回的 ID 在当前画布找不到，**静默丢弃**该操作，防止报错。

---

## 5. 总结：开发优先级

1.  **P0**: 更新 System Prompt，支持 `default` 类型和 XML Stream 格式。
2.  **P0**: 改造“智能发散”接口，对接 User Input，实现 XML 解析器（支持 `<node>` 和 `<group>` 嵌套）。
3.  **P1**: 实现“智能连线”，仅解析 `<edge>` 标签。
4.  **P1**: 实现“智能分组”，解析 `<group>` + `<member>` 结构，并在前端实现包围盒计算逻辑。
5.  **P2**: 优化流式体验，实现打字机效果。