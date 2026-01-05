## 1. 概述
Obsidian Canvas (`.canvas`) 文件是一个 JSON 格式的数据结构，用于描述白板中的元素及其连接关系。根对象包含两个核心数组：`nodes` 和 `edges`。

```json
{
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

---

## 2. 节点定义 (Nodes)

`nodes` 数组中的每个对象代表白板上的一个元素。

### 2.1 通用属性 (Base Properties)
所有类型的节点都必须包含以下属性：

| 属性名      | 类型     | 必填  | 说明                           | 示例                   |
| :------- | :----- | :-- | :--------------------------- | :------------------- |
| `id`     | String | 是   | 16位唯一哈希 ID                   | `"f8c2e4a045ae3afb"` |
| `type`   | String | 是   | 节点类型，目前支持 `"text"`, `"file"` | `"text"`             |
| `x`      | Number | 是   | X 轴坐标 (像素)                   | `-380`               |
| `y`      | Number | 是   | Y 轴坐标 (像素)                   | `-120`               |
| `width`  | Number | 是   | 宽度 (像素)                      | `250`                |
| `height` | Number | 是   | 高度 (像素)                      | `60`                 |
| `color`  | String | 否   | 颜色代码 (见下文枚举表)，若省略则为默认灰       | `"1"` 或 `"#ff0000"`  |

### 2.2 类型特有属性 (Type-Specific Properties)

#### A. 文本节点 (`type`: "text")
直接在白板上显示的文本卡片。

| 属性名    | 类型     | 说明                       |
| :----- | :----- | :----------------------- |
| `text` | String | 卡片内的文本内容，支持 Markdown 语法。 |
#### B. 文件节点 (`type`: "file")
引用 Obsidian 库中的文件（图片、Markdown 笔记等）。

| 属性名    | 类型     | 说明                       |
| :----- | :----- | :----------------------- |
| `file` | String | 文件的相对路径 (相对于 Vault 根目录)。 |
#### C. 分组节点 (type: "group") 
用于在视觉上包裹其他节点的容器框。  
注：在 JSON 结构中，分组内的节点通常仍与分组节点同级平铺在 nodes 数组中，通过坐标区域 (x, y, width, height) 来确定视觉上的包含关系。

| 属性名       | 类型     | 说明                     |
| --------- | ------ | ---------------------- |
| **label** | String | **分组的标题文字**（显示在分组框上方）。 |

---

## 3. 连线定义 (Edges)

`edges` 数组定义节点之间的连接线。

| 属性名 | 类型 | 必填 | 说明 | 示例 |
| :--- | :--- | :--- | :--- | :--- |
| `id` | String | 是 | 16位唯一哈希 ID | `"ed47d02f8e5c2068"` |
| `fromNode` | String | 是 | 起始节点的 `id` | `"f8c2e4a045ae3afb"` |
| `fromSide` | String | 是 | 连线从起始节点的哪个方向发出 | `"right"` |
| `toNode` | String | 是 | 目标节点的 `id` | `"0d4d93ae7f4ca039"` |
| `toSide` | String | 是 | 连线连接到目标节点的哪个方向 | `"left"` |
| `label` | String | **否** | **连线上显示的文字标签** | `"导致"` |
| `color` | String | **否** | **连线颜色** (见下文枚举表)，若省略则为默认灰 | `"5"` |
| `fromEnd` | String | **否** | 起始端箭头样式，默认为 `"none"` | `"arrow"` |
| `toEnd` | String | **否** | 目标端箭头样式，默认为 `"arrow"` | `"none"` |

---

## 4. 枚举值字典 (Enums)

### 4.1 颜色代码 (`color`)
适用于 `nodes` 和 `edges`。

| 值 (String) | 对应颜色 (默认主题) | 备注 |
| :--- | :--- | :--- |
| `"1"` | 红色 (Red) | 预设色 |
| `"2"` | 橙色 (Orange) | 预设色 |
| `"3"` | 黄色 (Yellow) | 预设色 |
| `"4"` | 绿色 (Green) | 预设色 |
| `"5"` | 青色/蓝色 (Cyan) | 预设色 |
| `"6"` | 紫色 (Purple) | 预设色 |
| `"#xxxxxx"`| 自定义 Hex | 例如 `"#7e3030"` |

### 4.2 方向 (`side`)
适用于 `fromSide` 和 `toSide`。

*   `"top"` (上)
*   `"bottom"` (下)
*   `"left"` (左)
*   `"right"` (右)

### 4.3 箭头样式 (`fromEnd` / `toEnd`)

用于定义连线两端的箭头显示。

*   `"none"`: 无箭头 (默认，适用于 `fromEnd`)
*   `"arrow"`: 有箭头 (默认，适用于 `toEnd`)

**常见组合：**
*   **单向箭头**: `toEnd: "arrow"` (默认)
*   **双向箭头**: `fromEnd: "arrow"`, `toEnd: "arrow"`
*   **无箭头**: `fromEnd: "none"`, `toEnd: "none"`

---

## 5. 完整 JSON 结构示例

这是一个包含文本卡片、文件引用、以及带标签/带颜色连线的完整示例：

```json
{
	"nodes": [
		{
			"id": "node_text_1",
			"type": "text",
			"text": "核心概念",
			"x": 0, "y": 0, "width": 250, "height": 60,
			"color": "2"
		},
		{
			"id": "node_file_1",
			"type": "file",
			"file": "Assets/Image.png",
			"x": 400, "y": 0, "width": 400, "height": 300,
			"color": "4"
		},
		{
			"id": "node_custom_color",
			"type": "text",
			"text": "自定义颜色节点",
			"x": 0, "y": 200, "width": 250, "height": 60,
			"color": "#7e3030"
		}
	],
	"edges": [
		{
			"id": "edge_1",
			"fromNode": "node_text_1",
			"fromSide": "right",
			"toNode": "node_file_1",
			"toSide": "left",
			"color": "5",
			"label": "参考图片",
			"toEnd": "arrow"
		},
		{
			"id": "edge_2",
			"fromNode": "node_text_1",
			"fromSide": "bottom",
			"toNode": "node_custom_color",
			"toSide": "top",
			"fromEnd": "arrow",
			"toEnd": "arrow",
			"label": "双向关系"
		},
		{
			"id": "edge_3",
			"fromNode": "node_file_1",
			"fromSide": "bottom",
			"toNode": "node_custom_color",
			"toSide": "right",
			"fromEnd": "none",
			"toEnd": "none",
			"label": "无箭头连线"
		}
	]
}
```