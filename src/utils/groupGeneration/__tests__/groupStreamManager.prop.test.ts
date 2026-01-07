/**
 * 组流管理器属性测试
 *
 * Feature: group-generation-refactor
 *
 * 这些测试使用 fast-check 验证 GroupStreamManager 的属性，
 * 确保流式状态转换的正确性和生命周期回调的顺序。
 */

import * as fc from "fast-check";
import { GroupStreamManager, StreamCallback, StreamResponseFunction } from "../groupStreamManager";
import { StreamingStatus, StreamingCallbacks } from "../types";

// ============================================================================
// 测试辅助函数和生成器
// ============================================================================

/**
 * 创建模拟的 XML 数据块
 */
function createNodeChunk(id: string, row: number, col: number, content: string): string {
	return `<node id="${id}" type="default" row="${row}" col="${col}">${content}</node>`;
}

/**
 * 创建模拟的边数据块
 */
function createEdgeChunk(from: string, to: string, label?: string): string {
	const labelAttr = label ? ` label="${label}"` : "";
	return `<edge from="${from}" to="${to}" dir="forward"${labelAttr}/>`;
}

/**
 * 创建模拟的流式响应函数
 * 用于测试，可以控制返回的数据块
 */
function createMockStreamResponse(chunks: string[], delayMs: number = 0): StreamResponseFunction {
	return async (_apiKey, _messages, _config, callback) => {
		for (const chunk of chunks) {
			if (delayMs > 0) {
				await new Promise(resolve => setTimeout(resolve, delayMs));
			}
			callback(chunk);
		}
		// 流结束
		callback(null);
	};
}

/**
 * 创建会抛出错误的流式响应函数
 */
function createErrorStreamResponse(error: Error): StreamResponseFunction {
	return async (_apiKey, _messages, _config, callback) => {
		callback(null, error);
	};
}

/**
 * 生成有效的节点 ID
 */
const nodeIdArb = fc.string({ minLength: 1, maxLength: 10 })
	.filter(s => /^[a-zA-Z]/.test(s))
	.map(s => `node_${s.replace(/[^a-zA-Z0-9]/g, "")}`);

/**
 * 生成有效的节点内容
 */
const nodeContentArb = fc.string({ minLength: 1, maxLength: 100 })
	.map(s => s.replace(/[<>&"']/g, "")); // 移除 XML 特殊字符

/**
 * 生成有效的行/列坐标
 */
const coordArb = fc.integer({ min: 0, max: 10 });

/**
 * 有效的状态转换定义
 */
const VALID_TRANSITIONS: Record<StreamingStatus, StreamingStatus[]> = {
	"idle": ["streaming"],
	"streaming": ["complete", "error", "idle"],
	"complete": ["idle", "streaming"],
	"error": ["idle", "streaming"],
};

/**
 * 检查状态转换是否有效
 */
function isValidTransition(from: StreamingStatus, to: StreamingStatus): boolean {
	return VALID_TRANSITIONS[from].includes(to);
}

// ============================================================================
// Property 2: 流式状态转换
// ============================================================================

describe("Property 2: Streaming Status Transitions", () => {
	/**
	 * Property 2: 流式状态转换
	 *
	 * 对于任何流式生命周期，状态应按有效顺序转换：
	 * idle → streaming → (complete | error)，
	 * 且不应跳过状态或向后转换（除非通过显式 reset）。
	 *
	 * **Validates: Requirements 2.6**
	 */

	it("should start in idle state", () => {
		fc.assert(
			fc.property(
				fc.constant(null),
				() => {
					const manager = new GroupStreamManager();
					const state = manager.getState();

					expect(state.status).toBe("idle");
					expect(state.nodes.size).toBe(0);
					expect(state.edges.length).toBe(0);
					expect(state.error).toBeNull();
					expect(state.progress).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should transition idle → streaming → complete on successful generation", async () => {
		await fc.assert(
			fc.asyncProperty(
				nodeIdArb,
				coordArb,
				coordArb,
				nodeContentArb,
				async (nodeId, row, col, content) => {
					const statusHistory: StreamingStatus[] = [];

					const callbacks: StreamingCallbacks = {
						onStart: () => statusHistory.push("streaming"),
						onComplete: () => statusHistory.push("complete"),
					};

					const mockStream = createMockStreamResponse([
						createNodeChunk(nodeId, row, col, content)
					]);

					const manager = new GroupStreamManager(callbacks, mockStream);
					statusHistory.push(manager.getState().status); // 记录初始状态

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// 验证状态转换顺序
					expect(statusHistory).toEqual(["idle", "streaming", "complete"]);
					expect(manager.getState().status).toBe("complete");
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should transition idle → streaming → error on failed generation", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 50 }),
				async (errorMessage) => {
					const statusHistory: StreamingStatus[] = [];

					const callbacks: StreamingCallbacks = {
						onStart: () => statusHistory.push("streaming"),
						onError: () => statusHistory.push("error"),
					};

					const mockStream = createErrorStreamResponse(new Error(errorMessage));

					const manager = new GroupStreamManager(callbacks, mockStream);
					statusHistory.push(manager.getState().status);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// 验证状态转换顺序
					expect(statusHistory).toEqual(["idle", "streaming", "error"]);
					expect(manager.getState().status).toBe("error");
					expect(manager.getError()?.message).toBe(errorMessage);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should not process chunks when not in streaming state", () => {
		fc.assert(
			fc.property(
				nodeIdArb,
				coordArb,
				coordArb,
				nodeContentArb,
				(nodeId, row, col, content) => {
					const manager = new GroupStreamManager();
					const chunk = createNodeChunk(nodeId, row, col, content);

					// 在 idle 状态下调用 processChunk
					manager.processChunk(chunk);

					// 状态应保持不变
					const state = manager.getState();
					expect(state.status).toBe("idle");
					expect(state.nodes.size).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should reset to idle state when reset is called", () => {
		fc.assert(
			fc.property(
				fc.constant(null),
				() => {
					const manager = new GroupStreamManager();

					// 调用 reset
					manager.reset();

					// 应该回到 idle 状态
					const state = manager.getState();
					expect(state.status).toBe("idle");
					expect(state.nodes.size).toBe(0);
					expect(state.edges.length).toBe(0);
					expect(state.error).toBeNull();
					expect(state.progress).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should maintain valid state transitions", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.constantFrom("reset", "abort") as fc.Arbitrary<"reset" | "abort">,
					{ minLength: 1, maxLength: 10 }
				),
				(actions) => {
					const manager = new GroupStreamManager();
					const statusHistory: StreamingStatus[] = [manager.getState().status];

					for (const action of actions) {
						if (action === "reset") {
							manager.reset();
						} else if (action === "abort") {
							manager.abort();
						}

						const newStatus = manager.getState().status;
						const prevStatus = statusHistory[statusHistory.length - 1];

						// reset 总是导致 idle 状态
						if (action === "reset") {
							expect(newStatus).toBe("idle");
						}

						// abort 在非 streaming 状态下不改变状态
						if (action === "abort" && prevStatus !== "streaming") {
							expect(newStatus).toBe(prevStatus);
						}

						statusHistory.push(newStatus);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should validate all possible state transitions", () => {
		// 测试所有有效的状态转换
		const allStatuses: StreamingStatus[] = ["idle", "streaming", "complete", "error"];

		for (const fromStatus of allStatuses) {
			for (const toStatus of allStatuses) {
				const isValid = isValidTransition(fromStatus, toStatus);

				// 验证我们的转换表是正确的
				if (fromStatus === "idle") {
					expect(isValid).toBe(toStatus === "streaming");
				} else if (fromStatus === "streaming") {
					expect(isValid).toBe(["complete", "error", "idle"].includes(toStatus));
				} else if (fromStatus === "complete" || fromStatus === "error") {
					expect(isValid).toBe(["idle", "streaming"].includes(toStatus));
				}
			}
		}
	});

	it("should never skip states in normal flow", () => {
		// idle 不能直接跳到 complete 或 error
		expect(isValidTransition("idle", "complete")).toBe(false);
		expect(isValidTransition("idle", "error")).toBe(false);

		// streaming 不能跳回 idle（除非通过 abort/reset）
		// 但在我们的实现中，abort 会将状态设为 idle
		expect(isValidTransition("streaming", "idle")).toBe(true);
	});

	it("should handle multiple reset calls gracefully", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 1, max: 10 }),
				(resetCount) => {
					const manager = new GroupStreamManager();

					for (let i = 0; i < resetCount; i++) {
						manager.reset();
						expect(manager.getState().status).toBe("idle");
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should clear all state on reset", () => {
		fc.assert(
			fc.property(
				fc.constant(null),
				() => {
					const manager = new GroupStreamManager();

					// 重置后验证所有状态都被清除
					manager.reset();

					const state = manager.getState();
					expect(state.status).toBe("idle");
					expect(state.nodes.size).toBe(0);
					expect(state.edges.length).toBe(0);
					expect(state.error).toBeNull();
					expect(state.progress).toBe(0);
					expect(manager.getCurrentOptions()).toBeNull();
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should allow restart after complete", async () => {
		await fc.assert(
			fc.asyncProperty(
				nodeIdArb,
				nodeIdArb,
				async (nodeId1, nodeId2) => {
					const mockStream1 = createMockStreamResponse([
						createNodeChunk(nodeId1, 0, 0, "content1")
					]);
					const mockStream2 = createMockStreamResponse([
						createNodeChunk(nodeId2, 0, 0, "content2")
					]);

					const manager = new GroupStreamManager({}, mockStream1);

					// 第一次生成
					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test1" }],
						{ model: "test-model" }
					);
					expect(manager.getState().status).toBe("complete");

					// 设置新的流式响应函数并重新开始
					manager.setStreamResponseFunction(mockStream2);
					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test2" }],
						{ model: "test-model" }
					);

					expect(manager.getState().status).toBe("complete");
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should allow restart after error", async () => {
		await fc.assert(
			fc.asyncProperty(
				nodeIdArb,
				async (nodeId) => {
					const errorStream = createErrorStreamResponse(new Error("test error"));
					const successStream = createMockStreamResponse([
						createNodeChunk(nodeId, 0, 0, "content")
					]);

					const manager = new GroupStreamManager({}, errorStream);

					// 第一次生成（失败）
					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test1" }],
						{ model: "test-model" }
					);
					expect(manager.getState().status).toBe("error");

					// 设置新的流式响应函数并重新开始
					manager.setStreamResponseFunction(successStream);
					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test2" }],
						{ model: "test-model" }
					);

					expect(manager.getState().status).toBe("complete");
				}
			),
			{ numRuns: 100 }
		);
	});
});

// ============================================================================
// 状态查询方法测试
// ============================================================================

describe("State Query Methods", () => {
	it("should correctly report streaming status", () => {
		const manager = new GroupStreamManager();

		// 初始状态
		expect(manager.isStreaming()).toBe(false);
		expect(manager.isComplete()).toBe(false);
		expect(manager.hasError()).toBe(false);
	});

	it("should return state copy to prevent external mutation", () => {
		fc.assert(
			fc.property(
				fc.constant(null),
				() => {
					const manager = new GroupStreamManager();

					const state1 = manager.getState();
					const state2 = manager.getState();

					// 应该是不同的对象
					expect(state1).not.toBe(state2);
					expect(state1.nodes).not.toBe(state2.nodes);
					expect(state1.edges).not.toBe(state2.edges);

					// 但内容应该相同
					expect(state1.status).toBe(state2.status);
					expect(state1.nodes.size).toBe(state2.nodes.size);
					expect(state1.edges.length).toBe(state2.edges.length);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should return empty arrays for nodes and edges initially", () => {
		const manager = new GroupStreamManager();

		expect(manager.getNodes()).toEqual([]);
		expect(manager.getEdges()).toEqual([]);
	});

	it("should return undefined for non-existent node", () => {
		fc.assert(
			fc.property(
				nodeIdArb,
				(nodeId) => {
					const manager = new GroupStreamManager();
					expect(manager.getNodeById(nodeId)).toBeUndefined();
				}
			),
			{ numRuns: 100 }
		);
	});
});

// ============================================================================
// 回调设置测试
// ============================================================================

describe("Callback Management", () => {
	it("should accept callbacks in constructor", () => {
		const callbacks: StreamingCallbacks = {
			onStart: jest.fn(),
			onComplete: jest.fn(),
			onError: jest.fn(),
		};

		const manager = new GroupStreamManager(callbacks);

		// 验证 manager 创建成功
		expect(manager.getState().status).toBe("idle");
	});

	it("should allow updating callbacks", () => {
		const manager = new GroupStreamManager();

		const newCallbacks: StreamingCallbacks = {
			onStart: jest.fn(),
			onProgress: jest.fn(),
		};

		manager.setCallbacks(newCallbacks);

		// 验证 manager 仍然正常工作
		expect(manager.getState().status).toBe("idle");
	});

	it("should handle empty callbacks gracefully", () => {
		const manager = new GroupStreamManager({});

		// 应该不会抛出错误
		manager.reset();
		expect(manager.getState().status).toBe("idle");
	});
});

// ============================================================================
// Property 7: 生命周期回调
// ============================================================================

describe("Property 7: Lifecycle Callbacks", () => {
	/**
	 * Property 7: 生命周期回调
	 *
	 * 对于任何生成操作，适当的生命周期回调应按顺序调用：
	 * onStart（开始时调用一次），onProgress（流式传输期间调用零次或多次），
	 * 以及最后恰好调用 onComplete 或 onError 之一。
	 *
	 * **Validates: Requirements 6.5**
	 */

	it("should call onStart exactly once at the beginning", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						id: nodeIdArb,
						row: coordArb,
						col: coordArb,
						content: nodeContentArb,
					}),
					{ minLength: 1, maxLength: 5 }
				),
				async (nodes) => {
					let startCallCount = 0;

					const callbacks: StreamingCallbacks = {
						onStart: () => { startCallCount++; },
					};

					const chunks = nodes.map(n => createNodeChunk(n.id, n.row, n.col, n.content));
					const mockStream = createMockStreamResponse(chunks);

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// onStart 应该恰好被调用一次
					expect(startCallCount).toBe(1);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should call onComplete exactly once on successful completion", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						id: nodeIdArb,
						row: coordArb,
						col: coordArb,
						content: nodeContentArb,
					}),
					{ minLength: 1, maxLength: 5 }
				),
				async (nodes) => {
					let completeCallCount = 0;
					let errorCallCount = 0;

					const callbacks: StreamingCallbacks = {
						onComplete: () => { completeCallCount++; },
						onError: () => { errorCallCount++; },
					};

					const chunks = nodes.map(n => createNodeChunk(n.id, n.row, n.col, n.content));
					const mockStream = createMockStreamResponse(chunks);

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// onComplete 应该恰好被调用一次
					expect(completeCallCount).toBe(1);
					// onError 不应该被调用
					expect(errorCallCount).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should call onError exactly once on failure", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.string({ minLength: 1, maxLength: 50 }),
				async (errorMessage) => {
					let completeCallCount = 0;
					let errorCallCount = 0;
					let receivedError: Error | undefined = undefined;

					const callbacks: StreamingCallbacks = {
						onComplete: () => { completeCallCount++; },
						onError: (error: Error) => {
							errorCallCount++;
							receivedError = error;
						},
					};

					const mockStream = createErrorStreamResponse(new Error(errorMessage));

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// onError 应该恰好被调用一次
					expect(errorCallCount).toBe(1);
					// onComplete 不应该被调用
					expect(completeCallCount).toBe(0);
					// 错误消息应该正确传递
					expect(receivedError).toBeDefined();
					expect((receivedError as unknown as Error).message).toBe(errorMessage);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should call callbacks in correct order: onStart → onProgress* → onComplete", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						id: nodeIdArb,
						row: coordArb,
						col: coordArb,
						content: nodeContentArb,
					}),
					{ minLength: 2, maxLength: 5 }
				),
				async (nodes) => {
					const callOrder: string[] = [];

					const callbacks: StreamingCallbacks = {
						onStart: () => { callOrder.push("start"); },
						onProgress: () => { callOrder.push("progress"); },
						onComplete: () => { callOrder.push("complete"); },
						onError: () => { callOrder.push("error"); },
					};

					const chunks = nodes.map(n => createNodeChunk(n.id, n.row, n.col, n.content));
					const mockStream = createMockStreamResponse(chunks);

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// 验证顺序
					expect(callOrder.length).toBeGreaterThanOrEqual(2);
					expect(callOrder[0]).toBe("start");
					expect(callOrder[callOrder.length - 1]).toBe("complete");

					// 中间应该只有 progress 调用
					for (let i = 1; i < callOrder.length - 1; i++) {
						expect(callOrder[i]).toBe("progress");
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should call callbacks in correct order: onStart → onProgress* → onError", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						id: nodeIdArb,
						row: coordArb,
						col: coordArb,
						content: nodeContentArb,
					}),
					{ minLength: 1, maxLength: 3 }
				),
				fc.string({ minLength: 1, maxLength: 50 }),
				async (nodes, errorMessage) => {
					const callOrder: string[] = [];

					const callbacks: StreamingCallbacks = {
						onStart: () => { callOrder.push("start"); },
						onProgress: () => { callOrder.push("progress"); },
						onComplete: () => { callOrder.push("complete"); },
						onError: () => { callOrder.push("error"); },
					};

					// 创建一个先发送一些数据然后失败的流
					const mockStream: StreamResponseFunction = async (_apiKey, _messages, _config, callback) => {
						// 发送一些数据块
						for (const node of nodes) {
							callback(createNodeChunk(node.id, node.row, node.col, node.content));
						}
						// 然后发送错误
						callback(null, new Error(errorMessage));
					};

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// 验证顺序
					expect(callOrder.length).toBeGreaterThanOrEqual(2);
					expect(callOrder[0]).toBe("start");
					expect(callOrder[callOrder.length - 1]).toBe("error");

					// 中间应该只有 progress 调用
					for (let i = 1; i < callOrder.length - 1; i++) {
						expect(callOrder[i]).toBe("progress");
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should call onNodeCreated for each new node", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						id: nodeIdArb,
						row: coordArb,
						col: coordArb,
						content: nodeContentArb,
					}),
					{ minLength: 1, maxLength: 5 }
				),
				async (nodes) => {
					// 确保节点 ID 唯一
					const uniqueNodes = nodes.map((n, i) => ({
						...n,
						id: `${n.id}_${i}`,
					}));

					const createdNodeIds: string[] = [];

					const callbacks: StreamingCallbacks = {
						onNodeCreated: (nodeId) => { createdNodeIds.push(nodeId); },
					};

					const chunks = uniqueNodes.map(n => createNodeChunk(n.id, n.row, n.col, n.content));
					const mockStream = createMockStreamResponse(chunks);

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// 每个节点都应该触发 onNodeCreated
					expect(createdNodeIds.length).toBe(uniqueNodes.length);
					for (const node of uniqueNodes) {
						expect(createdNodeIds).toContain(node.id);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should call onEdgeCreated for each new edge", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						from: nodeIdArb,
						to: nodeIdArb,
					}),
					{ minLength: 1, maxLength: 5 }
				),
				async (edges) => {
					// 确保边唯一
					const uniqueEdges = edges.map((e, i) => ({
						from: `${e.from}_${i}`,
						to: `${e.to}_${i}`,
					}));

					const createdEdges: Array<{ from: string; to: string }> = [];

					const callbacks: StreamingCallbacks = {
						onEdgeCreated: (edge) => {
							createdEdges.push({ from: edge.from, to: edge.to });
						},
					};

					const chunks = uniqueEdges.map(e => createEdgeChunk(e.from, e.to));
					const mockStream = createMockStreamResponse(chunks);

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// 每条边都应该触发 onEdgeCreated
					expect(createdEdges.length).toBe(uniqueEdges.length);
					for (const edge of uniqueEdges) {
						expect(createdEdges).toContainEqual({ from: edge.from, to: edge.to });
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should not call onComplete and onError together", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.boolean(),
				async (shouldSucceed) => {
					let completeCallCount = 0;
					let errorCallCount = 0;

					const callbacks: StreamingCallbacks = {
						onComplete: () => { completeCallCount++; },
						onError: () => { errorCallCount++; },
					};

					const mockStream = shouldSucceed
						? createMockStreamResponse([createNodeChunk("node1", 0, 0, "content")])
						: createErrorStreamResponse(new Error("test error"));

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// 恰好调用其中一个
					expect(completeCallCount + errorCallCount).toBe(1);

					if (shouldSucceed) {
						expect(completeCallCount).toBe(1);
						expect(errorCallCount).toBe(0);
					} else {
						expect(completeCallCount).toBe(0);
						expect(errorCallCount).toBe(1);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should handle missing callbacks gracefully", async () => {
		await fc.assert(
			fc.asyncProperty(
				nodeIdArb,
				async (nodeId) => {
					// 不提供任何回调
					const mockStream = createMockStreamResponse([
						createNodeChunk(nodeId, 0, 0, "content")
					]);

					const manager = new GroupStreamManager({}, mockStream);

					// 不应该抛出错误
					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					expect(manager.getState().status).toBe("complete");
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should call onProgress with increasing values", async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.array(
					fc.record({
						id: nodeIdArb,
						row: coordArb,
						col: coordArb,
						content: nodeContentArb,
					}),
					{ minLength: 3, maxLength: 8 }
				),
				async (nodes) => {
					// 确保节点 ID 唯一
					const uniqueNodes = nodes.map((n, i) => ({
						...n,
						id: `${n.id}_${i}`,
					}));

					const progressValues: number[] = [];

					const callbacks: StreamingCallbacks = {
						onProgress: (progress) => { progressValues.push(progress); },
					};

					const chunks = uniqueNodes.map(n => createNodeChunk(n.id, n.row, n.col, n.content));
					const mockStream = createMockStreamResponse(chunks);

					const manager = new GroupStreamManager(callbacks, mockStream);

					await manager.startGeneration(
						"test-api-key",
						[{ role: "user", content: "test" }],
						{ model: "test-model" }
					);

					// 进度值应该是非递减的
					for (let i = 1; i < progressValues.length; i++) {
						expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
					}

					// 最终进度应该是 100
					expect(manager.getState().progress).toBe(100);
				}
			),
			{ numRuns: 100 }
		);
	});
});
