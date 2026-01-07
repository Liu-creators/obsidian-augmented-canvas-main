/**
 * 布局引擎属性测试
 *
 * Feature: group-generation-refactor
 *
 * 这些测试使用 fast-check 验证布局引擎的纯函数属性，
 * 确保布局计算的确定性、动态高度堆叠和无重叠不变量。
 */

import * as fc from "fast-check";
import {
	calculateNodePosition,
	registerNodeInColumn,
	calculateRepositioning,
	detectOverlaps,
	calculateGroupBounds,
	cloneColumnTracks,
	validateNoOverlapInvariant,
} from "../layoutEngine";
import { createConfig, LAYOUT_CONSTANTS } from "../config";
import { AnchorState, ColumnTrack, ColumnNodeInfo, NodeBounds, GroupBounds } from "../types";

// ============================================================================
// 测试辅助函数和生成器
// ============================================================================

/**
 * 生成有效的锚点状态
 */
const anchorStateArb = fc.record({
	anchorX: fc.integer({ min: 0, max: 5000 }),
	anchorY: fc.integer({ min: 0, max: 5000 }),
	anchorLocked: fc.constant(true),
	minRowSeen: fc.integer({ min: -10, max: 0 }),
	minColSeen: fc.integer({ min: -10, max: 0 }),
	edgeDirection: fc.constantFrom("left", "top", "right", "bottom") as fc.Arbitrary<AnchorState["edgeDirection"]>,
});

/**
 * 生成列节点信息
 */
const columnNodeInfoArb = (row: number) => fc.record({
	nodeId: fc.string({ minLength: 1, maxLength: 10 }).map(s => `node_${s}`),
	row: fc.constant(row),
	y: fc.integer({ min: 0, max: 10000 }),
	actualHeight: fc.integer({ min: 50, max: 500 }),
});

/**
 * 生成列追踪数据
 */
const columnTrackArb = (col: number, nodeCount: number) =>
	fc.array(
		fc.integer({ min: 0, max: 20 }),
		{ minLength: nodeCount, maxLength: nodeCount }
	).chain(rows => {
		// 确保行号唯一并排序
		const uniqueRows = [...new Set(rows)].sort((a, b) => a - b).slice(0, nodeCount);
		return fc.tuple(
			...uniqueRows.map(row => columnNodeInfoArb(row))
		).map(nodes => ({
			col,
			nodes: nodes as ColumnNodeInfo[],
			maxWidth: 360,
		}));
	});

/**
 * 深拷贝对象用于不可变性测试
 */
function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

// ============================================================================
// Property 4: 布局计算确定性
// ============================================================================

describe("Property 4: Layout Calculation Determinism", () => {
	/**
	 * Property 4: 布局计算确定性
	 *
	 * 对于任何输入集（锚点状态、节点坐标、列追踪、配置），
	 * 多次调用布局计算函数应返回相同的位置坐标，
	 * 且函数不应修改任何外部状态（纯函数）。
	 *
	 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
	 */
	it("should return identical results for same inputs", () => {
		fc.assert(
			fc.property(
				anchorStateArb,
				fc.integer({ min: 0, max: 10 }), // row
				fc.integer({ min: 0, max: 5 }),  // col
				(anchorState, row, col) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 第一次调用
					const result1 = calculateNodePosition(
						"test_node",
						row,
						col,
						anchorState,
						columnTracks,
						config
					);

					// 第二次调用（相同输入）
					const result2 = calculateNodePosition(
						"test_node",
						row,
						col,
						anchorState,
						columnTracks,
						config
					);

					// 结果应完全相同
					expect(result1.x).toBe(result2.x);
					expect(result1.y).toBe(result2.y);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should not mutate input anchorState", () => {
		fc.assert(
			fc.property(
				anchorStateArb,
				fc.integer({ min: 0, max: 10 }),
				fc.integer({ min: 0, max: 5 }),
				(anchorState, row, col) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 深拷贝原始状态
					const originalAnchorState = deepClone(anchorState);

					// 调用函数
					calculateNodePosition(
						"test_node",
						row,
						col,
						anchorState,
						columnTracks,
						config
					);

					// 验证锚点状态未被修改
					expect(anchorState.anchorX).toBe(originalAnchorState.anchorX);
					expect(anchorState.anchorY).toBe(originalAnchorState.anchorY);
					expect(anchorState.anchorLocked).toBe(originalAnchorState.anchorLocked);
					expect(anchorState.edgeDirection).toBe(originalAnchorState.edgeDirection);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should not mutate input columnTracks when passed as ReadonlyMap", () => {
		fc.assert(
			fc.property(
				anchorStateArb,
				fc.integer({ min: 0, max: 10 }),
				fc.integer({ min: 0, max: 5 }),
				fc.array(
					fc.record({
						nodeId: fc.string({ minLength: 1, maxLength: 5 }).map(s => `n_${s}`),
						row: fc.integer({ min: 0, max: 10 }),
						y: fc.integer({ min: 100, max: 5000 }),
						actualHeight: fc.integer({ min: 50, max: 300 }),
					}),
					{ minLength: 1, maxLength: 5 }
				),
				(anchorState, row, col, nodes) => {
					const config = createConfig();

					// 创建带有节点的列追踪
					const columnTracks = new Map<number, ColumnTrack>();
					columnTracks.set(0, {
						col: 0,
						nodes: nodes.map((n, i) => ({ ...n, row: i })),
						maxWidth: 360,
					});

					// 深拷贝原始列追踪
					const originalTracks = cloneColumnTracks(columnTracks);

					// 调用函数
					calculateNodePosition(
						"test_node",
						row,
						col,
						anchorState,
						columnTracks,
						config
					);

					// 验证列追踪未被修改
					expect(columnTracks.size).toBe(originalTracks.size);
					for (const [colKey, track] of columnTracks) {
						const originalTrack = originalTracks.get(colKey);
						expect(originalTrack).toBeDefined();
						expect(track.nodes.length).toBe(originalTrack!.nodes.length);
						expect(track.maxWidth).toBe(originalTrack!.maxWidth);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should produce consistent results across multiple calls with varying inputs", () => {
		fc.assert(
			fc.property(
				anchorStateArb,
				fc.array(
					fc.record({
						row: fc.integer({ min: 0, max: 10 }),
						col: fc.integer({ min: 0, max: 5 }),
					}),
					{ minLength: 3, maxLength: 10 }
				),
				(anchorState, nodeCoords) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 计算所有节点位置两次
					const results1 = nodeCoords.map((coord, i) =>
						calculateNodePosition(
							`node_${i}`,
							coord.row,
							coord.col,
							anchorState,
							columnTracks,
							config
						)
					);

					const results2 = nodeCoords.map((coord, i) =>
						calculateNodePosition(
							`node_${i}`,
							coord.row,
							coord.col,
							anchorState,
							columnTracks,
							config
						)
					);

					// 所有结果应相同
					for (let i = 0; i < results1.length; i++) {
						expect(results1[i].x).toBe(results2[i].x);
						expect(results1[i].y).toBe(results2[i].y);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});

// ============================================================================
// Property 5: 动态高度堆叠
// ============================================================================

describe("Property 5: Dynamic Height Stacking", () => {
	/**
	 * Property 5: 动态高度堆叠
	 *
	 * 对于任何具有不同实际高度的节点列，每个节点的 Y 位置应等于
	 * 前一个节点的 Y 位置加上前一个节点的实际高度加上配置的垂直间距。
	 * 第一个节点的 Y 位置应等于锚点 Y 加上头部高度加上任何适用的安全区域。
	 *
	 * **Validates: Requirements 3.5, 3.6**
	 */
	it("should position first node at anchorY + headerHeight + safeZone", () => {
		fc.assert(
			fc.property(
				anchorStateArb,
				fc.integer({ min: 50, max: 500 }), // actualHeight
				(anchorState, actualHeight) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 计算第一个节点位置
					const position = calculateNodePosition(
						"first_node",
						0, // row 0
						0, // col 0
						anchorState,
						columnTracks,
						config
					);

					// 计算预期的安全区域
					const topSafeZone = anchorState.edgeDirection === "top"
						? config.edgeLabelSafeZone
						: 0;

					// 预期 Y 位置
					const expectedY = anchorState.anchorY +
						config.groupHeaderHeight +
						topSafeZone;

					expect(position.y).toBe(expectedY);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should stack nodes using accumulated heights", () => {
		fc.assert(
			fc.property(
				anchorStateArb,
				fc.array(
					fc.integer({ min: 50, max: 500 }),
					{ minLength: 2, maxLength: 5 }
				),
				(anchorState, heights) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 计算标准化的列索引（与 calculateNodePosition 内部逻辑一致）
					const normalizedCol = 0 - anchorState.minColSeen;

					// 模拟创建多个节点
					const positions: { y: number; height: number }[] = [];

					for (let i = 0; i < heights.length; i++) {
						// 计算标准化的行索引
						const normalizedRow = i - anchorState.minRowSeen;

						const position = calculateNodePosition(
							`node_${i}`,
							i, // row = index
							0, // col 0
							anchorState,
							columnTracks,
							config
						);

						// 注册节点到列追踪（使用标准化的列索引）
						registerNodeInColumn(
							`node_${i}`,
							normalizedCol, // 使用标准化的列索引
							normalizedRow, // 使用标准化的行索引
							position.y,
							heights[i],
							config.nodeWidth,
							columnTracks,
							config.nodeWidth
						);

						positions.push({ y: position.y, height: heights[i] });
					}

					// 验证堆叠公式
					for (let i = 1; i < positions.length; i++) {
						const prevNode = positions[i - 1];
						const currNode = positions[i];

						// 当前节点 Y = 前一节点 Y + 前一节点高度 + 垂直间距
						const expectedY = prevNode.y + prevNode.height + config.verticalGap;
						expect(currNode.y).toBe(expectedY);
					}
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should handle varying heights correctly", () => {
		fc.assert(
			fc.property(
				anchorStateArb,
				// 生成 3 个不同高度
				fc.integer({ min: 50, max: 200 }),
				fc.integer({ min: 200, max: 400 }),
				fc.integer({ min: 100, max: 300 }),
				(anchorState, h1, h2, h3) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();
					const heights = [h1, h2, h3];

					// 计算标准化的列索引
					const normalizedCol = 0 - anchorState.minColSeen;

					// 创建节点并注册
					const positions: number[] = [];

					for (let i = 0; i < heights.length; i++) {
						const normalizedRow = i - anchorState.minRowSeen;

						const pos = calculateNodePosition(
							`node_${i}`,
							i,
							0,
							anchorState,
							columnTracks,
							config
						);

						registerNodeInColumn(
							`node_${i}`,
							normalizedCol,
							normalizedRow,
							pos.y,
							heights[i],
							config.nodeWidth,
							columnTracks,
							config.nodeWidth
						);

						positions.push(pos.y);
					}

					// 验证间距
					const gap1 = positions[1] - (positions[0] + heights[0]);
					const gap2 = positions[2] - (positions[1] + heights[1]);

					expect(gap1).toBe(config.verticalGap);
					expect(gap2).toBe(config.verticalGap);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should calculate repositioning correctly after height change", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 100, max: 500 }), // 初始高度
				fc.integer({ min: 50, max: 300 }),  // 高度增量
				fc.integer({ min: 100, max: 300 }), // 第二个节点高度
				fc.integer({ min: 100, max: 300 }), // 第三个节点高度
				(initialHeight, heightDelta, h2, h3) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 设置初始列追踪
					const baseY = 200;
					columnTracks.set(0, {
						col: 0,
						nodes: [
							{ nodeId: "node_0", row: 0, y: baseY, actualHeight: initialHeight },
							{ nodeId: "node_1", row: 1, y: baseY + initialHeight + config.verticalGap, actualHeight: h2 },
							{ nodeId: "node_2", row: 2, y: baseY + initialHeight + config.verticalGap + h2 + config.verticalGap, actualHeight: h3 },
						],
						maxWidth: 360,
					});

					// 更新第一个节点的高度
					const newHeight = initialHeight + heightDelta;
					const track = columnTracks.get(0)!;
					track.nodes[0].actualHeight = newHeight;

					// 计算重新定位
					const updates = calculateRepositioning(0, 0, columnTracks, config);

					// 应该有 2 个更新（node_1 和 node_2）
					expect(updates.length).toBe(2);

					// 验证新位置
					const expectedY1 = baseY + newHeight + config.verticalGap;
					const expectedY2 = expectedY1 + h2 + config.verticalGap;

					const update1 = updates.find(u => u.nodeId === "node_1");
					const update2 = updates.find(u => u.nodeId === "node_2");

					expect(update1?.newY).toBe(expectedY1);
					expect(update2?.newY).toBe(expectedY2);
				}
			),
			{ numRuns: 100 }
		);
	});
});

// ============================================================================
// Property 9: 无重叠不变量
// ============================================================================

describe("Property 9: No Overlap Invariant", () => {
	/**
	 * Property 9: 无重叠不变量
	 *
	 * 对于同一列中的任意两个节点 A 和 B，其中 A.row < B.row，
	 * 不变量 B.y >= A.y + A.actualHeight + VERTICAL_GAP 应在流式传输期间和之后始终成立。
	 *
	 * **Validates: Requirements 7.2**
	 */
	it("should detect overlaps when B.y < A.y + A.height + gap", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 100, max: 500 }), // nodeA Y
				fc.integer({ min: 100, max: 300 }), // nodeA height
				fc.integer({ min: 0, max: 50 }),    // overlap amount
				(nodeAY, nodeAHeight, overlapAmount) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 创建重叠的节点配置
					const minYForB = nodeAY + nodeAHeight + config.verticalGap;
					const nodeBY = minYForB - overlapAmount - 10; // 确保重叠

					columnTracks.set(0, {
						col: 0,
						nodes: [
							{ nodeId: "node_a", row: 0, y: nodeAY, actualHeight: nodeAHeight },
							{ nodeId: "node_b", row: 1, y: nodeBY, actualHeight: 100 },
						],
						maxWidth: 360,
					});

					// 检测重叠
					const corrections = detectOverlaps(0, columnTracks, config);

					// 应该检测到重叠
					expect(corrections.length).toBe(1);
					expect(corrections[0].nodeId).toBe("node_b");
					expect(corrections[0].correctedY).toBe(minYForB);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should not report overlaps when nodes are properly spaced", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 100, max: 500 }), // nodeA Y
				fc.integer({ min: 100, max: 300 }), // nodeA height
				fc.integer({ min: 0, max: 100 }),   // extra gap
				(nodeAY, nodeAHeight, extraGap) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 创建正确间距的节点配置
					const nodeBY = nodeAY + nodeAHeight + config.verticalGap + extraGap;

					columnTracks.set(0, {
						col: 0,
						nodes: [
							{ nodeId: "node_a", row: 0, y: nodeAY, actualHeight: nodeAHeight },
							{ nodeId: "node_b", row: 1, y: nodeBY, actualHeight: 100 },
						],
						maxWidth: 360,
					});

					// 检测重叠
					const corrections = detectOverlaps(0, columnTracks, config);

					// 不应该有重叠
					expect(corrections.length).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should validate no overlap invariant for all node pairs", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.record({
						height: fc.integer({ min: 50, max: 300 }),
					}),
					{ minLength: 3, maxLength: 6 }
				),
				(nodeConfigs) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 使用正确的堆叠公式创建节点
					let currentY = 200; // 起始 Y
					const nodes: ColumnNodeInfo[] = nodeConfigs.map((nc, i) => {
						const node: ColumnNodeInfo = {
							nodeId: `node_${i}`,
							row: i,
							y: currentY,
							actualHeight: nc.height,
						};
						currentY = currentY + nc.height + config.verticalGap;
						return node;
					});

					columnTracks.set(0, {
						col: 0,
						nodes,
						maxWidth: 360,
					});

					// 验证无重叠不变量
					const result = validateNoOverlapInvariant(columnTracks, config);

					expect(result.valid).toBe(true);
					expect(result.violations.length).toBe(0);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should detect multiple overlaps in a column", () => {
		const config = createConfig();
		const columnTracks = new Map<number, ColumnTrack>();

		// 创建多个重叠的节点
		columnTracks.set(0, {
			col: 0,
			nodes: [
				{ nodeId: "node_0", row: 0, y: 100, actualHeight: 200 },
				{ nodeId: "node_1", row: 1, y: 150, actualHeight: 200 }, // 重叠
				{ nodeId: "node_2", row: 2, y: 200, actualHeight: 200 }, // 重叠
			],
			maxWidth: 360,
		});

		const corrections = detectOverlaps(0, columnTracks, config);

		// 应该检测到 2 个重叠
		expect(corrections.length).toBe(2);
	});

	it("should maintain invariant after repositioning", () => {
		fc.assert(
			fc.property(
				fc.array(
					fc.integer({ min: 50, max: 300 }),
					{ minLength: 3, maxLength: 5 }
				),
				fc.integer({ min: 0, max: 2 }), // 要更改的节点索引
				fc.integer({ min: 50, max: 200 }), // 高度增量
				(heights, changeIndex, heightDelta) => {
					const config = createConfig();
					const columnTracks = new Map<number, ColumnTrack>();

					// 创建初始正确堆叠的节点
					let currentY = 200;
					const nodes: ColumnNodeInfo[] = heights.map((h, i) => {
						const node: ColumnNodeInfo = {
							nodeId: `node_${i}`,
							row: i,
							y: currentY,
							actualHeight: h,
						};
						currentY = currentY + h + config.verticalGap;
						return node;
					});

					columnTracks.set(0, {
						col: 0,
						nodes,
						maxWidth: 360,
					});

					// 更新节点高度
					const actualChangeIndex = Math.min(changeIndex, heights.length - 1);
					const track = columnTracks.get(0)!;
					track.nodes[actualChangeIndex].actualHeight += heightDelta;

					// 计算重新定位
					const updates = calculateRepositioning(0, actualChangeIndex, columnTracks, config);

					// 应用更新
					for (const update of updates) {
						const node = track.nodes.find(n => n.nodeId === update.nodeId);
						if (node) {
							node.y = update.newY;
						}
					}

					// 验证无重叠不变量
					const result = validateNoOverlapInvariant(columnTracks, config);
					expect(result.valid).toBe(true);
				}
			),
			{ numRuns: 100 }
		);
	});
});

// ============================================================================
// 组边界计算测试
// ============================================================================

describe("calculateGroupBounds", () => {
	it("should only expand, never shrink", () => {
		fc.assert(
			fc.property(
				fc.integer({ min: 100, max: 500 }), // 当前宽度
				fc.integer({ min: 100, max: 500 }), // 当前高度
				fc.array(
					fc.record({
						x: fc.integer({ min: 0, max: 1000 }),
						y: fc.integer({ min: 0, max: 1000 }),
						width: fc.integer({ min: 100, max: 400 }),
						height: fc.integer({ min: 100, max: 400 }),
					}),
					{ minLength: 1, maxLength: 5 }
				),
				(currentWidth, currentHeight, members) => {
					const config = createConfig();
					const anchorState: AnchorState = {
						anchorX: 0,
						anchorY: 0,
						anchorLocked: true,
						minRowSeen: 0,
						minColSeen: 0,
						edgeDirection: "left",
					};

					const currentBounds: GroupBounds = {
						x: 0,
						y: 0,
						width: currentWidth,
						height: currentHeight,
					};

					const result = calculateGroupBounds(
						currentBounds,
						members as NodeBounds[],
						anchorState,
						config
					);

					// 结果应该 >= 当前尺寸
					expect(result.width).toBeGreaterThanOrEqual(currentWidth);
					expect(result.height).toBeGreaterThanOrEqual(currentHeight);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should return current dimensions when no members", () => {
		const config = createConfig();
		const anchorState: AnchorState = {
			anchorX: 100,
			anchorY: 100,
			anchorLocked: true,
			minRowSeen: 0,
			minColSeen: 0,
			edgeDirection: "left",
		};

		const currentBounds: GroupBounds = {
			x: 100,
			y: 100,
			width: 400,
			height: 300,
		};

		const result = calculateGroupBounds(
			currentBounds,
			[],
			anchorState,
			config
		);

		expect(result.width).toBe(400);
		expect(result.height).toBe(300);
	});
});


// ============================================================================
// Property 6: 配置使用
// ============================================================================

describe("Property 6: Configuration Usage", () => {
	/**
	 * Property 6: 配置使用
	 *
	 * Feature: group-generation-refactor, Property 6: Configuration Usage
	 *
	 * 对于任何布局计算，Layout_Engine 应使用 Configuration_Manager 中的值，
	 * 而不是硬编码的数字。更改配置值应影响所有后续计算。
	 *
	 * **Validates: Requirements 5.10**
	 */

	it("should use verticalGap from config in position calculations", () => {
		fc.assert(
			fc.property(
				// 生成不同的垂直间距值
				fc.integer({ min: 20, max: 200 }),
				fc.integer({ min: 20, max: 200 }),
				// 使用固定的锚点状态
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				(gap1, gap2, anchorX, anchorY) => {
					// 确保两个间距值不同
					const verticalGap1 = gap1;
					const verticalGap2 = gap1 === gap2 ? gap2 + 10 : gap2;

					// 创建两个不同配置
					const config1 = createConfig({ verticalGap: verticalGap1 });
					const config2 = createConfig({ verticalGap: verticalGap2 });

					// 使用固定的锚点状态
					const anchorState: AnchorState = {
						anchorX,
						anchorY,
						anchorLocked: true,
						minRowSeen: 0,
						minColSeen: 0,
						edgeDirection: "left",
					};

					// 创建列追踪，包含一个已存在的节点
					const columnTracks1 = new Map<number, ColumnTrack>();
					const columnTracks2 = new Map<number, ColumnTrack>();

					const existingNode: ColumnNodeInfo = {
						nodeId: "node_0",
						row: 0,
						y: anchorState.anchorY + config1.groupHeaderHeight,
						actualHeight: 200,
					};

					columnTracks1.set(0, {
						col: 0,
						nodes: [existingNode],
						maxWidth: 360,
					});

					columnTracks2.set(0, {
						col: 0,
						nodes: [{ ...existingNode }],
						maxWidth: 360,
					});

					// 计算第二个节点的位置（row=1）
					const pos1 = calculateNodePosition(
						"node_1",
						1,
						0,
						anchorState,
						columnTracks1,
						config1
					);

					const pos2 = calculateNodePosition(
						"node_1",
						1,
						0,
						anchorState,
						columnTracks2,
						config2
					);

					// 验证位置差异与间距差异一致
					// 由于 verticalGap1 !== verticalGap2（我们确保了这一点），位置应该不同
					const expectedDiff = verticalGap2 - verticalGap1;
					const actualDiff = pos2.y - pos1.y;
					expect(actualDiff).toBe(expectedDiff);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should use horizontalGap from config in position calculations", () => {
		fc.assert(
			fc.property(
				// 生成不同的水平间距值
				fc.integer({ min: 20, max: 200 }),
				fc.integer({ min: 20, max: 200 }),
				// 使用固定的锚点状态，避免 minColSeen 的影响
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				(gap1, gap2, anchorX, anchorY) => {
					// 确保两个间距值不同
					const horizontalGap1 = gap1;
					const horizontalGap2 = gap1 === gap2 ? gap2 + 10 : gap2;

					// 创建两个不同配置
					const config1 = createConfig({ horizontalGap: horizontalGap1 });
					const config2 = createConfig({ horizontalGap: horizontalGap2 });

					// 使用固定的锚点状态，minColSeen = 0
					const anchorState: AnchorState = {
						anchorX,
						anchorY,
						anchorLocked: true,
						minRowSeen: 0,
						minColSeen: 0,
						edgeDirection: "left",
					};

					// 创建列追踪，包含第一列的节点
					const columnTracks1 = new Map<number, ColumnTrack>();
					const columnTracks2 = new Map<number, ColumnTrack>();

					columnTracks1.set(0, {
						col: 0,
						nodes: [],
						maxWidth: 360,
					});

					columnTracks2.set(0, {
						col: 0,
						nodes: [],
						maxWidth: 360,
					});

					// 计算第二列节点的位置（col=1）
					const pos1 = calculateNodePosition(
						"node_1",
						0,
						1,
						anchorState,
						columnTracks1,
						config1
					);

					const pos2 = calculateNodePosition(
						"node_1",
						0,
						1,
						anchorState,
						columnTracks2,
						config2
					);

					// 如果水平间距不同，X 位置应该不同
					if (horizontalGap1 !== horizontalGap2) {
						expect(pos1.x).not.toBe(pos2.x);
					}

					// 验证位置差异与间距差异一致
					const expectedDiff = horizontalGap2 - horizontalGap1;
					const actualDiff = pos2.x - pos1.x;
					expect(actualDiff).toBe(expectedDiff);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should use groupHeaderHeight from config for first row", () => {
		fc.assert(
			fc.property(
				// 生成不同的头部高度
				fc.integer({ min: 20, max: 100 }),
				fc.integer({ min: 40, max: 150 }),
				anchorStateArb,
				(header1, header2, anchorState) => {
					// 确保配置不同
					const config1 = createConfig({
						groupHeaderHeight: header1,
					});
					const config2 = createConfig({
						groupHeaderHeight: header2,
					});

					const columnTracks = new Map<number, ColumnTrack>();

					// 计算第一行节点的位置
					const pos1 = calculateNodePosition(
						"node_0",
						0,
						0,
						anchorState,
						columnTracks,
						config1
					);

					const pos2 = calculateNodePosition(
						"node_0",
						0,
						0,
						anchorState,
						columnTracks,
						config2
					);

					// 验证 Y 位置使用了配置中的值
					// 第一行公式: y = anchorY + groupHeaderHeight + padding + topSafeZone
					const topSafeZone = anchorState.edgeDirection === "top"
						? config1.edgeLabelSafeZone
						: 0;

					const expectedY1 = anchorState.anchorY + header1 + config1.groupPadding + topSafeZone;
					const expectedY2 = anchorState.anchorY + header2 + config2.groupPadding + topSafeZone;

					expect(pos1.y).toBe(expectedY1);
					expect(pos2.y).toBe(expectedY2);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should use edgeLabelSafeZone from config for safe zone calculations", () => {
		fc.assert(
			fc.property(
				// 生成不同的安全区域值
				fc.integer({ min: 10, max: 100 }),
				fc.integer({ min: 10, max: 100 }),
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				(safeZone1, safeZone2, anchorX, anchorY) => {
					// 确保两个安全区域值不同
					const zone1 = safeZone1;
					const zone2 = safeZone1 === safeZone2 ? safeZone2 + 10 : safeZone2;

					// 创建两个不同配置
					const config1 = createConfig({ edgeLabelSafeZone: zone1 });
					const config2 = createConfig({ edgeLabelSafeZone: zone2 });

					// 创建锚点状态，边缘从顶部连接（触发顶部安全区域）
					const anchorStateTop: AnchorState = {
						anchorX,
						anchorY,
						anchorLocked: true,
						minRowSeen: 0,
						minColSeen: 0,
						edgeDirection: "top",
					};

					const columnTracks = new Map<number, ColumnTrack>();

					// 计算第一行节点的位置
					const pos1 = calculateNodePosition(
						"node_0",
						0,
						0,
						anchorStateTop,
						columnTracks,
						config1
					);

					const pos2 = calculateNodePosition(
						"node_0",
						0,
						0,
						anchorStateTop,
						columnTracks,
						config2
					);

					// 如果安全区域不同，Y 位置应该不同
					if (zone1 !== zone2) {
						expect(pos1.y).not.toBe(pos2.y);
					}

					// 验证位置差异与安全区域差异一致
					const expectedDiff = zone2 - zone1;
					const actualDiff = pos2.y - pos1.y;
					expect(actualDiff).toBe(expectedDiff);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should use edgeLabelSafeZone from config in group bounds calculation", () => {
		fc.assert(
			fc.property(
				// 生成不同的 groupPadding 值
				fc.integer({ min: 10, max: 100 }),
				fc.integer({ min: 10, max: 100 }),
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				(padding1, padding2, anchorX, anchorY) => {
					// 确保两个内边距值不同
					const groupPadding1 = padding1;
					const groupPadding2 = padding1 === padding2 ? padding2 + 10 : padding2;

					// 创建两个不同配置
					const config1 = createConfig({ groupPadding: groupPadding1 });
					const config2 = createConfig({ groupPadding: groupPadding2 });

					const anchorState: AnchorState = {
						anchorX,
						anchorY,
						anchorLocked: true,
						minRowSeen: 0,
						minColSeen: 0,
						edgeDirection: "left",
					};

					const currentBounds: GroupBounds = {
						x: anchorX,
						y: anchorY,
						width: 100,
						height: 100,
					};

					// 创建一个成员节点
					const members: NodeBounds[] = [{
						x: anchorX + 50,
						y: anchorY + 50,
						width: 200,
						height: 200,
					}];

					// 计算组边界
					const result1 = calculateGroupBounds(
						currentBounds,
						members,
						anchorState,
						config1
					);

					const result2 = calculateGroupBounds(
						currentBounds,
						members,
						anchorState,
						config2
					);

					// 如果内边距不同，宽度和高度应该不同
					if (groupPadding1 !== groupPadding2) {
						expect(result1.width).not.toBe(result2.width);
						expect(result1.height).not.toBe(result2.height);
					}

					// 验证差异与内边距差异一致
					const expectedDiff = groupPadding2 - groupPadding1;
					const actualWidthDiff = result2.width - result1.width;
					const actualHeightDiff = result2.height - result1.height;
					expect(actualWidthDiff).toBe(expectedDiff);
					expect(actualHeightDiff).toBe(expectedDiff);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should use nodeWidth from config as default column width", () => {
		fc.assert(
			fc.property(
				// 生成不同的节点宽度
				fc.integer({ min: 200, max: 500 }),
				fc.integer({ min: 200, max: 500 }),
				// 使用固定的锚点状态，避免 minColSeen 的影响
				fc.integer({ min: 0, max: 5000 }),
				fc.integer({ min: 0, max: 5000 }),
				(width1, width2, anchorX, anchorY) => {
					// 确保两个宽度值不同
					const nodeWidth1 = width1;
					const nodeWidth2 = width1 === width2 ? width2 + 50 : width2;

					// 创建两个不同配置
					const config1 = createConfig({ nodeWidth: nodeWidth1 });
					const config2 = createConfig({ nodeWidth: nodeWidth2 });

					// 使用固定的锚点状态，minColSeen = 0
					const anchorState: AnchorState = {
						anchorX,
						anchorY,
						anchorLocked: true,
						minRowSeen: 0,
						minColSeen: 0,
						edgeDirection: "left",
					};

					// 创建空的列追踪（使用默认宽度）
					const columnTracks1 = new Map<number, ColumnTrack>();
					const columnTracks2 = new Map<number, ColumnTrack>();

					// 计算第二列节点的位置（col=1）
					// 第一列使用默认宽度
					const pos1 = calculateNodePosition(
						"node_1",
						0,
						1,
						anchorState,
						columnTracks1,
						config1
					);

					const pos2 = calculateNodePosition(
						"node_1",
						0,
						1,
						anchorState,
						columnTracks2,
						config2
					);

					// 如果节点宽度不同，X 位置应该不同
					// 因为第一列的宽度使用默认 nodeWidth
					if (nodeWidth1 !== nodeWidth2) {
						expect(pos1.x).not.toBe(pos2.x);
					}

					// 验证位置差异与宽度差异一致
					const expectedDiff = nodeWidth2 - nodeWidth1;
					const actualDiff = pos2.x - pos1.x;
					expect(actualDiff).toBe(expectedDiff);
				}
			),
			{ numRuns: 100 }
		);
	});

	it("should propagate config changes to all subsequent calculations", () => {
		fc.assert(
			fc.property(
				// 生成配置值
				fc.integer({ min: 50, max: 150 }),
				fc.integer({ min: 20, max: 80 }),
				fc.integer({ min: 40, max: 100 }),
				anchorStateArb,
				// 生成多个节点的行列坐标
				fc.array(
					fc.record({
						row: fc.integer({ min: 0, max: 5 }),
						col: fc.integer({ min: 0, max: 3 }),
					}),
					{ minLength: 3, maxLength: 10 }
				),
				(vGap, hGap, headerHeight, anchorState, nodeCoords) => {
					// 创建配置
					const config = createConfig({
						verticalGap: vGap,
						horizontalGap: hGap,
						groupHeaderHeight: headerHeight,
					});

					const columnTracks = new Map<number, ColumnTrack>();

					// 计算所有节点的位置
					const positions = nodeCoords.map((coord, i) => {
						const pos = calculateNodePosition(
							`node_${i}`,
							coord.row,
							coord.col,
							anchorState,
							columnTracks,
							config
						);

						// 注册节点到列追踪
						registerNodeInColumn(
							`node_${i}`,
							coord.col - anchorState.minColSeen,
							coord.row - anchorState.minRowSeen,
							pos.y,
							200,
							config.nodeWidth,
							columnTracks,
							config.nodeWidth
						);

						return { ...coord, ...pos };
					});

					// 验证所有位置都使用了配置中的值
					// 第一行的 Y 位置应该使用 headerHeight + groupPadding
					const firstRowPositions = positions.filter(p => p.row === 0);
					const topSafeZone = anchorState.edgeDirection === "top"
						? config.edgeLabelSafeZone
						: 0;
					const expectedFirstRowY = anchorState.anchorY + headerHeight + config.groupPadding + topSafeZone;

					for (const pos of firstRowPositions) {
						expect(pos.y).toBe(expectedFirstRowY);
					}
				}
			),
			{ numRuns: 100 }
		);
	});
});
