# Group 处理算法说明

## 概述

本插件现在支持精确处理 Obsidian Canvas 中的 **Group（分组）** 节点。根据 Obsidian Canvas JSON 格式规范，Group 内的节点是通过坐标区域来判断包含关系的。

## 算法实现

### 1. 坐标判断算法

Group 节点有其自己的坐标区域（`x`, `y`, `width`, `height`）。算法通过以下步骤判断一个节点是否在 Group 内：

1. 计算 Group 的边界坐标：
   - 左边界：`groupX`
   - 右边界：`groupX + groupWidth`
   - 上边界：`groupY`
   - 下边界：`groupY + groupHeight`

2. 计算节点的中心点坐标：
   - 中心点 X：`nodeX + nodeWidth / 2`
   - 中心点 Y：`nodeY + nodeHeight / 2`

3. 判断节点中心点是否在 Group 边界内：
   ```typescript
   nodeCenterX >= groupLeft && 
   nodeCenterX <= groupRight && 
   nodeCenterY >= groupTop && 
   nodeCenterY <= groupBottom
   ```

### 2. 节点排序

获取 Group 内的所有节点后，会按照以下规则排序：

1. **首先按 Y 坐标排序**（从上到下）
2. **Y 坐标相近时（差值小于 10px），按 X 坐标排序**（从左到右）

这样可以确保节点按照视觉上从上到下、从左到右的顺序读取。

### 3. 内容读取

读取 Group 内容时，会：

1. 遍历所有在 Group 内的节点
2. 读取每个节点的内容
3. 对于特殊节点类型：
   - **嵌套 Group**：递归读取，添加 Group 标签
   - **文件节点**：添加文件名标识
   - **文本节点**：直接读取内容
4. 将所有内容用两个换行符（`\n\n`）连接

## API 说明

### `isGroup(node: CanvasNode): boolean`

判断节点是否为 Group 类型。

### `isNodeInGroup(node: CanvasNode, group: CanvasNode): boolean`

判断一个节点是否在 Group 的坐标区域内。

### `getNodesInGroup(group: CanvasNode, canvas: Canvas): CanvasNode[]`

获取 Group 内的所有节点，返回按位置排序的节点数组。

### `readGroupContent(group: CanvasNode): Promise<string>`

读取 Group 内所有节点的内容，返回组合后的文本。

**特性：**
- 自动处理嵌套 Group
- 为文件节点添加文件名标识
- 忽略空内容节点
- 按照视觉顺序组织内容

### `getGroupLabel(group: CanvasNode): string`

获取 Group 的标签（label），如果没有则返回 "Group"。

### `buildGroupContext(group: CanvasNode): Promise<string>`

读取 Group 内容并生成适合 AI 的上下文描述。

**特性：**
- 添加 Group 标题
- 标注 Group 内节点数量
- 为每个节点添加编号
- 递归处理嵌套 Group

## 使用示例

### 在 "Ask question with AI" 中使用

当你选择一个 Group 节点并使用 "Ask question with AI" 功能时：

1. 插件会自动识别这是一个 Group
2. 读取 Group 内所有节点的内容
3. 将 Group 内容作为上下文
4. 将你的问题添加到上下文后面
5. 发送给 AI 进行处理

**示例：**

假设你有一个 Group "项目需求"，包含以下节点：
- 节点 1：功能列表
- 节点 2：技术栈
- 节点 3：时间安排

当你选择这个 Group，点击 "Ask question with AI" 并输入：
> "请根据这些需求制定开发计划"

插件会将所有节点内容和你的问题一起发送给 AI。

### 在代码中使用

```typescript
import { isGroup, readGroupContent, getNodesInGroup } from "../utils/groupUtils";

// 检查是否为 Group
if (isGroup(node)) {
    // 获取 Group 标签
    const label = getGroupLabel(node);
    
    // 获取 Group 内的所有节点
    const nodesInGroup = getNodesInGroup(node, canvas);
    
    // 读取 Group 内容
    const content = await readGroupContent(node);
    
    // 使用内容...
}
```

## 注意事项

1. **坐标精度**：算法使用节点中心点判断包含关系，这与 Obsidian 的视觉显示保持一致。

2. **嵌套 Group**：支持无限层级的 Group 嵌套，会递归处理所有层级。

3. **空 Group**：如果 Group 为空（没有任何节点），会返回空字符串或提示信息。

4. **性能**：对于包含大量节点的 Canvas，算法会遍历所有节点来查找 Group 内的节点，性能开销为 O(n)，其中 n 是 Canvas 中的节点总数。

## Canvas JSON 格式参考

根据 `assets/Obsidian Canvas JSON 格式规范.md`：

### Group 节点结构

```json
{
  "id": "group_1",
  "type": "group",
  "label": "分组标题",
  "x": 0,
  "y": 0,
  "width": 500,
  "height": 400,
  "color": "2"
}
```

### 关键点

1. **type**: 必须为 `"group"`
2. **label**: 分组的标题文字（可选）
3. **x, y, width, height**: 定义分组的坐标和大小
4. Group 内的节点与 Group 节点同级平铺在 `nodes` 数组中
5. 通过坐标区域判断哪些节点属于 Group

## 未来改进

1. **缓存优化**：可以缓存 Group 内节点的查找结果，避免重复计算。
2. **边界判断优化**：可以考虑使用节点的整个区域而不是中心点来判断包含关系。
3. **并行处理**：对于大量节点，可以使用并行处理来提高性能。

## 相关文件

- `src/utils/groupUtils.ts` - Group 处理算法实现
- `src/actions/canvas/askQuestion.ts` - 在 "Ask question with AI" 中使用
- `assets/Obsidian Canvas JSON 格式规范.md` - Canvas JSON 格式规范

