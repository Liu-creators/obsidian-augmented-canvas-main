/**
 * useGroupStream 重新生成行为属性测试
 *
 * Feature: group-generation-refactor
 * Property 3: Regeneration Clears and Preserves
 *
 * 这些测试使用 fast-check 验证 useGroupStream 的重新生成行为，
 * 确保现有节点被清除且组位置被保留。
 *
 * **Validates: Requirements 2.4, 6.2, 6.3**
 */

import * as fc from "fast-check";
import {
	useGroupStream,
	createMockStreamResponseFn,
} from "../useGroupStream";
import { StreamResponseFunction } from "../../utils/groupGeneration/groupStreamManager";
import { Canvas, CanvasNode } from "../../obsidian/canvas-internal";

// ============================================================================
// Mock 类型和辅助函数
// ============================================================================

/**
 * 创建模拟的设置对象
 * 不导入 AugmentedCanvasSettings 以避免路径解析问题
 */
function createMockSettings(): any {
	return {
		apiKey: "test-api-key",
		apiModel: "test-model",
		temperature: 1,
		maxResponseTokens: 0,
		gridNodeWidth: 360,
		gridNodeHeight: 200,
		groupPadding: 40,
	};
}

/**
 * 创建模拟的 Canvas
 */
function createMockCanvas(): Canvas & {
	_nodes: Map<string, CanvasNode>;
	_removedNodes: string[];
	_addedNodes: CanvasNode[];
	} {
	const nodes = new Map<string, CanvasNode>();
	const removedNodes: string[] = [];
	const addedNodes: CanvasNode[] = [];

	return {
		_nodes: nodes,
		_removedNodes: removedNodes,
		_addedNodes: addedNodes,
		nodes,
		edges: [],
		selection: new Set(),
		wrapperEl: null,
		addNode: (node: CanvasNode) => {
			nodes.set(node.id, node);
			addedNodes.push(node);
		},
		removeNode: (node: CanvasNode) => {
			nodes.delete(node.id);
			removedNodes.push(node.id);
		},
		createTextNode: (options: any) => {
			const id = `node_${Math.random().toString(36).substr(2, 9)}`;
			const node = {
				id,
				x: options.pos?.x ?? 0,
				y: options.pos?.y ?? 0,
				width: options.size?.width ?? 360,
				height: options.size?.height ?? 200,
				text: options.text ?? "",
				color: "",
				getData: () => ({ id }),
				setData: (data: any) => {
					if (data.x !== undefined) (node as any).x = data.x;
					if (data.y !== undefined) (node as any).y = data.y;
					if (data.width !== undefined) (node as any).width = data.width;
					if (data.height !== undefined) (node as any).height = data.height;
					if (data.color !== undefined) (node as any).color = data.color;
				},
				setText: async (text: string) => { (node as any).text = text; },
			} as unknown as CanvasNode;
			return node;
		},
		deselectAll: () => {},
		getData: () => ({ nodes: [], edges: [] }),
		getEdgesForNode: () => [],
		importData: () => {},
		requestFrame: async () => {},
		requestSave: async () => {},
		selectOnly: () => {},
	} as unknown as Canvas & {
		_nodes: Map<string, CanvasNode>;
		_removedNodes: string[];
		_addedNodes: CanvasNode[];
	};
}

/**
 * 创建模拟的 XML 节点数据块
 */
function createNodeChunk(id: string, row: number, col: number, content: string): string {
	return `<node id="${id}" type="default" row="${row}" col="${col}">${content}</node>`;
}

/**
 * 生成有效的节点 ID
 */
const nodeIdArb = fc.string({ minLength: 1, maxLength: 10 })
	.filter(s => /^[a-zA-Z]/.test(s))
	.map(s => `node_${s.replace(/[^a-zA-Z0-9]/g, "")}`);

/**
 * 生成有效的组 ID
 */
const groupIdArb = fc.string({ minLength: 1, maxLength: 10 })
	.filter(s => /^[a-zA-Z]/.test(s))
	.map(s => `group_${s.replace(/[^a-zA-Z0-9]/g, "")}`);

/**
 * 生成有效的坐标
 */
const coordArb = fc.integer({ min: 0, max: 10 });

/**
 * 生成有效的像素坐标
 */
const pixelCoordArb = fc.integer({ min: 0, max: 2000 });

/**
 * 生成有效的尺寸
 */
const sizeArb = fc.integer({ min: 100, max: 800 });

/**
 * 生成有效的节点内容
 */
const nodeContentArb = fc.string({ minLength: 1, maxLength: 100 })
	.map(s => s.replace(/[<>&"']/g, "")); // 移除 XML 特殊字符

// ============================================================================
// Property 3: Regeneration Clears and Preserves
// ============================================================================

describe("Property 3: Regeneration Clears and Preserves", () => {
	/**
	 * Property 3: 重新生成清除并保留
	 *
	 * 对于任何具有现有子节点的组，当使用该组的 targetGroupId 触发重新生成时，
	 * 现有子节点应在新内容到达之前被清除，
	 * 且组的位置（x, y）在整个重新生成过程中应保持不变。
	 *
	 * **Validates: Requirements 2.4, 6.2, 6.3**
	 */

	it("should clear existing nodes when regenerating a group", async () => {
		await fc.assert(
			fc.asyncProperty(
				groupIdArb,
				fc.array(nodeIdArb, { minLength: 1, maxLength: 5 }),
				pixelCoordArb,
				pixelCoordArb,
				sizeArb,
				sizeArb,
				async (groupId, existingNodeIds, groupX, groupY, groupWidth, groupHeight) => {
					// 确保节点 ID 唯一
					const uniqueNodeIds = existingNodeIds.map((id, i) => `${id}_${i}`);

					// 创建 mock canvas
					const canvas = createMockCanvas();

					// 创建组节点
					const groupNode: CanvasNode = {
						id: groupId,
						x: groupX,
						y: groupY,
						width: groupWidth,
						height: groupHeight,
						text: "",
						color: "",
						getData: () => ({ id: groupId }),
						setData: () => {},
						setText: async () => {},
					} as unknown as CanvasNode;
					canvas.nodes.set(groupId, groupNode);

					// 创建现有子节点并添加到 canvas
					for (const nodeId of uniqueNodeIds) {
						const childNode: CanvasNode = {
							id: nodeId,
							x: groupX + 20,
							y: groupY + 20,
							width: 200,
							height: 100,
							text: "existing content",
							color: "",
							getData: () => ({ id: nodeId }),
							setData: () => {},
							setText: async () => {},
						} as unknown as CanvasNode;
						canvas.nodes.set(nodeId, childNode);
					}

					// 创建 mock 流式响应
					const newNodeId = "new_node_1";
					const mockStreamFn = createMockStreamResponseFn([
						createNodeChunk(newNodeId, 0, 0, "new content"),
					]);

					// 创建 hook
					const settings = createMockSettings();
					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					// 获取渲染器并设置组成员
					const renderer = groupStream.getRenderer();
					if (renderer) {
						// 设置组成员
						renderer.setGroupMembers(groupId, uniqueNodeIds);

						// 重要：还需要将节点添加到渲染器的 createdNodes 中
						// 通过模拟创建节点来实现
						for (const nodeId of uniqueNodeIds) {
							const node = canvas.nodes.get(nodeId);
							if (node) {
								// 使用内部方法注册节点（通过 createNode 的副作用）
								(renderer as any).createdNodes.set(nodeId, node);
							}
						}
					}

					// 执行重新生成
					await groupStream.regenerateGroup(groupId, [
						{ role: "user", content: "regenerate" },
					]);

					// 验证：现有节点应该被清除
					// Requirements: 6.2 - 清除现有节点
					for (const nodeId of uniqueNodeIds) {
						expect(canvas._removedNodes).toContain(nodeId);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should preserve group position during regeneration", async () => {
		await fc.assert(
			fc.asyncProperty(
				groupIdArb,
				pixelCoordArb,
				pixelCoordArb,
				sizeArb,
				sizeArb,
				async (groupId, groupX, groupY, groupWidth, groupHeight) => {
					// 创建 mock canvas
					const canvas = createMockCanvas();

					// 记录原始位置
					const originalPosition = { x: groupX, y: groupY };

					// 创建组节点
					let currentX = groupX;
					let currentY = groupY;
					const groupNode: CanvasNode = {
						id: groupId,
						get x() { return currentX; },
						get y() { return currentY; },
						width: groupWidth,
						height: groupHeight,
						text: "",
						color: "",
						getData: () => ({ id: groupId, x: currentX, y: currentY }),
						setData: (data: any) => {
							if (data.x !== undefined) currentX = data.x;
							if (data.y !== undefined) currentY = data.y;
						},
						setText: async () => {},
					} as unknown as CanvasNode;
					canvas.nodes.set(groupId, groupNode);

					// 创建 mock 流式响应
					const mockStreamFn = createMockStreamResponseFn([
						createNodeChunk("new_node_1", 0, 0, "content 1"),
						createNodeChunk("new_node_2", 1, 0, "content 2"),
					]);

					// 创建 hook
					const settings = createMockSettings();
					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					// 执行重新生成
					await groupStream.regenerateGroup(groupId, [
						{ role: "user", content: "regenerate" },
					]);

					// 验证：组位置应该保持不变
					// Requirements: 6.3 - 保留组位置
					const finalGroupNode = canvas.nodes.get(groupId);
					if (finalGroupNode) {
						expect(finalGroupNode.x).toBe(originalPosition.x);
						expect(finalGroupNode.y).toBe(originalPosition.y);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should use targetGroupId option when regenerating", async () => {
		await fc.assert(
			fc.asyncProperty(
				groupIdArb,
				async (groupId) => {
					// 创建 mock canvas
					const canvas = createMockCanvas();

					// 创建组节点
					const groupNode: CanvasNode = {
						id: groupId,
						x: 100,
						y: 100,
						width: 400,
						height: 300,
						text: "",
						color: "",
						getData: () => ({ id: groupId }),
						setData: () => {},
						setText: async () => {},
					} as unknown as CanvasNode;
					canvas.nodes.set(groupId, groupNode);

					// 追踪传递给 manager 的选项
					const capturedOptions: any = null;

					// 创建自定义 mock 流式响应
					const mockStreamFn: StreamResponseFunction = async (
						_apiKey,
						_messages,
						_config,
						callback
					) => {
						callback(createNodeChunk("node1", 0, 0, "content"));
						callback(null);
					};

					// 创建 hook
					const settings = createMockSettings();
					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					// 执行重新生成
					await groupStream.regenerateGroup(groupId, [
						{ role: "user", content: "regenerate" },
					]);

					// 验证：manager 应该收到正确的 targetGroupId
					// Requirements: 2.4, 2.5 - targetGroupId 支持
					const manager = groupStream.getManager();
					const options = manager.getCurrentOptions();

					expect(options).not.toBeNull();
					expect(options?.targetGroupId).toBe(groupId);
					expect(options?.clearExisting).toBe(true);
					expect(options?.preserveBounds).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should handle regeneration with empty group", async () => {
		await fc.assert(
			fc.asyncProperty(
				groupIdArb,
				pixelCoordArb,
				pixelCoordArb,
				async (groupId, groupX, groupY) => {
					// 创建 mock canvas
					const canvas = createMockCanvas();

					// 创建空组节点（没有子节点）
					const groupNode: CanvasNode = {
						id: groupId,
						x: groupX,
						y: groupY,
						width: 400,
						height: 300,
						text: "",
						color: "",
						getData: () => ({ id: groupId }),
						setData: () => {},
						setText: async () => {},
					} as unknown as CanvasNode;
					canvas.nodes.set(groupId, groupNode);

					// 创建 mock 流式响应
					const mockStreamFn = createMockStreamResponseFn([
						createNodeChunk("new_node_1", 0, 0, "new content"),
					]);

					// 创建 hook
					const settings = createMockSettings();
					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					// 执行重新生成（不应该抛出错误）
					await groupStream.regenerateGroup(groupId, [
						{ role: "user", content: "regenerate" },
					]);

					// 验证：应该成功完成
					expect(groupStream.status).toBe("complete");
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should reset state before regeneration", async () => {
		await fc.assert(
			fc.asyncProperty(
				groupIdArb,
				async (groupId) => {
					// 创建 mock canvas
					const canvas = createMockCanvas();

					// 创建组节点
					const groupNode: CanvasNode = {
						id: groupId,
						x: 100,
						y: 100,
						width: 400,
						height: 300,
						text: "",
						color: "",
						getData: () => ({ id: groupId }),
						setData: () => {},
						setText: async () => {},
					} as unknown as CanvasNode;
					canvas.nodes.set(groupId, groupNode);

					// 创建 mock 流式响应
					const mockStreamFn = createMockStreamResponseFn([
						createNodeChunk("node1", 0, 0, "content"),
					]);

					// 创建 hook
					const settings = createMockSettings();
					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					// 第一次生成
					await groupStream.startGeneration([
						{ role: "user", content: "first" },
					]);

					const nodesAfterFirst = groupStream.nodes.length;

					// 重新生成
					await groupStream.regenerateGroup(groupId, [
						{ role: "user", content: "regenerate" },
					]);

					// 验证：状态应该被重置
					// Requirements: 2.4 - 重置逻辑
					expect(groupStream.status).toBe("complete");
					expect(groupStream.error).toBeNull();
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should call clearGroup on renderer during regeneration", async () => {
		await fc.assert(
			fc.asyncProperty(
				groupIdArb,
				fc.array(nodeIdArb, { minLength: 1, maxLength: 3 }),
				async (groupId, existingNodeIds) => {
					// 确保节点 ID 唯一
					const uniqueNodeIds = existingNodeIds.map((id, i) => `${id}_${i}`);

					// 创建 mock canvas
					const canvas = createMockCanvas();

					// 创建组节点
					const groupNode: CanvasNode = {
						id: groupId,
						x: 100,
						y: 100,
						width: 400,
						height: 300,
						text: "",
						color: "",
						getData: () => ({ id: groupId }),
						setData: () => {},
						setText: async () => {},
					} as unknown as CanvasNode;
					canvas.nodes.set(groupId, groupNode);

					// 创建现有子节点
					for (const nodeId of uniqueNodeIds) {
						const childNode: CanvasNode = {
							id: nodeId,
							x: 120,
							y: 120,
							width: 200,
							height: 100,
							text: "existing",
							color: "",
							getData: () => ({ id: nodeId }),
							setData: () => {},
							setText: async () => {},
						} as unknown as CanvasNode;
						canvas.nodes.set(nodeId, childNode);
					}

					// 创建 mock 流式响应
					const mockStreamFn = createMockStreamResponseFn([
						createNodeChunk("new_node", 0, 0, "new content"),
					]);

					// 创建 hook
					const settings = createMockSettings();
					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					// 设置渲染器的组成员
					const renderer = groupStream.getRenderer();
					if (renderer) {
						renderer.setGroupMembers(groupId, uniqueNodeIds);
					}

					// 执行重新生成
					await groupStream.regenerateGroup(groupId, [
						{ role: "user", content: "regenerate" },
					]);

					// 验证：渲染器的组成员应该被清除
					if (renderer) {
						const members = renderer.getGroupMembers(groupId);
						expect(members.length).toBe(0);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});

// ============================================================================
// 辅助测试：状态管理
// ============================================================================

describe("useGroupStream State Management", () => {
	it("should expose correct initial state", () => {
		fc.assert(
			fc.property(
				fc.constant(null),
				() => {
					const canvas = createMockCanvas();
					const settings = createMockSettings();

					const mockStreamFn = createMockStreamResponseFn([]);

					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					expect(groupStream.status).toBe("idle");
					expect(groupStream.nodes).toEqual([]);
					expect(groupStream.edges).toEqual([]);
					expect(groupStream.error).toBeNull();
					expect(groupStream.progress).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should update status during generation", async () => {
		await fc.assert(
			fc.asyncProperty(
				nodeIdArb,
				async (nodeId) => {
					const canvas = createMockCanvas();
					const settings = createMockSettings();

					const statusHistory: string[] = [];

					const mockStreamFn = createMockStreamResponseFn([
						createNodeChunk(nodeId, 0, 0, "content"),
					]);

					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
						onStart: () => statusHistory.push("streaming"),
						onComplete: () => statusHistory.push("complete"),
					});

					statusHistory.push(groupStream.status);

					await groupStream.startGeneration([
						{ role: "user", content: "test" },
					]);

					// 验证状态转换
					expect(statusHistory).toContain("idle");
					expect(statusHistory).toContain("complete");
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should reset state correctly", () => {
		fc.assert(
			fc.property(
				fc.constant(null),
				() => {
					const canvas = createMockCanvas();
					const settings = createMockSettings();

					const mockStreamFn = createMockStreamResponseFn([]);

					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					// 重置
					groupStream.reset();

					// 验证状态
					expect(groupStream.status).toBe("idle");
					expect(groupStream.nodes).toEqual([]);
					expect(groupStream.edges).toEqual([]);
					expect(groupStream.error).toBeNull();
					expect(groupStream.progress).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should provide access to manager and renderer", () => {
		fc.assert(
			fc.property(
				fc.constant(null),
				() => {
					const canvas = createMockCanvas();
					const settings = createMockSettings();

					const mockStreamFn = createMockStreamResponseFn([]);

					const groupStream = useGroupStream({
						canvas,
						settings,
						streamResponseFn: mockStreamFn,
					});

					// 验证可以访问内部组件
					expect(groupStream.getManager()).toBeDefined();
					expect(groupStream.getRenderer()).toBeDefined();
				}
			),
			{ numRuns: 100 }
		);
	});
});

