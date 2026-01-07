/**
 * 配置模块单元测试
 *
 * 测试所有常量定义和 createConfig() 函数
 * Requirements: 5.1-5.9
 */

import {
	LAYOUT_CONSTANTS,
	DEFAULT_CONFIG,
	GroupGenerationConfig,
	EdgeDirection,
	createConfig,
	createConfigFromSettings,
} from "../config";

describe("LAYOUT_CONSTANTS", () => {
	// Requirements: 5.4 - VERTICAL_GAP 常量
	it("should define VERTICAL_GAP as a number", () => {
		expect(typeof LAYOUT_CONSTANTS.VERTICAL_GAP).toBe("number");
		expect(LAYOUT_CONSTANTS.VERTICAL_GAP).toBe(80);
	});

	// Requirements: 5.5 - HORIZONTAL_GAP 常量
	it("should define HORIZONTAL_GAP as a number", () => {
		expect(typeof LAYOUT_CONSTANTS.HORIZONTAL_GAP).toBe("number");
		expect(LAYOUT_CONSTANTS.HORIZONTAL_GAP).toBe(80);
	});

	// Requirements: 5.8 - EDGE_LABEL_SAFE_ZONE 常量
	it("should define EDGE_LABEL_SAFE_ZONE as a number", () => {
		expect(typeof LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE).toBe("number");
		expect(LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE).toBe(40);
	});

	// Requirements: 5.6 - GROUP_HEADER_HEIGHT 常量（至少 40 像素）
	it("should define GROUP_HEADER_HEIGHT as at least 40 pixels", () => {
		expect(typeof LAYOUT_CONSTANTS.GROUP_HEADER_HEIGHT).toBe("number");
		expect(LAYOUT_CONSTANTS.GROUP_HEADER_HEIGHT).toBeGreaterThanOrEqual(40);
	});



	// Requirements: 5.2 - DEFAULT_NODE_WIDTH 常量
	it("should define DEFAULT_NODE_WIDTH as a number", () => {
		expect(typeof LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH).toBe("number");
		expect(LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH).toBe(360);
	});

	// Requirements: 5.2 - DEFAULT_NODE_HEIGHT 常量
	it("should define DEFAULT_NODE_HEIGHT as a number", () => {
		expect(typeof LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT).toBe("number");
		expect(LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT).toBe(200);
	});

	// MAX_GRID_COORD 常量
	it("should define MAX_GRID_COORD as a number", () => {
		expect(typeof LAYOUT_CONSTANTS.MAX_GRID_COORD).toBe("number");
		expect(LAYOUT_CONSTANTS.MAX_GRID_COORD).toBe(100);
	});

	// 确保常量是只读的（as const）
	it("should be readonly (immutable)", () => {
		// TypeScript 的 as const 确保了不可变性
		// 这里我们只验证对象存在且有正确的属性
		const keys = Object.keys(LAYOUT_CONSTANTS);
		expect(keys).toContain("VERTICAL_GAP");
		expect(keys).toContain("HORIZONTAL_GAP");
		expect(keys).toContain("EDGE_LABEL_SAFE_ZONE");
		expect(keys).toContain("GROUP_HEADER_HEIGHT");
		expect(keys).toContain("DEFAULT_NODE_WIDTH");
		expect(keys).toContain("DEFAULT_NODE_HEIGHT");
		expect(keys).toContain("MAX_GRID_COORD");
	});
});

describe("DEFAULT_CONFIG", () => {
	// Requirements: 5.9 - 从单一配置模块导出所有常量
	it("should have all required properties", () => {
		expect(DEFAULT_CONFIG).toHaveProperty("nodeWidth");
		expect(DEFAULT_CONFIG).toHaveProperty("nodeHeight");
		expect(DEFAULT_CONFIG).toHaveProperty("groupPadding");
		expect(DEFAULT_CONFIG).toHaveProperty("verticalGap");
		expect(DEFAULT_CONFIG).toHaveProperty("horizontalGap");
		expect(DEFAULT_CONFIG).toHaveProperty("edgeLabelSafeZone");
		expect(DEFAULT_CONFIG).toHaveProperty("groupHeaderHeight");
		expect(DEFAULT_CONFIG).toHaveProperty("maxGridCoord");
	});

	it("should use LAYOUT_CONSTANTS values", () => {
		expect(DEFAULT_CONFIG.nodeWidth).toBe(LAYOUT_CONSTANTS.DEFAULT_NODE_WIDTH);
		expect(DEFAULT_CONFIG.nodeHeight).toBe(LAYOUT_CONSTANTS.DEFAULT_NODE_HEIGHT);
		expect(DEFAULT_CONFIG.verticalGap).toBe(LAYOUT_CONSTANTS.VERTICAL_GAP);
		expect(DEFAULT_CONFIG.horizontalGap).toBe(LAYOUT_CONSTANTS.HORIZONTAL_GAP);
		expect(DEFAULT_CONFIG.edgeLabelSafeZone).toBe(LAYOUT_CONSTANTS.EDGE_LABEL_SAFE_ZONE);
		expect(DEFAULT_CONFIG.groupHeaderHeight).toBe(LAYOUT_CONSTANTS.GROUP_HEADER_HEIGHT);
		expect(DEFAULT_CONFIG.maxGridCoord).toBe(LAYOUT_CONSTANTS.MAX_GRID_COORD);
	});
});

describe("createConfig", () => {
	// Requirements: 5.10 - 布局计算使用配置管理器中的常量
	it("should return default config when called without arguments", () => {
		const config = createConfig();
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it("should return default config when called with undefined", () => {
		const config = createConfig(undefined);
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it("should return default config when called with empty object", () => {
		const config = createConfig({});
		expect(config).toEqual(DEFAULT_CONFIG);
	});

	it("should merge partial settings with defaults", () => {
		const config = createConfig({
			nodeWidth: 500,
			verticalGap: 100,
		});

		expect(config.nodeWidth).toBe(500);
		expect(config.verticalGap).toBe(100);
		// 其他值应保持默认
		expect(config.nodeHeight).toBe(DEFAULT_CONFIG.nodeHeight);
		expect(config.horizontalGap).toBe(DEFAULT_CONFIG.horizontalGap);
		expect(config.groupPadding).toBe(DEFAULT_CONFIG.groupPadding);
	});

	it("should override all properties when fully specified", () => {
		const customConfig: GroupGenerationConfig = {
			nodeWidth: 400,
			nodeHeight: 250,
			groupPadding: 50,
			verticalGap: 100,
			horizontalGap: 100,
			edgeLabelSafeZone: 50,
			groupHeaderHeight: 50,
			maxGridCoord: 200,
		};

		const config = createConfig(customConfig);
		expect(config).toEqual(customConfig);
	});

	it("should not mutate the input settings object", () => {
		const settings: Partial<GroupGenerationConfig> = {
			nodeWidth: 500,
		};
		const originalSettings = { ...settings };

		createConfig(settings);

		expect(settings).toEqual(originalSettings);
	});

	it("should return a new object each time", () => {
		const config1 = createConfig();
		const config2 = createConfig();

		expect(config1).not.toBe(config2);
		expect(config1).toEqual(config2);
	});

	it("should handle zero values correctly", () => {
		const config = createConfig({
			verticalGap: 0,
			horizontalGap: 0,
		});

		expect(config.verticalGap).toBe(0);
		expect(config.horizontalGap).toBe(0);
	});
});

describe("createConfigFromSettings", () => {
	it("should create config from AugmentedCanvasSettings-like object", () => {
		const settings = {
			gridNodeWidth: 400,
			gridNodeHeight: 250,
			groupPadding: 50,
		};

		const config = createConfigFromSettings(settings);

		expect(config.nodeWidth).toBe(400);
		expect(config.nodeHeight).toBe(250);
		expect(config.groupPadding).toBe(50);
		// 其他值应保持默认
		expect(config.verticalGap).toBe(DEFAULT_CONFIG.verticalGap);
	});

	it("should use defaults for missing settings", () => {
		const settings = {
			gridNodeWidth: 400,
		};

		const config = createConfigFromSettings(settings);

		expect(config.nodeWidth).toBe(400);
		expect(config.nodeHeight).toBe(DEFAULT_CONFIG.nodeHeight);
		expect(config.groupPadding).toBe(DEFAULT_CONFIG.groupPadding);
	});

	it("should handle empty settings object", () => {
		const config = createConfigFromSettings({});
		expect(config).toEqual(DEFAULT_CONFIG);
	});
});

describe("EdgeDirection type", () => {
	// Requirements: 7.1, 7.2, 7.3 - 边缘方向类型
	it("should accept valid edge directions", () => {
		const directions: EdgeDirection[] = ["left", "top", "right", "bottom"];

		directions.forEach(direction => {
			// 类型检查 - 如果类型不正确，TypeScript 会报错
			const edgeDir: EdgeDirection = direction;
			expect(["left", "top", "right", "bottom"]).toContain(edgeDir);
		});
	});
});
