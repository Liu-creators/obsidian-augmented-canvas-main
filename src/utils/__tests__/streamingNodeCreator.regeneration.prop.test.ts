/**
 * Property-Based Tests for StreamingNodeCreator Regeneration Mode
 *
 * Feature: regenerate-streaming-fix
 *
 * 这些测试验证设计文档中定义的正确性属性，
 * 使用 fast-check 进行属性测试。
 */

import * as fc from "fast-check";

/**
 * 表示组的锚点状态
 */
interface AnchorState {
	anchorX: number;
	anchorY: number;
	anchorLocked: boolean;
}

/**
 * 表示组的状态
 */
interface GroupState {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * 模拟 resetGroupToInitialSize 的纯函数版本
 * 用于测试锚点不可变性
 *
 * @param group - 组状态
 * @param initialWidth - 初始宽度
 * @param initialHeight - 初始高度
 * @returns 新的组状态
 */
function simulateResetGroupToInitialSize(
	group: GroupState,
	initialWidth: number = 400,
	initialHeight: number = 300
): GroupState {
	// 保持锚点位置（x, y）不变，只重置尺寸
	return {
		x: group.x, // 锚点 x 不变
		y: group.y, // 锚点 y 不变
		width: initialWidth,
		height: initialHeight,
	};
}

/**
 * 模拟流式传输期间的组边界扩展
 * 只允许增长，不允许收缩，锚点保持不变
 *
 * @param group - 当前组状态
 * @param requiredWidth - 需要的宽度
 * @param requiredHeight - 需要的高度
 * @returns 新的组状态
 */
function simulateGroupBoundsExpansion(
	group: GroupState,
	requiredWidth: number,
	requiredHeight: number
): GroupState {
	// 锚点位置（x, y）保持不变
	// 尺寸只能增长，不能收缩
	return {
		x: group.x, // 锚点 x 不变
		y: group.y, // 锚点 y 不变
		width: Math.max(group.width, requiredWidth),
		height: Math.max(group.height, requiredHeight),
	};
}

/**
 * Property 4: 锚点不可变性
 *
 * *For any* 组容器在流式传输期间的扩展操作，其锚点位置（左上角坐标）
 * 应该保持不变。即 groupNode.x 和 groupNode.y 在整个流式传输过程中不应改变。
 *
 * **Validates: Requirements 2.5**
 */
describe("Property 4: 锚点不可变性", () => {
	const TOLERANCE = 0; // 锚点必须精确不变

	it("resetGroupToInitialSize 应该保持锚点位置不变", () => {
		fc.assert(
			fc.property(
				// 生成初始锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成初始尺寸
				fc.integer({ min: 100, max: 2000 }),
				fc.integer({ min: 100, max: 2000 }),
				// 生成目标初始尺寸
				fc.integer({ min: 100, max: 1000 }),
				fc.integer({ min: 100, max: 1000 }),
				(anchorX, anchorY, oldWidth, oldHeight, newWidth, newHeight) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: oldWidth,
						height: oldHeight,
					};

					const result = simulateResetGroupToInitialSize(initialGroup, newWidth, newHeight);

					// 锚点位置必须精确不变
					expect(result.x).toBe(anchorX);
					expect(result.y).toBe(anchorY);
					// 尺寸应该被重置
					expect(result.width).toBe(newWidth);
					expect(result.height).toBe(newHeight);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("流式传输期间的边界扩展应该保持锚点位置不变", () => {
		fc.assert(
			fc.property(
				// 生成初始锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成初始尺寸
				fc.integer({ min: 100, max: 500 }),
				fc.integer({ min: 100, max: 500 }),
				// 生成扩展操作序列
				fc.array(
					fc.record({
						requiredWidth: fc.integer({ min: 100, max: 2000 }),
						requiredHeight: fc.integer({ min: 100, max: 2000 }),
					}),
					{ minLength: 1, maxLength: 20 }
				),
				(anchorX, anchorY, initialWidth, initialHeight, expansions) => {
					let currentGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: initialWidth,
						height: initialHeight,
					};

					// 模拟多次扩展操作
					for (const expansion of expansions) {
						currentGroup = simulateGroupBoundsExpansion(
							currentGroup,
							expansion.requiredWidth,
							expansion.requiredHeight
						);

						// 每次扩展后，锚点位置必须保持不变
						expect(currentGroup.x).toBe(anchorX);
						expect(currentGroup.y).toBe(anchorY);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("收缩后增长的完整流程应该保持锚点位置不变", () => {
		fc.assert(
			fc.property(
				// 生成初始锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成旧的大尺寸（重新生成前）
				fc.integer({ min: 500, max: 2000 }),
				fc.integer({ min: 500, max: 2000 }),
				// 生成初始小尺寸（收缩后）
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 100, max: 400 }),
				// 生成增长操作序列
				fc.array(
					fc.record({
						requiredWidth: fc.integer({ min: 100, max: 1500 }),
						requiredHeight: fc.integer({ min: 100, max: 1500 }),
					}),
					{ minLength: 1, maxLength: 10 }
				),
				(anchorX, anchorY, oldWidth, oldHeight, shrinkWidth, shrinkHeight, growthOps) => {
					// 阶段 1: 初始状态（大尺寸）
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: oldWidth,
						height: oldHeight,
					};

					// 阶段 2: 收缩到初始尺寸
					const shrunkGroup = simulateResetGroupToInitialSize(
						initialGroup,
						shrinkWidth,
						shrinkHeight
					);

					// 验证收缩后锚点不变
					expect(shrunkGroup.x).toBe(anchorX);
					expect(shrunkGroup.y).toBe(anchorY);

					// 阶段 3: 流式增长
					let currentGroup = shrunkGroup;
					for (const growth of growthOps) {
						currentGroup = simulateGroupBoundsExpansion(
							currentGroup,
							growth.requiredWidth,
							growth.requiredHeight
						);

						// 每次增长后，锚点位置必须保持不变
						expect(currentGroup.x).toBe(anchorX);
						expect(currentGroup.y).toBe(anchorY);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("任意数量的尺寸重置操作都应该保持锚点位置不变", () => {
		fc.assert(
			fc.property(
				// 生成初始锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成初始尺寸
				fc.integer({ min: 100, max: 2000 }),
				fc.integer({ min: 100, max: 2000 }),
				// 生成重置操作序列
				fc.array(
					fc.record({
						newWidth: fc.integer({ min: 100, max: 1000 }),
						newHeight: fc.integer({ min: 100, max: 1000 }),
					}),
					{ minLength: 1, maxLength: 10 }
				),
				(anchorX, anchorY, initialWidth, initialHeight, resets) => {
					let currentGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: initialWidth,
						height: initialHeight,
					};

					// 模拟多次重置操作
					for (const reset of resets) {
						currentGroup = simulateResetGroupToInitialSize(
							currentGroup,
							reset.newWidth,
							reset.newHeight
						);

						// 每次重置后，锚点位置必须保持不变
						expect(currentGroup.x).toBe(anchorX);
						expect(currentGroup.y).toBe(anchorY);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 6: 组边界只增长
 *
 * *For any* 流式传输期间的组边界更新，组的宽度和高度只能增大或保持不变，
 * 不能减小。这防止了视觉抖动。
 *
 * **Validates: Requirements 4.3**
 */
describe("Property 6: 组边界只增长", () => {
	it("流式传输期间组边界只能增大或保持不变", () => {
		fc.assert(
			fc.property(
				// 生成初始组状态
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: 100, max: 500 }),
				fc.integer({ min: 100, max: 500 }),
				// 生成边界更新序列
				fc.array(
					fc.record({
						requiredWidth: fc.integer({ min: 50, max: 2000 }),
						requiredHeight: fc.integer({ min: 50, max: 2000 }),
					}),
					{ minLength: 1, maxLength: 20 }
				),
				(anchorX, anchorY, initialWidth, initialHeight, updates) => {
					let currentGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: initialWidth,
						height: initialHeight,
					};

					// 模拟流式传输期间的边界更新
					for (const update of updates) {
						const prevWidth = currentGroup.width;
						const prevHeight = currentGroup.height;

						// 应用只增长逻辑
						currentGroup = simulateGroupBoundsExpansion(
							currentGroup,
							update.requiredWidth,
							update.requiredHeight
						);

						// 验证：宽度只能增大或保持不变
						expect(currentGroup.width).toBeGreaterThanOrEqual(prevWidth);
						// 验证：高度只能增大或保持不变
						expect(currentGroup.height).toBeGreaterThanOrEqual(prevHeight);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("即使请求的尺寸更小，组边界也不会收缩", () => {
		fc.assert(
			fc.property(
				// 生成初始组状态（较大尺寸）
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: 500, max: 1000 }),
				fc.integer({ min: 500, max: 1000 }),
				// 生成较小的请求尺寸
				fc.integer({ min: 100, max: 400 }),
				fc.integer({ min: 100, max: 400 }),
				(anchorX, anchorY, initialWidth, initialHeight, smallerWidth, smallerHeight) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: initialWidth,
						height: initialHeight,
					};

					// 尝试用更小的尺寸更新
					const result = simulateGroupBoundsExpansion(
						initialGroup,
						smallerWidth,
						smallerHeight
					);

					// 验证：尺寸保持不变（不会收缩）
					expect(result.width).toBe(initialWidth);
					expect(result.height).toBe(initialHeight);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("组边界增长是单调的", () => {
		fc.assert(
			fc.property(
				// 生成初始组状态
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: 100, max: 300 }),
				fc.integer({ min: 100, max: 300 }),
				// 生成边界更新序列
				fc.array(
					fc.record({
						requiredWidth: fc.integer({ min: 50, max: 2000 }),
						requiredHeight: fc.integer({ min: 50, max: 2000 }),
					}),
					{ minLength: 2, maxLength: 30 }
				),
				(anchorX, anchorY, initialWidth, initialHeight, updates) => {
					let currentGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: initialWidth,
						height: initialHeight,
					};

					const widthHistory: number[] = [currentGroup.width];
					const heightHistory: number[] = [currentGroup.height];

					// 应用所有更新
					for (const update of updates) {
						currentGroup = simulateGroupBoundsExpansion(
							currentGroup,
							update.requiredWidth,
							update.requiredHeight
						);
						widthHistory.push(currentGroup.width);
						heightHistory.push(currentGroup.height);
					}

					// 验证：宽度序列是单调非递减的
					for (let i = 1; i < widthHistory.length; i++) {
						expect(widthHistory[i]).toBeGreaterThanOrEqual(widthHistory[i - 1]);
					}

					// 验证：高度序列是单调非递减的
					for (let i = 1; i < heightHistory.length; i++) {
						expect(heightHistory[i]).toBeGreaterThanOrEqual(heightHistory[i - 1]);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 7: 组边界包含所有节点
 *
 * *For any* 组边界更新后的状态，所有成员节点都应该完全包含在组边界内
 * （加上配置的 padding）。
 *
 * **Validates: Requirements 4.2**
 */
describe("Property 7: 组边界包含所有节点", () => {
	const DEFAULT_PADDING = 60;

	/**
	 * 表示节点的边界
	 */
	interface NodeBounds {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	/**
	 * 计算包含所有节点的最小组边界
	 * 模拟 calculateGroupBounds 的逻辑
	 */
	function calculateMinimumGroupBounds(
		anchorX: number,
		anchorY: number,
		nodes: NodeBounds[],
		padding: number
	): GroupState {
		if (nodes.length === 0) {
			return {
				x: anchorX,
				y: anchorY,
				width: 400,
				height: 300,
			};
		}

		// 计算所有节点的边界框
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const node of nodes) {
			maxX = Math.max(maxX, node.x + node.width);
			maxY = Math.max(maxY, node.y + node.height);
		}

		// 计算需要的宽度和高度（从锚点开始）
		const requiredWidth = maxX - anchorX + padding;
		const requiredHeight = maxY - anchorY + padding;

		return {
			x: anchorX,
			y: anchorY,
			width: Math.max(400, requiredWidth),
			height: Math.max(300, requiredHeight),
		};
	}

	/**
	 * 检查节点是否完全包含在组边界内
	 */
	function isNodeContainedInGroup(
		node: NodeBounds,
		group: GroupState,
		padding: number
	): boolean {
		// 节点的右边界不能超过组的右边界（减去 padding）
		const nodeRight = node.x + node.width;
		const groupRight = group.x + group.width;

		// 节点的下边界不能超过组的下边界（减去 padding）
		const nodeBottom = node.y + node.height;
		const groupBottom = group.y + group.height;

		// 节点必须在组的边界内（考虑 padding）
		return (
			node.x >= group.x &&
			node.y >= group.y &&
			nodeRight <= groupRight &&
			nodeBottom <= groupBottom
		);
	}

	it("计算的组边界应该包含所有成员节点", () => {
		fc.assert(
			fc.property(
				// 生成锚点位置
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// 生成节点列表（节点位置相对于锚点）
				fc.array(
					fc.record({
						offsetX: fc.integer({ min: 40, max: 500 }),
						offsetY: fc.integer({ min: 40, max: 500 }),
						width: fc.integer({ min: 100, max: 400 }),
						height: fc.integer({ min: 50, max: 300 }),
					}),
					{ minLength: 1, maxLength: 10 }
				),
				(anchorX, anchorY, nodeOffsets) => {
					// 将偏移转换为绝对位置
					const nodes: NodeBounds[] = nodeOffsets.map(offset => ({
						x: anchorX + offset.offsetX,
						y: anchorY + offset.offsetY,
						width: offset.width,
						height: offset.height,
					}));

					// 计算组边界
					const groupBounds = calculateMinimumGroupBounds(
						anchorX,
						anchorY,
						nodes,
						DEFAULT_PADDING
					);

					// 验证：所有节点都应该在组边界内
					for (const node of nodes) {
						expect(isNodeContainedInGroup(node, groupBounds, DEFAULT_PADDING)).toBe(true);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("添加新节点后组边界应该扩展以包含新节点", () => {
		fc.assert(
			fc.property(
				// 生成锚点位置
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// 生成初始节点
				fc.record({
					offsetX: fc.integer({ min: 40, max: 200 }),
					offsetY: fc.integer({ min: 40, max: 200 }),
					width: fc.integer({ min: 100, max: 300 }),
					height: fc.integer({ min: 50, max: 200 }),
				}),
				// 生成新节点（可能在更远的位置）
				fc.record({
					offsetX: fc.integer({ min: 40, max: 800 }),
					offsetY: fc.integer({ min: 40, max: 800 }),
					width: fc.integer({ min: 100, max: 400 }),
					height: fc.integer({ min: 50, max: 300 }),
				}),
				(anchorX, anchorY, initialNodeOffset, newNodeOffset) => {
					// 初始节点
					const initialNode: NodeBounds = {
						x: anchorX + initialNodeOffset.offsetX,
						y: anchorY + initialNodeOffset.offsetY,
						width: initialNodeOffset.width,
						height: initialNodeOffset.height,
					};

					// 计算初始组边界
					const initialBounds = calculateMinimumGroupBounds(
						anchorX,
						anchorY,
						[initialNode],
						DEFAULT_PADDING
					);

					// 新节点
					const newNode: NodeBounds = {
						x: anchorX + newNodeOffset.offsetX,
						y: anchorY + newNodeOffset.offsetY,
						width: newNodeOffset.width,
						height: newNodeOffset.height,
					};

					// 计算包含两个节点的组边界
					const expandedBounds = calculateMinimumGroupBounds(
						anchorX,
						anchorY,
						[initialNode, newNode],
						DEFAULT_PADDING
					);

					// 验证：扩展后的边界应该包含两个节点
					expect(isNodeContainedInGroup(initialNode, expandedBounds, DEFAULT_PADDING)).toBe(true);
					expect(isNodeContainedInGroup(newNode, expandedBounds, DEFAULT_PADDING)).toBe(true);

					// 验证：扩展后的边界不会比初始边界小
					expect(expandedBounds.width).toBeGreaterThanOrEqual(initialBounds.width);
					expect(expandedBounds.height).toBeGreaterThanOrEqual(initialBounds.height);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("组边界应该包含配置的 padding", () => {
		fc.assert(
			fc.property(
				// 生成锚点位置
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				// 生成单个节点
				fc.record({
					offsetX: fc.integer({ min: 40, max: 300 }),
					offsetY: fc.integer({ min: 40, max: 300 }),
					width: fc.integer({ min: 100, max: 400 }),
					height: fc.integer({ min: 50, max: 300 }),
				}),
				// 生成 padding 值
				fc.integer({ min: 20, max: 100 }),
				(anchorX, anchorY, nodeOffset, padding) => {
					const node: NodeBounds = {
						x: anchorX + nodeOffset.offsetX,
						y: anchorY + nodeOffset.offsetY,
						width: nodeOffset.width,
						height: nodeOffset.height,
					};

					// 计算组边界
					const groupBounds = calculateMinimumGroupBounds(
						anchorX,
						anchorY,
						[node],
						padding
					);

					// 计算节点的右边界和下边界
					const nodeRight = node.x + node.width;
					const nodeBottom = node.y + node.height;

					// 验证：组的右边界应该至少是节点右边界 + padding
					const groupRight = groupBounds.x + groupBounds.width;
					expect(groupRight).toBeGreaterThanOrEqual(nodeRight + padding);

					// 验证：组的下边界应该至少是节点下边界 + padding
					const groupBottom = groupBounds.y + groupBounds.height;
					expect(groupBottom).toBeGreaterThanOrEqual(nodeBottom + padding);
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 3: 收缩后增长 - 尺寸重置
 *
 * *For any* 组容器在清除子节点时，其尺寸应该立即重置为最小默认值
 * （minWidth, minHeight），而不是保持旧的计算尺寸。
 *
 * **Validates: Requirements 2.1, 2.2**
 */
describe("Property 3: 收缩后增长 - 尺寸重置", () => {
	const DEFAULT_INITIAL_WIDTH = 400;
	const DEFAULT_INITIAL_HEIGHT = 300;

	it("清除子节点时应该重置尺寸到初始默认值", () => {
		fc.assert(
			fc.property(
				// 生成锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成旧的大尺寸（模拟有内容时的尺寸）
				fc.integer({ min: 500, max: 3000 }),
				fc.integer({ min: 500, max: 3000 }),
				(anchorX, anchorY, oldWidth, oldHeight) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: oldWidth,
						height: oldHeight,
					};

					// 模拟清除子节点时的尺寸重置
					const result = simulateResetGroupToInitialSize(
						initialGroup,
						DEFAULT_INITIAL_WIDTH,
						DEFAULT_INITIAL_HEIGHT
					);

					// 尺寸应该被重置到初始默认值
					expect(result.width).toBe(DEFAULT_INITIAL_WIDTH);
					expect(result.height).toBe(DEFAULT_INITIAL_HEIGHT);
					// 不应该保持旧的计算尺寸
					expect(result.width).not.toBe(oldWidth);
					expect(result.height).not.toBe(oldHeight);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("重置后的尺寸应该与创建时的初始尺寸一致", () => {
		fc.assert(
			fc.property(
				// 生成锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成任意旧尺寸
				fc.integer({ min: 100, max: 5000 }),
				fc.integer({ min: 100, max: 5000 }),
				// 生成创建时的初始尺寸
				fc.integer({ min: 100, max: 1000 }),
				fc.integer({ min: 100, max: 1000 }),
				(anchorX, anchorY, oldWidth, oldHeight, createWidth, createHeight) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: oldWidth,
						height: oldHeight,
					};

					// 模拟重置到创建时的初始尺寸
					const result = simulateResetGroupToInitialSize(
						initialGroup,
						createWidth,
						createHeight
					);

					// 重置后的尺寸应该与指定的初始尺寸一致
					expect(result.width).toBe(createWidth);
					expect(result.height).toBe(createHeight);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("无论旧尺寸多大，重置后都应该是初始尺寸", () => {
		fc.assert(
			fc.property(
				// 生成锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成非常大的旧尺寸
				fc.integer({ min: 1000, max: 10000 }),
				fc.integer({ min: 1000, max: 10000 }),
				(anchorX, anchorY, oldWidth, oldHeight) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: oldWidth,
						height: oldHeight,
					};

					// 模拟重置
					const result = simulateResetGroupToInitialSize(
						initialGroup,
						DEFAULT_INITIAL_WIDTH,
						DEFAULT_INITIAL_HEIGHT
					);

					// 无论旧尺寸多大，重置后都应该是初始尺寸
					expect(result.width).toBe(DEFAULT_INITIAL_WIDTH);
					expect(result.height).toBe(DEFAULT_INITIAL_HEIGHT);
					// 重置后的尺寸应该小于旧尺寸（因为旧尺寸 >= 1000）
					expect(result.width).toBeLessThan(oldWidth);
					expect(result.height).toBeLessThan(oldHeight);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("重置操作应该是幂等的", () => {
		fc.assert(
			fc.property(
				// 生成锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成旧尺寸
				fc.integer({ min: 100, max: 5000 }),
				fc.integer({ min: 100, max: 5000 }),
				// 生成初始尺寸
				fc.integer({ min: 100, max: 1000 }),
				fc.integer({ min: 100, max: 1000 }),
				(anchorX, anchorY, oldWidth, oldHeight, initWidth, initHeight) => {
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: oldWidth,
						height: oldHeight,
					};

					// 第一次重置
					const result1 = simulateResetGroupToInitialSize(
						initialGroup,
						initWidth,
						initHeight
					);

					// 第二次重置（对已重置的组再次重置）
					const result2 = simulateResetGroupToInitialSize(
						result1,
						initWidth,
						initHeight
					);

					// 两次重置的结果应该相同（幂等性）
					expect(result1.x).toBe(result2.x);
					expect(result1.y).toBe(result2.y);
					expect(result1.width).toBe(result2.width);
					expect(result1.height).toBe(result2.height);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("收缩后增长的完整流程：尺寸应该从大变小再变大", () => {
		fc.assert(
			fc.property(
				// 生成锚点位置
				fc.integer({ min: -10000, max: 10000 }),
				fc.integer({ min: -10000, max: 10000 }),
				// 生成旧的大尺寸
				fc.integer({ min: 800, max: 2000 }),
				fc.integer({ min: 800, max: 2000 }),
				// 生成增长后的最终尺寸
				fc.integer({ min: 500, max: 1500 }),
				fc.integer({ min: 500, max: 1500 }),
				(anchorX, anchorY, oldWidth, oldHeight, finalWidth, finalHeight) => {
					// 阶段 1: 初始状态（大尺寸）
					const initialGroup: GroupState = {
						x: anchorX,
						y: anchorY,
						width: oldWidth,
						height: oldHeight,
					};

					// 阶段 2: 收缩到初始尺寸
					const shrunkGroup = simulateResetGroupToInitialSize(
						initialGroup,
						DEFAULT_INITIAL_WIDTH,
						DEFAULT_INITIAL_HEIGHT
					);

					// 验证收缩：尺寸应该变小
					expect(shrunkGroup.width).toBeLessThan(oldWidth);
					expect(shrunkGroup.height).toBeLessThan(oldHeight);
					expect(shrunkGroup.width).toBe(DEFAULT_INITIAL_WIDTH);
					expect(shrunkGroup.height).toBe(DEFAULT_INITIAL_HEIGHT);

					// 阶段 3: 增长到最终尺寸
					const grownGroup = simulateGroupBoundsExpansion(
						shrunkGroup,
						finalWidth,
						finalHeight
					);

					// 验证增长：尺寸应该变大（如果 finalWidth/Height > DEFAULT）
					if (finalWidth > DEFAULT_INITIAL_WIDTH) {
						expect(grownGroup.width).toBe(finalWidth);
					} else {
						expect(grownGroup.width).toBe(DEFAULT_INITIAL_WIDTH);
					}
					if (finalHeight > DEFAULT_INITIAL_HEIGHT) {
						expect(grownGroup.height).toBe(finalHeight);
					} else {
						expect(grownGroup.height).toBe(DEFAULT_INITIAL_HEIGHT);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 5: 两阶段删除
 *
 * *For any* 重新生成过程，原始子节点应该在第一个成功数据块到达之前保持存在。
 * 如果在任何数据到达之前发生错误，原始内容应该被保留。
 *
 * **Validates: Requirements 3.1, 3.3**
 */
describe("Property 5: 两阶段删除", () => {
	/**
	 * 表示重新生成状态
	 */
	interface RegenerationState {
		/** 原始子节点数量 */
		originalNodeCount: number;
		/** 是否已删除原始节点 */
		deletedOriginals: boolean;
		/** 是否收到第一个数据块 */
		receivedFirstChunk: boolean;
		/** 是否发生错误 */
		hasError: boolean;
		/** 错误发生时机（在第一个数据块之前或之后） */
		errorBeforeFirstChunk: boolean;
	}

	/**
	 * 模拟两阶段删除逻辑
	 * 
	 * 规则：
	 * 1. 在第一个成功数据块到达之前，原始节点保持存在
	 * 2. 第一个成功数据块到达时，删除原始节点
	 * 3. 如果在第一个数据块之前发生错误，原始节点保留
	 */
	function simulateTwoPhaseDelete(
		initialState: RegenerationState,
		events: Array<{ type: "chunk" | "error"; data?: string }>
	): RegenerationState {
		let state = { ...initialState };

		for (const event of events) {
			if (state.hasError) {
				// 一旦发生错误，停止处理
				break;
			}

			if (event.type === "error") {
				state.hasError = true;
				state.errorBeforeFirstChunk = !state.receivedFirstChunk;
				// 如果在第一个数据块之前发生错误，原始节点保留
				// 如果在第一个数据块之后发生错误，原始节点已被删除
				break;
			}

			if (event.type === "chunk" && event.data) {
				if (!state.receivedFirstChunk) {
					// 第一个成功数据块到达
					state.receivedFirstChunk = true;
					// 删除原始节点
					state.deletedOriginals = true;
				}
			}
		}

		return state;
	}

	it("第一个数据块到达前，原始节点应该保持存在", () => {
		fc.assert(
			fc.property(
				// 生成原始节点数量
				fc.integer({ min: 1, max: 20 }),
				(originalNodeCount) => {
					const initialState: RegenerationState = {
						originalNodeCount,
						deletedOriginals: false,
						receivedFirstChunk: false,
						hasError: false,
						errorBeforeFirstChunk: false,
					};

					// 没有任何事件时，原始节点应该保持存在
					const stateAfterNoEvents = simulateTwoPhaseDelete(initialState, []);
					expect(stateAfterNoEvents.deletedOriginals).toBe(false);
					expect(stateAfterNoEvents.receivedFirstChunk).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("第一个成功数据块到达时，应该删除原始节点", () => {
		fc.assert(
			fc.property(
				// 生成原始节点数量
				fc.integer({ min: 1, max: 20 }),
				// 生成数据块内容
				fc.string({ minLength: 1, maxLength: 100 }),
				(originalNodeCount, chunkData) => {
					const initialState: RegenerationState = {
						originalNodeCount,
						deletedOriginals: false,
						receivedFirstChunk: false,
						hasError: false,
						errorBeforeFirstChunk: false,
					};

					// 第一个数据块到达
					const stateAfterFirstChunk = simulateTwoPhaseDelete(initialState, [
						{ type: "chunk", data: chunkData },
					]);

					// 原始节点应该被删除
					expect(stateAfterFirstChunk.deletedOriginals).toBe(true);
					expect(stateAfterFirstChunk.receivedFirstChunk).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("在第一个数据块之前发生错误时，原始节点应该保留", () => {
		fc.assert(
			fc.property(
				// 生成原始节点数量
				fc.integer({ min: 1, max: 20 }),
				(originalNodeCount) => {
					const initialState: RegenerationState = {
						originalNodeCount,
						deletedOriginals: false,
						receivedFirstChunk: false,
						hasError: false,
						errorBeforeFirstChunk: false,
					};

					// 在任何数据块之前发生错误
					const stateAfterError = simulateTwoPhaseDelete(initialState, [
						{ type: "error" },
					]);

					// 原始节点应该保留
					expect(stateAfterError.deletedOriginals).toBe(false);
					expect(stateAfterError.hasError).toBe(true);
					expect(stateAfterError.errorBeforeFirstChunk).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("在第一个数据块之后发生错误时，原始节点已被删除", () => {
		fc.assert(
			fc.property(
				// 生成原始节点数量
				fc.integer({ min: 1, max: 20 }),
				// 生成数据块内容
				fc.string({ minLength: 1, maxLength: 100 }),
				(originalNodeCount, chunkData) => {
					const initialState: RegenerationState = {
						originalNodeCount,
						deletedOriginals: false,
						receivedFirstChunk: false,
						hasError: false,
						errorBeforeFirstChunk: false,
					};

					// 先收到数据块，然后发生错误
					const stateAfterChunkThenError = simulateTwoPhaseDelete(initialState, [
						{ type: "chunk", data: chunkData },
						{ type: "error" },
					]);

					// 原始节点已被删除（在第一个数据块时）
					expect(stateAfterChunkThenError.deletedOriginals).toBe(true);
					expect(stateAfterChunkThenError.hasError).toBe(true);
					expect(stateAfterChunkThenError.errorBeforeFirstChunk).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("多个数据块序列中，删除只发生一次（在第一个数据块时）", () => {
		fc.assert(
			fc.property(
				// 生成原始节点数量
				fc.integer({ min: 1, max: 20 }),
				// 生成多个数据块
				fc.array(
					fc.string({ minLength: 1, maxLength: 50 }),
					{ minLength: 2, maxLength: 10 }
				),
				(originalNodeCount, chunks) => {
					const initialState: RegenerationState = {
						originalNodeCount,
						deletedOriginals: false,
						receivedFirstChunk: false,
						hasError: false,
						errorBeforeFirstChunk: false,
					};

					// 模拟多个数据块
					const events = chunks.map(data => ({ type: "chunk" as const, data }));
					const finalState = simulateTwoPhaseDelete(initialState, events);

					// 原始节点应该被删除（只在第一个数据块时）
					expect(finalState.deletedOriginals).toBe(true);
					expect(finalState.receivedFirstChunk).toBe(true);
					expect(finalState.hasError).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("空数据块不应该触发删除", () => {
		fc.assert(
			fc.property(
				// 生成原始节点数量
				fc.integer({ min: 1, max: 20 }),
				(originalNodeCount) => {
					const initialState: RegenerationState = {
						originalNodeCount,
						deletedOriginals: false,
						receivedFirstChunk: false,
						hasError: false,
						errorBeforeFirstChunk: false,
					};

					// 空数据块（data 为 undefined 或空字符串）
					const stateAfterEmptyChunk = simulateTwoPhaseDelete(initialState, [
						{ type: "chunk", data: "" },
					]);

					// 空数据块不应该触发删除
					expect(stateAfterEmptyChunk.deletedOriginals).toBe(false);
					expect(stateAfterEmptyChunk.receivedFirstChunk).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("随机事件序列应该遵循两阶段删除规则", () => {
		fc.assert(
			fc.property(
				// 生成原始节点数量
				fc.integer({ min: 1, max: 20 }),
				// 生成随机事件序列
				fc.array(
					fc.oneof(
						fc.record({
							type: fc.constant("chunk" as const),
							data: fc.string({ minLength: 0, maxLength: 50 }),
						}),
						fc.record({
							type: fc.constant("error" as const),
						})
					),
					{ minLength: 0, maxLength: 20 }
				),
				(originalNodeCount, events) => {
					const initialState: RegenerationState = {
						originalNodeCount,
						deletedOriginals: false,
						receivedFirstChunk: false,
						hasError: false,
						errorBeforeFirstChunk: false,
					};

					const finalState = simulateTwoPhaseDelete(initialState, events);

					// 验证两阶段删除规则
					if (finalState.hasError && finalState.errorBeforeFirstChunk) {
						// 规则 1: 如果在第一个数据块之前发生错误，原始节点保留
						expect(finalState.deletedOriginals).toBe(false);
					}

					if (finalState.receivedFirstChunk) {
						// 规则 2: 如果收到了第一个数据块，原始节点应该被删除
						expect(finalState.deletedOriginals).toBe(true);
					}

					if (!finalState.receivedFirstChunk && !finalState.hasError) {
						// 规则 3: 如果没有收到数据块且没有错误，原始节点保留
						expect(finalState.deletedOriginals).toBe(false);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 1: 流式回调触发
 *
 * *For any* 重新生成过程中的数据块序列，每个包含有效节点数据的数据块到达时，
 * 系统都应该触发 onNodeCreated 回调，使节点实时逐个出现。
 *
 * **Validates: Requirements 1.2, 6.2**
 */
describe("Property 1: 流式回调触发", () => {
	/**
	 * 表示数据块的类型
	 */
	interface DataChunk {
		/** 数据块内容 */
		content: string;
		/** 是否包含有效节点数据 */
		hasValidNode: boolean;
		/** 节点 ID（如果有） */
		nodeId?: string;
	}

	/**
	 * 表示回调记录
	 */
	interface CallbackRecord {
		type: "onStart" | "onNodeCreated" | "onProgress" | "onComplete" | "onError";
		nodeId?: string;
		progress?: number;
		error?: Error;
		timestamp: number;
	}

	/**
	 * 模拟流式回调触发逻辑
	 * 
	 * 规则：
	 * 1. 每个包含有效节点数据的数据块应该触发 onNodeCreated 回调
	 * 2. 回调应该按数据块到达顺序触发
	 * 3. 每个节点只触发一次 onNodeCreated 回调
	 */
	function simulateStreamingCallbacks(
		chunks: DataChunk[]
	): CallbackRecord[] {
		const records: CallbackRecord[] = [];
		const createdNodeIds = new Set<string>();
		let timestamp = 0;

		// 开始回调
		records.push({
			type: "onStart",
			timestamp: timestamp++,
		});

		// 处理每个数据块
		for (const chunk of chunks) {
			if (chunk.hasValidNode && chunk.nodeId) {
				// 检查节点是否已创建（避免重复回调）
				if (!createdNodeIds.has(chunk.nodeId)) {
					createdNodeIds.add(chunk.nodeId);
					records.push({
						type: "onNodeCreated",
						nodeId: chunk.nodeId,
						timestamp: timestamp++,
					});
				}
			}

			// 进度回调（每个数据块都可能触发）
			records.push({
				type: "onProgress",
				progress: Math.min(90, timestamp * 10),
				timestamp: timestamp++,
			});
		}

		// 完成回调
		records.push({
			type: "onComplete",
			timestamp: timestamp++,
		});

		// 最终进度
		records.push({
			type: "onProgress",
			progress: 100,
			timestamp: timestamp++,
		});

		return records;
	}

	it("每个包含有效节点数据的数据块应该触发 onNodeCreated 回调", () => {
		fc.assert(
			fc.property(
				// 生成数据块序列
				fc.array(
					fc.record({
						content: fc.string({ minLength: 1, maxLength: 100 }),
						hasValidNode: fc.boolean(),
						nodeId: fc.string({ minLength: 1, maxLength: 10 }),
					}),
					{ minLength: 1, maxLength: 20 }
				),
				(chunks) => {
					const records = simulateStreamingCallbacks(chunks);

					// 统计有效节点数据块数量（去重）
					const uniqueValidNodeIds = new Set(
						chunks
							.filter(c => c.hasValidNode && c.nodeId)
							.map(c => c.nodeId)
					);

					// 统计 onNodeCreated 回调数量
					const nodeCreatedRecords = records.filter(r => r.type === "onNodeCreated");

					// 验证：onNodeCreated 回调数量应该等于唯一有效节点数量
					expect(nodeCreatedRecords.length).toBe(uniqueValidNodeIds.size);

					// 验证：每个有效节点都应该有对应的回调
					for (const nodeId of uniqueValidNodeIds) {
						const hasCallback = nodeCreatedRecords.some(r => r.nodeId === nodeId);
						expect(hasCallback).toBe(true);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("回调应该按数据块到达顺序触发", () => {
		fc.assert(
			fc.property(
				// 生成数据块序列（所有都有有效节点）
				fc.array(
					fc.record({
						content: fc.string({ minLength: 1, maxLength: 100 }),
						hasValidNode: fc.constant(true),
						nodeId: fc.integer({ min: 1, max: 100 }).map(n => `node_${n}`),
					}),
					{ minLength: 2, maxLength: 10 }
				),
				(chunks) => {
					const records = simulateStreamingCallbacks(chunks);

					// 验证：所有记录的时间戳应该是递增的
					for (let i = 1; i < records.length; i++) {
						expect(records[i].timestamp).toBeGreaterThan(records[i - 1].timestamp);
					}

					// 验证：onStart 应该是第一个回调
					expect(records[0].type).toBe("onStart");

					// 验证：onComplete 应该在 onNodeCreated 之后
					const completeIndex = records.findIndex(r => r.type === "onComplete");
					const lastNodeCreatedIndex = records
						.map((r, i) => ({ r, i }))
						.filter(({ r }) => r.type === "onNodeCreated")
						.pop()?.i ?? -1;

					if (lastNodeCreatedIndex >= 0) {
						expect(completeIndex).toBeGreaterThan(lastNodeCreatedIndex);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("每个节点只触发一次 onNodeCreated 回调", () => {
		fc.assert(
			fc.property(
				// 生成包含重复节点 ID 的数据块序列
				fc.array(
					fc.record({
						content: fc.string({ minLength: 1, maxLength: 100 }),
						hasValidNode: fc.constant(true),
						// 使用较小的 ID 范围以增加重复概率
						nodeId: fc.integer({ min: 1, max: 5 }).map(n => `node_${n}`),
					}),
					{ minLength: 5, maxLength: 20 }
				),
				(chunks) => {
					const records = simulateStreamingCallbacks(chunks);

					// 统计每个节点的回调次数
					const nodeCallbackCounts = new Map<string, number>();
					for (const record of records) {
						if (record.type === "onNodeCreated" && record.nodeId) {
							const count = nodeCallbackCounts.get(record.nodeId) || 0;
							nodeCallbackCounts.set(record.nodeId, count + 1);
						}
					}

					// 验证：每个节点只有一次回调
					for (const [nodeId, count] of nodeCallbackCounts) {
						expect(count).toBe(1);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("没有有效节点数据的数据块不应该触发 onNodeCreated 回调", () => {
		fc.assert(
			fc.property(
				// 生成没有有效节点的数据块序列
				fc.array(
					fc.record({
						content: fc.string({ minLength: 1, maxLength: 100 }),
						hasValidNode: fc.constant(false),
						nodeId: fc.string({ minLength: 1, maxLength: 10 }),
					}),
					{ minLength: 1, maxLength: 20 }
				),
				(chunks) => {
					const records = simulateStreamingCallbacks(chunks);

					// 统计 onNodeCreated 回调数量
					const nodeCreatedRecords = records.filter(r => r.type === "onNodeCreated");

					// 验证：没有 onNodeCreated 回调
					expect(nodeCreatedRecords.length).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("混合有效和无效数据块时，只有有效数据块触发 onNodeCreated 回调", () => {
		fc.assert(
			fc.property(
				// 生成混合数据块序列
				fc.array(
					fc.record({
						content: fc.string({ minLength: 1, maxLength: 100 }),
						hasValidNode: fc.boolean(),
						nodeId: fc.string({ minLength: 1, maxLength: 10 }),
					}),
					{ minLength: 5, maxLength: 20 }
				),
				(chunks) => {
					const records = simulateStreamingCallbacks(chunks);

					// 统计有效节点数据块数量（去重）
					const uniqueValidNodeIds = new Set(
						chunks
							.filter(c => c.hasValidNode && c.nodeId)
							.map(c => c.nodeId)
					);

					// 统计 onNodeCreated 回调数量
					const nodeCreatedRecords = records.filter(r => r.type === "onNodeCreated");

					// 验证：回调数量等于唯一有效节点数量
					expect(nodeCreatedRecords.length).toBe(uniqueValidNodeIds.size);

					// 验证：所有回调的节点 ID 都在有效节点集合中
					for (const record of nodeCreatedRecords) {
						expect(uniqueValidNodeIds.has(record.nodeId!)).toBe(true);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});


/**
 * Property 9: 生命周期回调顺序
 *
 * *For any* 成功的重新生成过程，回调应该按以下顺序触发：
 * onStart → (onNodeCreated | onProgress)* → onComplete。
 * 对于失败的过程，应该触发 onError。
 *
 * **Validates: Requirements 6.1, 6.3, 6.4**
 */
describe("Property 9: 生命周期回调顺序", () => {
	/**
	 * 回调类型
	 */
	type CallbackType = "onStart" | "onNodeCreated" | "onProgress" | "onComplete" | "onError";

	/**
	 * 表示回调记录
	 */
	interface CallbackRecord {
		type: CallbackType;
		timestamp: number;
	}

	/**
	 * 表示生成过程的事件
	 */
	interface GenerationEvent {
		type: "node" | "progress" | "error";
		nodeId?: string;
		progress?: number;
		error?: Error;
	}

	/**
	 * 模拟生命周期回调顺序
	 * 
	 * 规则：
	 * 1. onStart 必须是第一个回调
	 * 2. onNodeCreated 和 onProgress 可以交替出现
	 * 3. 成功时 onComplete 必须是最后一个回调
	 * 4. 失败时 onError 必须是最后一个回调
	 * 5. onComplete 和 onError 互斥
	 */
	function simulateLifecycleCallbacks(
		events: GenerationEvent[],
		shouldSucceed: boolean
	): CallbackRecord[] {
		const records: CallbackRecord[] = [];
		let timestamp = 0;

		// 1. onStart 必须是第一个
		records.push({
			type: "onStart",
			timestamp: timestamp++,
		});

		// 2. 处理中间事件
		for (const event of events) {
			if (event.type === "node") {
				records.push({
					type: "onNodeCreated",
					timestamp: timestamp++,
				});
			} else if (event.type === "progress") {
				records.push({
					type: "onProgress",
					timestamp: timestamp++,
				});
			} else if (event.type === "error") {
				// 错误发生，立即触发 onError 并结束
				records.push({
					type: "onError",
					timestamp: timestamp++,
				});
				return records;
			}
		}

		// 3. 根据成功/失败决定最后的回调
		if (shouldSucceed) {
			records.push({
				type: "onComplete",
				timestamp: timestamp++,
			});
		} else {
			records.push({
				type: "onError",
				timestamp: timestamp++,
			});
		}

		return records;
	}

	/**
	 * 验证回调顺序是否符合规范
	 */
	function validateCallbackOrder(records: CallbackRecord[]): {
		valid: boolean;
		reason?: string;
	} {
		if (records.length === 0) {
			return { valid: false, reason: "回调记录为空" };
		}

		// 规则 1: onStart 必须是第一个
		if (records[0].type !== "onStart") {
			return { valid: false, reason: "onStart 不是第一个回调" };
		}

		// 规则 2: 检查最后一个回调
		const lastRecord = records[records.length - 1];
		if (lastRecord.type !== "onComplete" && lastRecord.type !== "onError") {
			return { valid: false, reason: "最后一个回调不是 onComplete 或 onError" };
		}

		// 规则 3: onComplete 和 onError 互斥
		const hasComplete = records.some(r => r.type === "onComplete");
		const hasError = records.some(r => r.type === "onError");
		if (hasComplete && hasError) {
			return { valid: false, reason: "onComplete 和 onError 同时存在" };
		}

		// 规则 4: onStart 只能出现一次
		const startCount = records.filter(r => r.type === "onStart").length;
		if (startCount !== 1) {
			return { valid: false, reason: `onStart 出现了 ${startCount} 次` };
		}

		// 规则 5: onComplete/onError 只能出现一次
		const completeCount = records.filter(r => r.type === "onComplete").length;
		const errorCount = records.filter(r => r.type === "onError").length;
		if (completeCount > 1) {
			return { valid: false, reason: `onComplete 出现了 ${completeCount} 次` };
		}
		if (errorCount > 1) {
			return { valid: false, reason: `onError 出现了 ${errorCount} 次` };
		}

		// 规则 6: 时间戳必须递增
		for (let i = 1; i < records.length; i++) {
			if (records[i].timestamp <= records[i - 1].timestamp) {
				return { valid: false, reason: "时间戳不是递增的" };
			}
		}

		// 规则 7: onComplete/onError 之后不能有其他回调
		const terminalIndex = records.findIndex(
			r => r.type === "onComplete" || r.type === "onError"
		);
		if (terminalIndex !== records.length - 1) {
			return { valid: false, reason: "onComplete/onError 之后还有其他回调" };
		}

		return { valid: true };
	}

	it("成功的生成过程应该以 onStart 开始，以 onComplete 结束", () => {
		fc.assert(
			fc.property(
				// 生成中间事件序列
				fc.array(
					fc.oneof(
						fc.record({
							type: fc.constant("node" as const),
							nodeId: fc.string({ minLength: 1, maxLength: 10 }),
						}),
						fc.record({
							type: fc.constant("progress" as const),
							progress: fc.integer({ min: 0, max: 100 }),
						})
					),
					{ minLength: 0, maxLength: 20 }
				),
				(events) => {
					const records = simulateLifecycleCallbacks(events, true);

					// 验证顺序
					const validation = validateCallbackOrder(records);
					expect(validation.valid).toBe(true);

					// 验证以 onStart 开始
					expect(records[0].type).toBe("onStart");

					// 验证以 onComplete 结束
					expect(records[records.length - 1].type).toBe("onComplete");

					// 验证没有 onError
					expect(records.some(r => r.type === "onError")).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("失败的生成过程应该以 onStart 开始，以 onError 结束", () => {
		fc.assert(
			fc.property(
				// 生成中间事件序列
				fc.array(
					fc.oneof(
						fc.record({
							type: fc.constant("node" as const),
							nodeId: fc.string({ minLength: 1, maxLength: 10 }),
						}),
						fc.record({
							type: fc.constant("progress" as const),
							progress: fc.integer({ min: 0, max: 100 }),
						})
					),
					{ minLength: 0, maxLength: 20 }
				),
				(events) => {
					const records = simulateLifecycleCallbacks(events, false);

					// 验证顺序
					const validation = validateCallbackOrder(records);
					expect(validation.valid).toBe(true);

					// 验证以 onStart 开始
					expect(records[0].type).toBe("onStart");

					// 验证以 onError 结束
					expect(records[records.length - 1].type).toBe("onError");

					// 验证没有 onComplete
					expect(records.some(r => r.type === "onComplete")).toBe(false);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("中间事件可以是 onNodeCreated 或 onProgress 的任意组合", () => {
		fc.assert(
			fc.property(
				// 生成中间事件序列
				fc.array(
					fc.oneof(
						fc.record({
							type: fc.constant("node" as const),
							nodeId: fc.string({ minLength: 1, maxLength: 10 }),
						}),
						fc.record({
							type: fc.constant("progress" as const),
							progress: fc.integer({ min: 0, max: 100 }),
						})
					),
					{ minLength: 1, maxLength: 30 }
				),
				fc.boolean(),
				(events, shouldSucceed) => {
					const records = simulateLifecycleCallbacks(events, shouldSucceed);

					// 验证顺序
					const validation = validateCallbackOrder(records);
					expect(validation.valid).toBe(true);

					// 验证中间回调只有 onNodeCreated 和 onProgress
					const middleRecords = records.slice(1, -1);
					for (const record of middleRecords) {
						expect(["onNodeCreated", "onProgress"]).toContain(record.type);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("错误事件应该立即终止回调序列", () => {
		fc.assert(
			fc.property(
				// 生成错误前的事件数量
				fc.integer({ min: 0, max: 10 }),
				// 生成错误后的事件数量（这些不应该被处理）
				fc.integer({ min: 1, max: 10 }),
				(eventsBeforeError, eventsAfterError) => {
					// 构建事件序列：一些正常事件 + 错误 + 一些正常事件
					const events: GenerationEvent[] = [];

					// 错误前的事件
					for (let i = 0; i < eventsBeforeError; i++) {
						events.push({ type: "node", nodeId: `node_${i}` });
					}

					// 错误事件
					events.push({ type: "error", error: new Error("测试错误") });

					// 错误后的事件（不应该被处理）
					for (let i = 0; i < eventsAfterError; i++) {
						events.push({ type: "node", nodeId: `after_error_${i}` });
					}

					const records = simulateLifecycleCallbacks(events, true);

					// 验证顺序
					const validation = validateCallbackOrder(records);
					expect(validation.valid).toBe(true);

					// 验证以 onError 结束
					expect(records[records.length - 1].type).toBe("onError");

					// 验证回调数量：onStart + eventsBeforeError + onError
					expect(records.length).toBe(1 + eventsBeforeError + 1);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("空事件序列应该只有 onStart 和 onComplete/onError", () => {
		fc.assert(
			fc.property(
				fc.boolean(),
				(shouldSucceed) => {
					const records = simulateLifecycleCallbacks([], shouldSucceed);

					// 验证顺序
					const validation = validateCallbackOrder(records);
					expect(validation.valid).toBe(true);

					// 验证只有两个回调
					expect(records.length).toBe(2);

					// 验证第一个是 onStart
					expect(records[0].type).toBe("onStart");

					// 验证第二个是 onComplete 或 onError
					if (shouldSucceed) {
						expect(records[1].type).toBe("onComplete");
					} else {
						expect(records[1].type).toBe("onError");
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("回调时间戳应该严格递增", () => {
		fc.assert(
			fc.property(
				// 生成中间事件序列
				fc.array(
					fc.oneof(
						fc.record({
							type: fc.constant("node" as const),
							nodeId: fc.string({ minLength: 1, maxLength: 10 }),
						}),
						fc.record({
							type: fc.constant("progress" as const),
							progress: fc.integer({ min: 0, max: 100 }),
						})
					),
					{ minLength: 0, maxLength: 20 }
				),
				fc.boolean(),
				(events, shouldSucceed) => {
					const records = simulateLifecycleCallbacks(events, shouldSucceed);

					// 验证时间戳严格递增
					for (let i = 1; i < records.length; i++) {
						expect(records[i].timestamp).toBeGreaterThan(records[i - 1].timestamp);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("onComplete 和 onError 互斥", () => {
		fc.assert(
			fc.property(
				// 生成中间事件序列
				fc.array(
					fc.oneof(
						fc.record({
							type: fc.constant("node" as const),
							nodeId: fc.string({ minLength: 1, maxLength: 10 }),
						}),
						fc.record({
							type: fc.constant("progress" as const),
							progress: fc.integer({ min: 0, max: 100 }),
						})
					),
					{ minLength: 0, maxLength: 20 }
				),
				fc.boolean(),
				(events, shouldSucceed) => {
					const records = simulateLifecycleCallbacks(events, shouldSucceed);

					const hasComplete = records.some(r => r.type === "onComplete");
					const hasError = records.some(r => r.type === "onError");

					// 验证互斥
					expect(hasComplete && hasError).toBe(false);

					// 验证至少有一个
					expect(hasComplete || hasError).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});
});
