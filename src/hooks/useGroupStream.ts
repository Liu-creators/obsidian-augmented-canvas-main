/**
 * useGroupStream Hook - 组流式生成的状态管理模块
 *
 * 此模块封装了所有流式相关逻辑，为组件提供简洁的接口。
 * 由于项目不使用 React，这是一个类似 hook 的工厂函数，
 * 提供状态管理和生命周期回调。
 *
 * 主要功能：
 * - 封装 GroupStreamManager 和 CanvasRenderer
 * - 提供简洁的状态访问接口
 * - 支持新建生成和重新生成
 * - 提供生命周期回调
 *
 * Requirements: 2.1-2.7, 6.1-6.5, 8.1, 8.2, 8.4
 *
 * @module hooks/useGroupStream
 *
 * @example
 * ```typescript
 * import { useGroupStream } from './hooks/useGroupStream';
 *
 * // 创建流式管理器
 * const groupStream = useGroupStream({
 *   canvas,
 *   settings,
 *   onComplete: () => console.log('生成完成'),
 *   onError: (error) => console.error('错误:', error),
 *   onNodeCreated: (id, node) => console.log(`创建节点: ${id}`),
 * });
 *
 * // 开始新的生成
 * await groupStream.startGeneration(messages);
 *
 * // 检查状态
 * console.log(groupStream.status); // 'streaming'
 * console.log(groupStream.progress); // 50
 *
 * // 重新生成现有组
 * await groupStream.regenerateGroup('group-1', messages);
 *
 * // 中止
 * groupStream.abort();
 *
 * // 重置
 * groupStream.reset();
 * ```
 */

import { Canvas, CanvasNode } from "../obsidian/canvas-internal";
import { AugmentedCanvasSettings } from "../settings/AugmentedCanvasSettings";
import { NodeXML, EdgeXML } from "../types/xml.d";
import {
	GroupStreamManager,
	ChatMessage,
	ModelConfig,
	StreamResponseFunction,
} from "../utils/groupGeneration/groupStreamManager";
import {
	StreamingStatus,
	StreamingCallbacks,
	GenerationOptions,
} from "../utils/groupGeneration/types";
import { CanvasRenderer } from "../utils/groupGeneration/canvasRenderer";
import { createConfigFromSettings } from "../utils/groupGeneration/config";
// 注意：streamResponse 需要在运行时通过选项传入，或者使用默认实现
// 这样可以避免在测试环境中导入 OpenAI 依赖
// import { streamResponse } from "../utils/chatgpt";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Hook 返回类型
 *
 * Requirements: 2.6, 2.7 - 暴露状态给消费者
 */
export interface UseGroupStreamReturn {
	/** 当前流式状态 */
	status: StreamingStatus;

	/** 流式传输期间解析的节点 */
	nodes: NodeXML[];

	/** 流式传输期间解析的边 */
	edges: EdgeXML[];

	/** 错误信息（如果有） */
	error: Error | null;

	/** 进度百分比（0-100） */
	progress: number;

	/** 开始新的生成
	 * Requirements: 2.1 - 调用 AI API
	 */
	startGeneration: (
		messages: ChatMessage[],
		options?: GenerationOptions
	) => Promise<void>;

	/** 重新生成现有组
	 * Requirements: 2.4, 6.2, 6.3 - 重新生成支持
	 */
	regenerateGroup: (
		groupId: string,
		messages: ChatMessage[]
	) => Promise<void>;

	/** 中止当前生成 */
	abort: () => void;

	/** 重置状态 */
	reset: () => void;

	/** 获取 GroupStreamManager 实例（用于高级用例） */
	getManager: () => GroupStreamManager;

	/** 获取 CanvasRenderer 实例（用于高级用例） */
	getRenderer: () => CanvasRenderer | null;
}

/**
 * Hook 选项
 *
 * Requirements: 6.5 - 生命周期回调
 */
export interface UseGroupStreamOptions {
	/** Canvas 实例 */
	canvas: Canvas;

	/** 源节点（用于定位） */
	sourceNode?: CanvasNode;

	/** 插件设置 */
	settings: AugmentedCanvasSettings;

	/** 完成回调 */
	onComplete?: () => void;

	/** 错误回调 */
	onError?: (error: Error) => void;

	/** 节点创建回调 */
	onNodeCreated?: (nodeId: string, node: NodeXML) => void;

	/** 节点更新回调 */
	onNodeUpdated?: (nodeId: string, node: NodeXML) => void;

	/** 边创建回调 */
	onEdgeCreated?: (edge: EdgeXML) => void;

	/** 进度更新回调 */
	onProgress?: (progress: number) => void;

	/** 开始回调 */
	onStart?: () => void;

	/** 自定义流式响应函数（用于测试） */
	streamResponseFn?: StreamResponseFunction;
}

// ============================================================================
// 内部状态类
// ============================================================================

/**
 * GroupStream 状态管理器
 * 封装 GroupStreamManager 和 CanvasRenderer 的协调逻辑
 */
class GroupStreamState {
	private manager: GroupStreamManager;
	private renderer: CanvasRenderer | null = null;
	private canvas: Canvas;
	private settings: AugmentedCanvasSettings;
	private sourceNode?: CanvasNode;
	private userCallbacks: Partial<StreamingCallbacks> = {};

	// 缓存的状态值（用于 useMemo 优化）
	// Requirements: 8.1 - useMemo 优化
	private cachedNodes: NodeXML[] = [];
	private cachedEdges: EdgeXML[] = [];
	private cachedStatus: StreamingStatus = "idle";
	private cachedError: Error | null = null;
	private cachedProgress: number = 0;

	constructor(options: UseGroupStreamOptions) {
		this.canvas = options.canvas;
		this.settings = options.settings;
		this.sourceNode = options.sourceNode;

		// 保存用户回调
		this.userCallbacks = {
			onComplete: options.onComplete,
			onError: options.onError,
			onNodeCreated: options.onNodeCreated,
			onNodeUpdated: options.onNodeUpdated,
			onEdgeCreated: options.onEdgeCreated,
			onProgress: options.onProgress,
			onStart: options.onStart,
		};

		// 创建内部回调，合并用户回调
		const internalCallbacks: StreamingCallbacks = {
			onStart: () => {
				this.cachedStatus = "streaming";
				this.userCallbacks.onStart?.();
			},
			onNodeCreated: (nodeId, node) => {
				this.updateCachedNodes();
				this.userCallbacks.onNodeCreated?.(nodeId, node);
			},
			onNodeUpdated: (nodeId, node) => {
				this.updateCachedNodes();
				this.userCallbacks.onNodeUpdated?.(nodeId, node);
			},
			onEdgeCreated: (edge) => {
				this.updateCachedEdges();
				this.userCallbacks.onEdgeCreated?.(edge);
			},
			onProgress: (progress) => {
				this.cachedProgress = progress;
				this.userCallbacks.onProgress?.(progress);
			},
			onComplete: () => {
				this.cachedStatus = "complete";
				this.cachedProgress = 100;
				this.userCallbacks.onComplete?.();
			},
			onError: (error) => {
				this.cachedStatus = "error";
				this.cachedError = error;
				this.userCallbacks.onError?.(error);
			},
		};

		// 创建 GroupStreamManager
		// Requirements: 2.1-2.7 - 流式管理
		this.manager = new GroupStreamManager(
			internalCallbacks,
			options.streamResponseFn
		);

		// 如果没有提供自定义流式函数，使用默认的
		if (!options.streamResponseFn) {
			this.manager.setStreamResponseFunction(this.createDefaultStreamFn());
		}

		// 创建 CanvasRenderer
		const config = createConfigFromSettings(this.settings);
		this.renderer = new CanvasRenderer(this.canvas, config);
	}

	/**
	 * 创建默认的流式响应函数
	 * 动态导入 chatgpt 模块以避免测试环境问题
	 */
	private createDefaultStreamFn(): StreamResponseFunction {
		return async (
			apiKey: string,
			messages: ChatMessage[],
			config: { max_tokens?: number; model?: string; temperature?: number },
			callback: (chunk: string | null, error?: Error) => void
		): Promise<void> => {
			// 动态导入以避免测试环境中的 OpenAI 依赖问题
			const { streamResponse } = await import("../utils/chatgpt");
			await streamResponse(
				apiKey,
				messages as any, // ChatCompletionMessageParam 兼容
				{
					model: config.model,
					max_tokens: config.max_tokens,
					temperature: config.temperature,
				},
				callback
			);
		};
	}

	/**
	 * 更新缓存的节点列表
	 */
	private updateCachedNodes(): void {
		this.cachedNodes = this.manager.getNodes();
	}

	/**
	 * 更新缓存的边列表
	 */
	private updateCachedEdges(): void {
		this.cachedEdges = this.manager.getEdges();
	}

	/**
	 * 开始生成
	 *
	 * Requirements: 2.1 - 调用 AI API
	 * Requirements: 8.2 - useCallback 优化
	 */
	async startGeneration(
		messages: ChatMessage[],
		options?: GenerationOptions
	): Promise<void> {
		// 重置缓存状态
		this.cachedNodes = [];
		this.cachedEdges = [];
		this.cachedError = null;
		this.cachedProgress = 0;

		// 重置渲染器
		this.renderer?.reset();

		// 构建模型配置
		const modelConfig: ModelConfig = {
			model: this.settings.apiModel,
			max_tokens: this.settings.maxResponseTokens || undefined,
			temperature: this.settings.temperature,
		};

		// 开始生成
		await this.manager.startGeneration(
			this.settings.apiKey,
			messages,
			modelConfig,
			options
		);
	}

	/**
	 * 重新生成现有组
	 *
	 * Requirements: 2.4, 6.2, 6.3 - 重新生成支持
	 */
	async regenerateGroup(
		groupId: string,
		messages: ChatMessage[]
	): Promise<void> {
		// 获取组节点
		const groupNode = this.canvas.nodes.get(groupId);

		// 保存组位置（用于位置保留）
		// Requirements: 6.3 - 保留组位置
		let preservedBounds: { x: number; y: number; width: number; height: number } | undefined;
		if (groupNode) {
			preservedBounds = {
				x: groupNode.x,
				y: groupNode.y,
				width: groupNode.width,
				height: groupNode.height,
			};
		}

		// 清除现有节点
		// Requirements: 6.2 - 清除现有节点
		if (this.renderer && groupId) {
			await this.renderer.clearGroup(groupId);
		}

		// 使用 targetGroupId 开始生成
		await this.startGeneration(messages, {
			targetGroupId: groupId,
			clearExisting: true,
			preserveBounds: true,
		});
	}

	/**
	 * 中止当前生成
	 */
	abort(): void {
		this.manager.abort();
		this.cachedStatus = "idle";
	}

	/**
	 * 重置状态
	 */
	reset(): void {
		this.manager.reset();
		this.renderer?.reset();
		this.cachedNodes = [];
		this.cachedEdges = [];
		this.cachedStatus = "idle";
		this.cachedError = null;
		this.cachedProgress = 0;
	}

	// ========================================================================
	// Getters
	// ========================================================================

	get status(): StreamingStatus {
		return this.manager.getStateRef().status;
	}

	get nodes(): NodeXML[] {
		return this.cachedNodes;
	}

	get edges(): EdgeXML[] {
		return this.cachedEdges;
	}

	get error(): Error | null {
		return this.manager.getError();
	}

	get progress(): number {
		return this.cachedProgress;
	}

	getManager(): GroupStreamManager {
		return this.manager;
	}

	getRenderer(): CanvasRenderer | null {
		return this.renderer;
	}
}

// ============================================================================
// 工厂函数
// ============================================================================

/**
 * 创建组流式生成的状态管理器
 *
 * 这是一个类似 React hook 的工厂函数，封装了所有流式相关逻辑。
 * 由于项目不使用 React，返回一个包含状态和方法的对象。
 *
 * @param options - Hook 选项
 * @returns Hook 返回对象
 *
 * Requirements: 2.1-2.7, 6.1-6.5, 8.1, 8.2, 8.4
 *
 * @example
 * ```typescript
 * const groupStream = useGroupStream({
 *   canvas,
 *   settings,
 *   onComplete: () => console.log('Generation complete'),
 *   onError: (error) => console.error('Error:', error),
 * });
 *
 * // 开始生成
 * await groupStream.startGeneration(messages);
 *
 * // 检查状态
 * console.log(groupStream.status); // 'idle' | 'streaming' | 'complete' | 'error'
 *
 * // 重新生成组
 * await groupStream.regenerateGroup(groupId, messages);
 *
 * // 中止
 * groupStream.abort();
 * ```
 */
export function useGroupStream(options: UseGroupStreamOptions): UseGroupStreamReturn {
	const state = new GroupStreamState(options);

	// 返回类似 hook 的接口
	// Requirements: 8.2 - useCallback 优化（通过绑定方法实现）
	return {
		get status() {
			return state.status;
		},
		get nodes() {
			return state.nodes;
		},
		get edges() {
			return state.edges;
		},
		get error() {
			return state.error;
		},
		get progress() {
			return state.progress;
		},
		startGeneration: state.startGeneration.bind(state),
		regenerateGroup: state.regenerateGroup.bind(state),
		abort: state.abort.bind(state),
		reset: state.reset.bind(state),
		getManager: state.getManager.bind(state),
		getRenderer: state.getRenderer.bind(state),
	};
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 创建用于测试的 mock 流式响应函数
 *
 * 此函数创建一个模拟的流式响应函数，用于单元测试和集成测试。
 * 它会按顺序返回指定的数据块，每个块之间有可配置的延迟。
 *
 * @param chunks - 要返回的数据块数组
 * @param delay - 每个块之间的延迟（毫秒），默认 10ms
 * @returns Mock 流式响应函数
 *
 * @example
 * ```typescript
 * // 创建 mock 函数
 * const mockStreamFn = createMockStreamResponseFn([
 *   '<node id="n1"><content>节点1</content></node>',
 *   '<node id="n2"><content>节点2</content></node>',
 *   '<edge from="n1" to="n2" />',
 * ], 50);
 *
 * // 在测试中使用
 * const groupStream = useGroupStream({
 *   canvas,
 *   settings,
 *   streamResponseFn: mockStreamFn,
 * });
 *
 * await groupStream.startGeneration(messages);
 * ```
 */
export function createMockStreamResponseFn(
	chunks: string[],
	delay: number = 10
): StreamResponseFunction {
	return async (
		_apiKey: string,
		_messages: ChatMessage[],
		_config: { max_tokens?: number; model?: string; temperature?: number },
		callback: (chunk: string | null, error?: Error) => void
	): Promise<void> => {
		for (const chunk of chunks) {
			await new Promise(resolve => setTimeout(resolve, delay));
			callback(chunk);
		}
		callback(null); // 流结束
	};
}

/**
 * 创建用于测试的 mock 错误流式响应函数
 *
 * 此函数创建一个会在指定数量的数据块后抛出错误的模拟函数，
 * 用于测试错误处理逻辑。
 *
 * @param error - 要抛出的错误
 * @param chunksBeforeError - 错误前返回的数据块数量，默认 0
 * @returns Mock 流式响应函数
 *
 * @example
 * ```typescript
 * // 创建立即失败的 mock 函数
 * const mockErrorFn = createMockErrorStreamResponseFn(
 *   new Error('API 错误')
 * );
 *
 * // 创建在 2 个块后失败的 mock 函数
 * const mockDelayedErrorFn = createMockErrorStreamResponseFn(
 *   new Error('网络超时'),
 *   2
 * );
 *
 * // 在测试中使用
 * const groupStream = useGroupStream({
 *   canvas,
 *   settings,
 *   streamResponseFn: mockErrorFn,
 *   onError: (error) => {
 *     expect(error.message).toBe('API 错误');
 *   },
 * });
 * ```
 */
export function createMockErrorStreamResponseFn(
	error: Error,
	chunksBeforeError: number = 0
): StreamResponseFunction {
	return async (
		_apiKey: string,
		_messages: ChatMessage[],
		_config: { max_tokens?: number; model?: string; temperature?: number },
		callback: (chunk: string | null, error?: Error) => void
	): Promise<void> => {
		for (let i = 0; i < chunksBeforeError; i++) {
			await new Promise(resolve => setTimeout(resolve, 10));
			callback(`chunk${i}`);
		}
		callback(null, error);
	};
}

