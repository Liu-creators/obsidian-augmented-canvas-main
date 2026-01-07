/**
 * Canvas 渲染器属性测试
 *
 * Feature: group-generation-refactor
 *
 * 这些测试使用 fast-check 验证 Canvas 渲染器的属性，
 * 确保位置保留和批量更新效率。
 */

import * as fc from "fast-check";
import { CanvasRenderer } from "../canvasRenderer";
import { createConfig } from "../config";
import { AnchorState, ColumnTrack, PositionUpdate } from "../types";
import { Canvas, CanvasNode } from "../../../obsidian/canvas-internal";

// ============================================================================
// Mock 实现
// ============================================================================

/**
 * 创建 Mock Canvas 节点
 */
function createMockCanvasNode(
	id: string,
	x: number,
	y: number,
	width: number,
	height: number,
	text: string = ""
): CanvasNode {
	let nodeData = {
		id,
		x,
		y,
		width,
		height,
		text,
		color: "1",
	};

	return {
		id,
		get x() { return nodeData.x; },
		get y() { return nodeData.y; },
		get width() { return nodeData.width; },
		get height() { return nodeData.height; },
		get text() { return nodeData.text; },
		setData: (data: Partial<typeof nodeData>) => {
			nodeData = { ...nodeData, ...data };
		},
		setText: async (newText: string) => {
			nodeData.text = newText;
		},
		getData: () => ({ ...nodeData, type: "text" }),
	} as unknown as CanvasNode;
}

/**
 * 创建 Mock Canvas
 */
function createMockCanvas(): Canvas & {
	requestFrameCount: number;
	addedNodes: CanvasNode[];
	removedNodes: CanvasNode[];
	} {
	const state = {
		requestFrameCount: 0,
	};
	const addedNodes: CanvasNode[] = [];
	const removedNodes: CanvasNode[] = [];
	const nodesMap = new Map<string, CanvasNode>();

	const canvas = {
		get requestFrameCount() { return state.requestFrameCount; },
		set requestFrameCount(val: number) { state.requestFrameCount = val; },
		addedNodes,
		removedNodes,
		nodes: nodesMap,
		edges: [],
		selection: new Set(),
		wrapperEl: null,
		createTextNode: (options: { pos: { x: number; y: number }; size: { width: number; height: number }; text: string }) => {
			const node = createMockCanvasNode(
				`node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
				options.pos.x,
				options.pos.y,
				options.size.width,
				options.size.height,
				options.text
			);
			return node;
		},
		addNode: (node: CanvasNode) => {
			addedNodes.push(node);
			nodesMap.set(node.id, node);
		},
		removeNode: (node: CanvasNode) => {
			removedNodes.push(node);
			nodesMap.delete(node.id);
		},
		requestFrame: async () => {
			state.requestFrameCount++;
		},
		getData: () => ({ nodes: [], edges: [] }),
		importData: () => {},
		deselectAll: () => {},
		getEdgesForNode: () => [],
		selectOnly: () => {},
		requestSave: async () => {},
	} as unknown as Canvas & {
		requestFrameCount: number;
		addedNodes: CanvasNode[];
		removedNodes: CanvasNode[];
	};

	return canvas;
}

// ============================================================================
// 测试辅助函数和生成器
// ============================================================================

/**
 * 生成有效的节点 XML 数据
 */
const nodeXMLArb = fc.record({
	id: fc.string({ minLength: 1, maxLength: 10 }).map(s => `node_${s}`),
	content: fc.string({ minLength: 1, maxLength: 500 }),
	type: fc.constantFrom("default", "concept", "step", "resource", "warning", "insight", "question") as fc.Arbitrary<"default" | "concept" | "step" | "resource" | "warning" | "insight" | "question">,
	row: fc.integer({ min: 0, max: 10 }),
	col: fc.integer({ min: 0, max: 5 }),
	groupId: fc.option(fc.string({ minLength: 1, maxLength: 5 }).map(s => `g_${s}`), { nil: undefined }),
});

/**
 * 生成随机内容更新
 */
const contentUpdateArb = fc.string({ minLength: 1, maxLength: 1000 });

/**
 * 生成位置
 */
const positionArb = fc.record({
	x: fc.integer({ min: 0, max: 5000 }),
	y: fc.integer({ min: 0, max: 5000 }),
});

/**
 * 生成尺寸
 */
const dimensionsArb = fc.record({
	width: fc.integer({ min: 100, max: 600 }),
	height: fc.integer({ min: 50, max: 500 }),
});


// ============================================================================
// Property 11: 内容更新时位置保留
// ============================================================================

describe("Property 11: Position Preservation on Content Update", () => {
	/**
	 * Property 11: 内容更新时位置保留
	 *
	 * 对于任何现有节点，当通过 updateNodeContent() 更新其内容时，
	 * 节点的 x 和 y 坐标应保持完全不变。只有文本内容和可能的高度可以改变。
	 *
	 * **Validates: Requirements 7.5**
	 */
	it("should preserve x and y coordinates when content is updated", async () => {
		await fc.assert(
			fc.asyncProperty(
				nodeXMLArb,
				positionArb,
				dimensionsArb,
				contentUpdateArb,
				async (nodeXML, position, dimensions, newContent) => {
					const mockCanvas = createMockCanvas();
					const config = createConfig();
					const renderer = new CanvasRenderer(mockCanvas, config);

					// 创建节点
					const result = await renderer.createNode(nodeXML, position, dimensions);

					// 记录原始位置
					const originalX = result.canvasNode.x;
					const originalY = result.canvasNode.y;

					// 更新内容
					await renderer.updateNodeContent(nodeXML.id, newContent);

					// 获取更新后的节点
					const updatedNode = renderer.getCreatedNode(nodeXML.id);

					// 验证位置保留
					expect(updatedNode?.x).toBe(originalX);
					expect(updatedNode?.y).toBe(originalY);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should only update text content, not position", async () => {
		await fc.assert(
			fc.asyncProperty(
				nodeXMLArb,
				positionArb,
				fc.array(contentUpdateArb, { minLength: 2, maxLength: 5 }),
				async (nodeXML, position, contentUpdates) => {
					const mockCanvas = createMockCanvas();
					const config = createConfig();
					const renderer = new CanvasRenderer(mockCanvas, config);

					// 创建节点
					await renderer.createNode(nodeXML, position);

					// 记录原始位置
					const originalX = position.x;
					const originalY = position.y;

					// 多次更新内容
					for (const content of contentUpdates) {
						await renderer.updateNodeContent(nodeXML.id, content);

						// 每次更新后验证位置
						const node = renderer.getCreatedNode(nodeXML.id);
						expect(node?.x).toBe(originalX);
						expect(node?.y).toBe(originalY);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should preserve position even when content causes height change", async () => {
		await fc.assert(
			fc.asyncProperty(
				nodeXMLArb,
				positionArb,
				// 生成短内容和长内容
				fc.string({ minLength: 1, maxLength: 50 }),
				fc.string({ minLength: 500, maxLength: 2000 }),
				async (nodeXML, position, shortContent, longContent) => {
					const mockCanvas = createMockCanvas();
					const config = createConfig();
					const renderer = new CanvasRenderer(mockCanvas, config);

					// 使用短内容创建节点
					const shortNodeXML = { ...nodeXML, content: shortContent };
					await renderer.createNode(shortNodeXML, position);

					// 记录原始位置
					const originalX = position.x;
					const originalY = position.y;

					// 更新为长内容（会导致高度变化）
					await renderer.updateNodeContent(nodeXML.id, longContent);

					// 验证位置保留
					const node = renderer.getCreatedNode(nodeXML.id);
					expect(node?.x).toBe(originalX);
					expect(node?.y).toBe(originalY);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should return false when updating non-existent node", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 10 }),
				contentUpdateArb,
				async (nodeId, content) => {
					const mockCanvas = createMockCanvas();
					const config = createConfig();
					const renderer = new CanvasRenderer(mockCanvas, config);

					// 尝试更新不存在的节点
					const result = await renderer.updateNodeContent(`nonexistent_${nodeId}`, content);

					expect(result).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});
});


// ============================================================================
// Property 12: 批量更新效率
// ============================================================================

describe("Property 12: Batch Update Efficiency", () => {
	/**
	 * Property 12: 批量更新效率
	 *
	 * 对于任何影响多个节点的高度变化，所有位置更新应被收集并在单个批次中应用，
	 * 导致整个重新定位操作只有一次 canvas.requestFrame() 调用。
	 *
	 * **Validates: Requirements 8.3, 8.5**
	 */
	it("should call requestFrame exactly once for batch position updates", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						nodeId: fc.string({ minLength: 1, maxLength: 5 }).map(s => `node_${s}`),
						newY: fc.integer({ min: 0, max: 5000 }),
					}),
					{ minLength: 2, maxLength: 10 }
				),
				async (updates) => {
					const mockCanvas = createMockCanvas();
					const config = createConfig();
					const renderer = new CanvasRenderer(mockCanvas, config);

					// 确保更新的节点 ID 唯一
					const uniqueUpdates = updates.reduce((acc, update, index) => {
						const uniqueId = `${update.nodeId}_${index}`;
						acc.push({ ...update, nodeId: uniqueId });
						return acc;
					}, [] as PositionUpdate[]);

					// 为每个更新创建对应的节点
					for (const update of uniqueUpdates) {
						const nodeXML = {
							id: update.nodeId,
							content: "test content",
							type: "default" as const,
							row: 0,
							col: 0,
						};
						await renderer.createNode(nodeXML, { x: 100, y: update.newY - 100 });
					}

					// 重置计数器
					renderer.resetBatchUpdateCount();
					const initialFrameCount = mockCanvas.requestFrameCount;

					// 执行批量更新
					await renderer.batchUpdatePositions(uniqueUpdates);

					// 验证只调用了一次 requestFrame
					const frameCallsDelta = mockCanvas.requestFrameCount - initialFrameCount;
					expect(frameCallsDelta).toBe(1);
					expect(renderer.getBatchUpdateCount()).toBe(1);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should not call requestFrame when updates array is empty", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.constant([] as PositionUpdate[]),
				async (updates) => {
					const mockCanvas = createMockCanvas();
					const config = createConfig();
					const renderer = new CanvasRenderer(mockCanvas, config);

					const initialFrameCount = mockCanvas.requestFrameCount;
					renderer.resetBatchUpdateCount();

					// 执行空批量更新
					const count = await renderer.batchUpdatePositions(updates);

					// 验证没有调用 requestFrame
					expect(count).toBe(0);
					expect(mockCanvas.requestFrameCount).toBe(initialFrameCount);
					expect(renderer.getBatchUpdateCount()).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should update all nodes in a single batch", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 3, max: 8 }), // 节点数量
				fc.integer({ min: 50, max: 200 }), // Y 偏移量
				async (nodeCount, yOffset) => {
					const mockCanvas = createMockCanvas();
					const config = createConfig();
					const renderer = new CanvasRenderer(mockCanvas, config);

					// 创建多个节点
					const nodeIds: string[] = [];
					for (let i = 0; i < nodeCount; i++) {
						const nodeId = `batch_node_${i}`;
						nodeIds.push(nodeId);
						await renderer.createNode(
							{ id: nodeId, content: `content ${i}`, type: "default" as const, row: i, col: 0 },
							{ x: 100, y: 100 + i * 100 }
						);
					}

					// 准备批量更新
					const updates: PositionUpdate[] = nodeIds.map((nodeId, i) => ({
						nodeId,
						newY: 100 + i * 100 + yOffset,
					}));

					// 重置计数器
					renderer.resetBatchUpdateCount();
					const initialFrameCount = mockCanvas.requestFrameCount;

					// 执行批量更新
					const updatedCount = await renderer.batchUpdatePositions(updates);

					// 验证所有节点都被更新
					expect(updatedCount).toBe(nodeCount);

					// 验证只调用了一次 requestFrame
					expect(mockCanvas.requestFrameCount - initialFrameCount).toBe(1);
					expect(renderer.getBatchUpdateCount()).toBe(1);

					// 验证每个节点的新位置
					for (let i = 0; i < nodeCount; i++) {
						const node = renderer.getCreatedNode(nodeIds[i]);
						expect(node?.y).toBe(100 + i * 100 + yOffset);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should handle mixed existing and non-existing nodes in batch", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 2, max: 5 }), // 存在的节点数量
				fc.integer({ min: 1, max: 3 }), // 不存在的节点数量
				async (existingCount, nonExistingCount) => {
					const mockCanvas = createMockCanvas();
					const config = createConfig();
					const renderer = new CanvasRenderer(mockCanvas, config);

					// 创建一些节点
					const existingIds: string[] = [];
					for (let i = 0; i < existingCount; i++) {
						const nodeId = `existing_${i}`;
						existingIds.push(nodeId);
						await renderer.createNode(
							{ id: nodeId, content: `content ${i}`, type: "default" as const, row: i, col: 0 },
							{ x: 100, y: 100 + i * 100 }
						);
					}

					// 准备包含存在和不存在节点的更新
					const updates: PositionUpdate[] = [
						...existingIds.map((nodeId, i) => ({
							nodeId,
							newY: 200 + i * 100,
						})),
						...Array.from({ length: nonExistingCount }, (_, i) => ({
							nodeId: `nonexisting_${i}`,
							newY: 500 + i * 100,
						})),
					];

					// 重置计数器
					renderer.resetBatchUpdateCount();

					// 执行批量更新
					const updatedCount = await renderer.batchUpdatePositions(updates);

					// 只有存在的节点应该被更新
					expect(updatedCount).toBe(existingCount);

					// 验证存在的节点位置已更新
					for (let i = 0; i < existingCount; i++) {
						const node = renderer.getCreatedNode(existingIds[i]);
						expect(node?.y).toBe(200 + i * 100);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});
