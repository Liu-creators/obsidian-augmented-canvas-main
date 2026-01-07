/**
 * 组流管理器 - 管理 AI 流式生成的生命周期和状态
 *
 * 此模块是组生成系统的核心，负责：
 * - 调用 AI API 进行内容生成
 * - 使用 IncrementalXMLParser 解析 XML 流
 * - 管理节点和边的状态
 * - 处理重新生成/重置逻辑
 * - 提供生命周期回调
 *
 * 状态转换：
 * - idle → streaming（开始生成）
 * - streaming → complete（成功完成）
 * - streaming → error（发生错误）
 * - 任何状态 → idle（通过 reset）
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 6.1, 6.4, 6.5
 *
 * @module groupGeneration/groupStreamManager
 *
 * @example
 * ```typescript
 * import { GroupStreamManager } from './groupStreamManager';
 *
 * // 创建管理器
 * const manager = new GroupStreamManager({
 *   onStart: () => console.log('开始生成'),
 *   onNodeCreated: (id, node) => console.log(`创建节点: ${id}`),
 *   onComplete: () => console.log('生成完成'),
 *   onError: (error) => console.error('错误:', error),
 * });
 *
 * // 设置流式响应函数
 * manager.setStreamResponseFunction(streamResponse);
 *
 * // 开始生成
 * await manager.startGeneration(
 *   apiKey,
 *   messages,
 *   { model: 'gpt-4', max_tokens: 4000 },
 *   { targetGroupId: 'group-1' }
 * );
 *
 * // 检查状态
 * const state = manager.getState();
 * console.log(state.status); // 'complete'
 * console.log(state.nodes.size); // 节点数量
 * ```
 */

import { NodeXML, EdgeXML } from "../../types/xml.d";
import { IncrementalXMLParser } from "../incrementalXMLParser";
import {
	StreamingStatus,
	StreamingState,
	StreamingCallbacks,
	GenerationOptions,
} from "./types";

/**
 * 流式回调类型
 * chunk 为 null 表示流结束，error 表示发生错误
 */
export type StreamCallback = (chunk: string | null, error?: Error) => void;

/**
 * 流式响应函数类型
 * 用于依赖注入，便于测试
 */
export type StreamResponseFunction = (
	apiKey: string,
	messages: ChatMessage[],
	config: { max_tokens?: number; model?: string; temperature?: number },
	callback: StreamCallback
) => Promise<void>;

/**
 * 聊天消息类型
 */
export interface ChatMessage {
	role: string;
	content: string;
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
	/** 模型名称 */
	model: string;
	/** 最大 token 数 */
	max_tokens?: number;
	/** 温度参数 */
	temperature?: number;
}

/**
 * 组流管理器
 *
 * 协调 AI API 调用、XML 解析和状态管理的核心类。
 * 提供完整的流式生成生命周期管理。
 *
 * 主要功能：
 * - 流式 API 调用和响应处理
 * - XML 增量解析
 * - 节点和边的状态管理
 * - 生命周期回调
 * - 中止和重置支持
 *
 * @example
 * ```typescript
 * // 基本用法
 * const manager = new GroupStreamManager({
 *   onNodeCreated: (id, node) => {
 *     // 在画布上创建节点
 *     renderer.createNode(node, position);
 *   },
 *   onComplete: () => {
 *     console.log('生成完成');
 *   },
 * });
 *
 * manager.setStreamResponseFunction(streamResponse);
 * await manager.startGeneration(apiKey, messages, modelConfig);
 *
 * // 中止生成
 * manager.abort();
 *
 * // 重置状态
 * manager.reset();
 * ```
 *
 * Requirements: 2.1-2.7, 6.1, 6.4, 6.5
 */
export class GroupStreamManager {
	/** XML 解析器实例 */
	private parser: IncrementalXMLParser;

	/** 当前流式状态 */
	private state: StreamingState;

	/** 生命周期回调 */
	private callbacks: StreamingCallbacks;

	/** 当前生成选项 */
	private currentOptions: GenerationOptions | null = null;

	/** 中止控制器 */
	private abortController: AbortController | null = null;

	/** 是否已中止 */
	private isAborted: boolean = false;

	/** 已处理的节点 ID 集合（用于区分创建和更新） */
	private processedNodeIds: Set<string> = new Set();

	/** 已处理的边 ID 集合（用于去重） */
	private processedEdgeIds: Set<string> = new Set();

	/** 流式响应函数（可注入用于测试） */
	private streamResponseFn: StreamResponseFunction | null = null;

	/**
	 * 创建 GroupStreamManager 实例
	 *
	 * @param callbacks - 可选的生命周期回调
	 * @param streamResponseFn - 可选的流式响应函数（用于依赖注入）
	 */
	constructor(callbacks?: StreamingCallbacks, streamResponseFn?: StreamResponseFunction) {
		this.parser = new IncrementalXMLParser();
		this.callbacks = callbacks || {};
		this.state = this.createInitialState();
		this.streamResponseFn = streamResponseFn || null;
	}

	/**
	 * 设置流式响应函数
	 * 用于依赖注入，便于测试
	 *
	 * @param fn - 流式响应函数
	 */
	setStreamResponseFunction(fn: StreamResponseFunction): void {
		this.streamResponseFn = fn;
	}

	/**
	 * 创建初始状态
	 *
	 * @returns 初始流式状态
	 */
	private createInitialState(): StreamingState {
		return {
			status: "idle",
			nodes: new Map<string, NodeXML>(),
			edges: [],
			error: null,
			progress: 0,
		};
	}

	/**
	 * 开始生成
	 *
	 * 启动 AI 流式生成过程。如果当前正在流式传输，会先中止。
	 *
	 * 状态转换：idle → streaming → (complete | error)
	 *
	 * @param apiKey - AI 服务的 API 密钥
	 * @param messages - 要发送的聊天消息数组
	 * @param modelConfig - 模型配置（model、max_tokens、temperature）
	 * @param options - 生成选项，包括 targetGroupId 用于重新生成
	 * @throws 如果未设置 StreamResponseFunction
	 *
	 * @example
	 * ```typescript
	 * await manager.startGeneration(
	 *   'sk-xxx',
	 *   [
	 *     { role: 'system', content: '你是一个助手' },
	 *     { role: 'user', content: '生成一个概念图' },
	 *   ],
	 *   { model: 'gpt-4', max_tokens: 4000, temperature: 0.7 },
	 *   { targetGroupId: 'group-1', clearExisting: true }
	 * );
	 * ```
	 *
	 * Requirements: 2.1, 2.4, 2.5, 6.1
	 */
	async startGeneration(
		apiKey: string,
		messages: ChatMessage[],
		modelConfig: ModelConfig,
		options?: GenerationOptions
	): Promise<void> {
		// 检查是否有流式响应函数
		if (!this.streamResponseFn) {
			throw new Error("StreamResponseFunction not set. Call setStreamResponseFunction() first or pass it to constructor.");
		}

		// 如果当前正在流式传输，先中止
		if (this.state.status === "streaming") {
			this.abort();
		}

		// 重置状态
		this.reset();

		// 保存当前选项
		this.currentOptions = options || null;

		// 创建新的中止控制器
		this.abortController = new AbortController();
		this.isAborted = false;

		// 转换状态为 streaming
		// Requirements: 2.6 - 状态转换：idle → streaming
		this.transitionTo("streaming");

		// 调用 onStart 回调
		// Requirements: 6.5 - 生命周期回调
		this.callbacks.onStart?.();

		try {
			// 调用 AI API 进行流式生成
			// Requirements: 2.1 - 调用 AI API
			await this.streamFromAPI(apiKey, messages, modelConfig);

			// 如果没有被中止，转换到完成状态
			if (!this.isAborted) {
				// Requirements: 2.6 - 状态转换：streaming → complete
				this.transitionTo("complete");

				// 调用 onComplete 回调
				// Requirements: 6.5 - 生命周期回调
				this.callbacks.onComplete?.();
			}
		} catch (error) {
			// 如果是中止导致的错误，不处理
			if (this.isAborted) {
				return;
			}

			// 转换到错误状态
			// Requirements: 2.6 - 状态转换：streaming → error
			const errorObj = error instanceof Error ? error : new Error(String(error));
			this.state.error = errorObj;
			this.transitionTo("error");

			// 调用 onError 回调
			// Requirements: 6.5 - 生命周期回调
			this.callbacks.onError?.(errorObj);
		}
	}

	/**
	 * 从 API 流式获取响应
	 *
	 * @param apiKey - API 密钥
	 * @param messages - 聊天消息
	 * @param modelConfig - 模型配置
	 */
	private async streamFromAPI(
		apiKey: string,
		messages: ChatMessage[],
		modelConfig: ModelConfig
	): Promise<void> {
		if (!this.streamResponseFn) {
			throw new Error("StreamResponseFunction not set");
		}

		return new Promise((resolve, reject) => {
			this.streamResponseFn!(
				apiKey,
				messages,
				{
					model: modelConfig.model,
					max_tokens: modelConfig.max_tokens,
					temperature: modelConfig.temperature,
				},
				(chunk: string | null, error?: Error) => {
					// 检查是否已中止
					if (this.isAborted) {
						resolve();
						return;
					}

					// 处理错误
					if (error) {
						reject(error);
						return;
					}

					// 流结束
					if (chunk === null) {
						resolve();
						return;
					}

					// 处理数据块
					// Requirements: 2.2 - 使用 IncrementalXMLParser 解析 XML 流
					this.processChunk(chunk);
				}
			);
		});
	}

	/**
	 * 处理传入的数据块
	 *
	 * 将数据块添加到解析器缓冲区，检测完整和不完整的节点/边，
	 * 并触发相应的回调。
	 *
	 * @param chunk - 从流中接收的数据块
	 *
	 * @example
	 * ```typescript
	 * // 通常由 streamFromAPI 内部调用
	 * // 但也可以手动调用用于测试
	 * manager.processChunk('<node id="n1"><content>测试</content></node>');
	 * ```
	 *
	 * Requirements: 2.2, 2.3 - 解析 XML 流并管理状态
	 */
	processChunk(chunk: string): void {
		// 如果已中止或不在流式状态，忽略
		if (this.isAborted || this.state.status !== "streaming") {
			return;
		}

		// 将数据块添加到解析器缓冲区
		this.parser.append(chunk);

		// 检测完整的节点
		const completeNodes = this.parser.detectCompleteNodes();
		for (const node of completeNodes) {
			this.handleNode(node, true);
		}

		// 检测不完整的节点（用于实时预览）
		const incompleteNodes = this.parser.detectIncompleteNodes();
		for (const node of incompleteNodes) {
			this.handleNode(node, false);
		}

		// 检测完整的边
		const completeEdges = this.parser.detectCompleteEdges();
		for (const edge of completeEdges) {
			this.handleEdge(edge);
		}

		// 更新进度
		this.updateProgress();
	}

	/**
	 * 处理节点（创建或更新）
	 *
	 * @param node - 节点 XML 数据
	 * @param isComplete - 节点是否完整
	 *
	 * Requirements: 2.3, 2.7 - 管理节点状态
	 */
	private handleNode(node: NodeXML, isComplete: boolean): void {
		const existingNode = this.state.nodes.get(node.id);
		const isNew = !this.processedNodeIds.has(node.id);

		// 更新状态中的节点
		this.state.nodes.set(node.id, node);

		if (isNew && isComplete) {
			// 新节点且完整 - 标记为已处理并触发创建回调
			this.processedNodeIds.add(node.id);
			this.callbacks.onNodeCreated?.(node.id, node);
		} else if (existingNode) {
			// 已存在的节点 - 触发更新回调
			this.callbacks.onNodeUpdated?.(node.id, node);
		} else if (isNew && !isComplete) {
			// 新节点但不完整 - 触发创建回调（用于实时预览）
			this.processedNodeIds.add(node.id);
			this.callbacks.onNodeCreated?.(node.id, node);
		}
	}

	/**
	 * 处理边
	 *
	 * @param edge - 边 XML 数据
	 *
	 * Requirements: 2.3 - 管理边状态
	 */
	private handleEdge(edge: EdgeXML): void {
		// 创建边的唯一标识符
		const edgeId = `${edge.from}->${edge.to}`;

		// 检查是否已处理过
		if (this.processedEdgeIds.has(edgeId)) {
			return;
		}

		// 标记为已处理
		this.processedEdgeIds.add(edgeId);

		// 添加到状态
		this.state.edges.push(edge);

		// 触发回调
		this.callbacks.onEdgeCreated?.(edge);
	}

	/**
	 * 更新进度
	 *
	 * Requirements: 6.5 - onProgress 回调
	 */
	private updateProgress(): void {
		// 基于已解析的内容估算进度
		// 这是一个简化的实现，实际进度可能需要更复杂的计算
		const nodeCount = this.state.nodes.size;
		const edgeCount = this.state.edges.length;

		// 假设平均每个组有 5 个节点和 4 条边
		// 进度 = (已解析元素数 / 预期元素数) * 100
		// 这里使用一个简单的启发式方法
		const estimatedTotal = Math.max(9, nodeCount + edgeCount + 1);
		const progress = Math.min(99, Math.floor((nodeCount + edgeCount) / estimatedTotal * 100));

		if (progress !== this.state.progress) {
			this.state.progress = progress;
			this.callbacks.onProgress?.(progress);
		}
	}

	/**
	 * 状态转换
	 *
	 * @param newStatus - 新状态
	 *
	 * Requirements: 2.6 - 有效的状态转换
	 */
	private transitionTo(newStatus: StreamingStatus): void {
		const currentStatus = this.state.status;

		// 验证状态转换的有效性
		// idle → streaming（开始生成）
		// streaming → complete（成功完成）
		// streaming → error（发生错误）
		// 任何状态 → idle（通过 reset）

		const validTransitions: Record<StreamingStatus, StreamingStatus[]> = {
			"idle": ["streaming"],
			"streaming": ["complete", "error", "idle"],
			"complete": ["idle", "streaming"],
			"error": ["idle", "streaming"],
		};

		if (!validTransitions[currentStatus].includes(newStatus)) {
			console.warn(
				`[GroupStreamManager] 无效的状态转换: ${currentStatus} → ${newStatus}`
			);
			return;
		}

		this.state.status = newStatus;

		// 完成时设置进度为 100
		if (newStatus === "complete") {
			this.state.progress = 100;
			this.callbacks.onProgress?.(100);
		}
	}

	/**
	 * 获取当前流式状态
	 *
	 * 返回状态的浅拷贝，防止外部修改。
	 * 如果需要高性能访问，使用 getStateRef()。
	 *
	 * @returns 当前状态的副本，包含 status、nodes、edges、error、progress
	 *
	 * @example
	 * ```typescript
	 * const state = manager.getState();
	 * console.log(state.status); // 'streaming'
	 * console.log(state.nodes.size); // 3
	 * console.log(state.progress); // 50
	 * ```
	 *
	 * Requirements: 2.6, 2.7 - 暴露状态给消费者
	 */
	getState(): StreamingState {
		// 返回状态的浅拷贝，防止外部修改
		return {
			...this.state,
			nodes: new Map(this.state.nodes),
			edges: [...this.state.edges],
		};
	}

	/**
	 * 获取当前状态（只读引用，用于性能敏感场景）
	 *
	 * @returns 当前状态的只读引用
	 */
	getStateRef(): Readonly<StreamingState> {
		return this.state;
	}

	/**
	 * 获取当前生成选项
	 *
	 * @returns 当前选项或 null
	 */
	getCurrentOptions(): GenerationOptions | null {
		return this.currentOptions;
	}

	/**
	 * 重置状态以进行新的生成
	 *
	 * 清除所有状态，包括：
	 * - 解析器缓冲区
	 * - 节点和边状态
	 * - 已处理的 ID 集合
	 * - 错误信息
	 *
	 * 如果当前正在流式传输，会先中止。
	 *
	 * @example
	 * ```typescript
	 * // 重置后可以开始新的生成
	 * manager.reset();
	 * await manager.startGeneration(apiKey, newMessages, modelConfig);
	 * ```
	 *
	 * Requirements: 2.4 - 重置逻辑
	 */
	reset(): void {
		// 如果正在流式传输，先中止
		if (this.state.status === "streaming") {
			this.abort();
		}

		// 重置解析器
		this.parser = new IncrementalXMLParser();

		// 重置状态
		this.state = this.createInitialState();

		// 重置选项
		this.currentOptions = null;

		// 重置已处理的 ID 集合
		this.processedNodeIds.clear();
		this.processedEdgeIds.clear();

		// 重置中止标志
		this.isAborted = false;
	}

	/**
	 * 中止当前生成
	 *
	 * 停止正在进行的流式传输，状态转换为 idle。
	 * 已解析的内容会保留，但不会继续接收新内容。
	 *
	 * @example
	 * ```typescript
	 * // 用户取消操作
	 * manager.abort();
	 *
	 * // 检查状态
	 * console.log(manager.getState().status); // 'idle'
	 * ```
	 *
	 * Requirements: 6.4 - 支持中止
	 */
	abort(): void {
		if (this.state.status !== "streaming") {
			return;
		}

		// 设置中止标志
		this.isAborted = true;

		// 中止 API 请求
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}

		// 转换到 idle 状态
		this.state.status = "idle";
	}

	/**
	 * 更新回调
	 *
	 * @param callbacks - 新的回调配置
	 */
	setCallbacks(callbacks: StreamingCallbacks): void {
		this.callbacks = callbacks;
	}

	/**
	 * 检查是否正在流式传输
	 *
	 * @returns 是否正在流式传输
	 */
	isStreaming(): boolean {
		return this.state.status === "streaming";
	}

	/**
	 * 检查是否已完成
	 *
	 * @returns 是否已完成
	 */
	isComplete(): boolean {
		return this.state.status === "complete";
	}

	/**
	 * 检查是否有错误
	 *
	 * @returns 是否有错误
	 */
	hasError(): boolean {
		return this.state.status === "error";
	}

	/**
	 * 获取错误信息
	 *
	 * @returns 错误对象或 null
	 */
	getError(): Error | null {
		return this.state.error;
	}

	/**
	 * 获取所有节点
	 *
	 * @returns 节点数组
	 */
	getNodes(): NodeXML[] {
		return Array.from(this.state.nodes.values());
	}

	/**
	 * 获取所有边
	 *
	 * @returns 边数组
	 */
	getEdges(): EdgeXML[] {
		return [...this.state.edges];
	}

	/**
	 * 根据 ID 获取节点
	 *
	 * @param nodeId - 节点 ID
	 * @returns 节点或 undefined
	 */
	getNodeById(nodeId: string): NodeXML | undefined {
		return this.state.nodes.get(nodeId);
	}
}
