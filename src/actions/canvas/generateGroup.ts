import { App, ItemView, Notice, setIcon, setTooltip } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { CanvasNode } from "../../obsidian/canvas-internal";
import { CanvasView, addEdge } from "../../obsidian/canvas-patches";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";
import { streamResponse } from "../../utils/chatgpt";
import { IncrementalMarkdownParser } from "../../utils/groupGenerator";
import { isGroup, buildGroupContext } from "../../utils/groupUtils";
import { randomHexString } from "../../utils";
import { IncrementalXMLParser } from "../../utils/incrementalXMLParser";
import { StreamingNodeCreator, EdgeDirection } from "../../utils/streamingNodeCreator";
import { analyzeBestDirection, calculatePositionInDirection, getLayoutPreferences } from "../../utils/spatialAnalyzer";
import { logDebug } from "../../logDebug";

/**
 * System prompt for Smart Expand - XML Format (PRD v2.0)
 * Enhanced with semantic positioning guidelines
 * Based on PRD v2.0 Section 3.1
 */
const SYSTEM_PROMPT_SMART_EXPAND_XML = `
You are an intelligent canvas assistant.
Goal: Expand on the user's input node based on their instruction.

IMPORTANT: This is a GROUP generation request. You MUST wrap all generated nodes inside a <group> element.
The user's question will be displayed on the edge connecting the source node to the group.

OUTPUT FORMAT (XML):
1. **ALWAYS wrap all generated nodes in a <group>** - This is required for group generation.
2. Use <group id="..." title="..." row="Int" col="Int">...</group> to contain all nodes.
3. Inside the group, use <node id="..." type="..." title="..." row="Int" col="Int">Markdown</node>.
4. Coordinates (row, col) are relative to the source node (0,0).
   - Place the group to the Right (col=1) or Bottom (row=1).
   - Use negative row/col to place content above/left if needed.
5. Node coordinates inside the group are relative to the group's position (use small values like 0, 1, 2).

EDGE USAGE GUIDELINES (连线使用指南):
- **Edges are OPTIONAL** - Not all nodes need to be connected with edges.
- **Use edges ONLY when there is a clear logical relationship**:
  * Causal relationships (cause → effect)
  * Sequential flow (step 1 → step 2 → step 3)
  * Reference/dependency (A references B)
  * Hierarchical relationships (parent → child)
- **DO NOT use edges for**:
  * Simple categorization/classification (use coordinate positioning instead)
  * Lists or collections (use coordinate positioning instead)
  * Parallel concepts without direct relationships
  * Grouping by attributes (e.g., "四象限划分" - use spatial layout, not edges)
- **For classification/categorization tasks**: Use coordinate positioning to organize nodes spatially (e.g., place categories in different quadrants using row/col coordinates), without creating edges between them.

TYPE RULES (affects node color):
- default: General text (Gray, use when unsure)
- concept: Key ideas/concepts (Orange)
- step: Steps/procedures/implementation (Blue)
- resource: Resources/files/references (Green)
- warning: Risks/errors/caveats (Red)
- insight: Insights/conclusions/summaries (Purple)
- question: Questions/TODOs/discussion points (Yellow)

COORDINATE GUIDELINES (Enhanced for Better Layout):
- **Semantic Positioning**: Choose direction based on relationship type:
  * Cause → Effect: Place effect to the RIGHT (row=0, col=1) - **use edge**
  * Sequential steps: Place below in vertical flow (row+1, col=0) - **use edge**
  * Parallel concepts: Place to the right (row=0, col+1) for horizontal layout - **no edge needed**
  * Details/elaboration: Place to RIGHT or BOTTOM-RIGHT (row=1, col=1) - **edge optional**
  * Summary/conclusion: Consider placing ABOVE or to the LEFT (negative row/col) - **edge optional**
  * Branching alternatives: Distribute around source (right, down, down-right) - **use edges**
  * **Classification/Categorization**: Use spatial regions (e.g., quadrants):
    - Top-left (negative row, negative col): Category 1
    - Top-right (negative row, positive col): Category 2
    - Bottom-left (positive row, negative col): Category 3
    - Bottom-right (positive row, positive col): Category 4
    - **NO edges needed** - spatial position conveys the relationship

- **Visual Balance**:
  * Avoid clustering all nodes in one direction
  * Distribute nodes evenly when there's no strong semantic relationship
  * Use different row/col combinations to create visual flow
  * For 2-3 nodes: horizontal layout (col varies, row=0)
  * For 4+ nodes: mix horizontal and vertical (vary both row and col)

- **Smart Spacing**:
  * Use row=0, col=1 for primary/most important response
  * Use row=1, col=0 for secondary/supporting information
  * Use row=1, col=1 for tertiary/detailed information
  * Use negative values (row=-1, col=-1) sparingly for context or prerequisites

CONTENT GUIDELINES:
- Each node can contain full Markdown: **bold**, *italic*, lists, code blocks, links
- Keep nodes focused (2-5 paragraphs each)
- Create 2-6 nodes depending on instruction complexity
- Node titles are optional but recommended for clarity
- Use the same language as the user's instruction

OUTPUT ORDER (When edges are used):
- **If you create edges**, follow this progressive pattern: node -> edge -> node -> edge
- When a node connects to another node, output them together:
  1. First node: <node id="n1">...</node>
  2. Edge connecting to next node: <edge from="n1" to="n2" ... />
  3. Second node (the connected node): <node id="n2">...</node>
  4. Edge from second node (if it connects to another): <edge from="n2" to="n3" ... />
  5. Continue: node -> edge -> node -> edge...
- This progressive output allows the canvas to render nodes with their connections immediately
- **If nodes have NO logical connections** (e.g., classification tasks), simply output nodes in order:
  <node id="n1">...</node>
  <node id="n2">...</node>
  <node id="n3">...</node>
  <!-- No edges needed - spatial positioning conveys the relationship -->
- **Example of WRONG order (DO NOT DO THIS):**
  <node id="n1">...</node>
  <node id="n2">...</node>
  <node id="n3">...</node>
  <edge from="n1" to="n2" />  <!-- Only if there's a logical relationship -->
  <edge from="n2" to="n3" />  <!-- Only if there's a logical relationship -->
- **Example of CORRECT order for connected nodes (DO THIS):**
  <node id="n1">...</node>
  <edge from="n1" to="n2" />
  <node id="n2">...</node>
  <edge from="n2" to="n3" />
  <node id="n3">...</node>
- **Example of CORRECT order for classification (NO edges needed):**
  <node id="category1" row="-1" col="-1">重要且紧急</node>
  <node id="category2" row="-1" col="1">重要不紧急</node>
  <node id="category3" row="1" col="-1">紧急不重要</node>
  <node id="category4" row="1" col="1">不紧急不重要</node>
  <!-- No edges - spatial positioning (quadrants) shows the classification -->

Example Output (With Edges - for sequential/causal relationships):
<node id="n1" type="concept" title="Core Idea" row="0" col="1">
The fundamental concept is **modularity**.
- Separation of concerns
- Reusable components
</node>

<edge from="n1" to="n2" dir="forward" label="leads to" />

<node id="n2" type="step" title="Implementation" row="1" col="1">
1. Define interfaces
2. Implement modules
3. Test integration
</node>

<edge from="n2" to="n3" dir="forward" label="must avoid" />

<node id="n3" type="warning" title="Pitfalls" row="1" col="0">
⚠️ Avoid tight coupling between modules.
</node>

Example Output (Without Edges - for classification/categorization):
<node id="quad1" type="concept" title="重要且紧急" row="-1" col="-1">
- 回复客户咨询邮件
- 交电费
- 预约牙医
</node>

<node id="quad2" type="concept" title="重要不紧急" row="-1" col="1">
- 写周报
- 阅读30页书
- 制定下周健身计划
</node>

<node id="quad3" type="concept" title="紧急不重要" row="1" col="-1">
- 取快递
- 给猫铲屎
- 买洗洁精
</node>

<node id="quad4" type="concept" title="不紧急不重要" row="1" col="1">
- 去超市买菜
- 整理电脑桌面文件
</node>
<!-- No edges needed - spatial positioning (four quadrants) shows the classification -->

Example Output (REQUIRED FORMAT - All nodes in a group):
<group id="g1" title="Generated Content" row="0" col="1">
    <node id="n1" type="concept" title="First Concept" row="0" col="0">
    First concept content...
    </node>
    
    <edge from="n1" to="n2" dir="forward" label="leads to" />
    
    <node id="n2" type="step" title="Implementation" row="1" col="0">
    Implementation steps...
    </node>
    
    <edge from="n2" to="n3" dir="forward" label="follows" />
    
    <node id="n3" type="insight" title="Conclusion" row="2" col="0">
    Final insights...
    </node>
</group>

Note: All nodes must be inside the group. The user's question will be displayed on the edge connecting the source node to this group.

Remember: The positioning system will also use spatial analysis to avoid overlaps, 
but your coordinate suggestions help establish the logical flow and relationships.
`.trim();

/**
 * Generate a group with multiple nodes using AI
 */
export async function generateGroupWithAI(
	app: App,
	settings: AugmentedCanvasSettings,
	sourceNode?: CanvasNode,
	userQuestion?: string
) {
	// Validate API key
	if (!settings.apiKey) {
		new Notice("Please set your DeepSeek API key in the plugin settings");
		return;
	}

	// Get active canvas
	const maybeCanvasView = app.workspace.getActiveViewOfType(ItemView) as CanvasView | null;
	const canvas = maybeCanvasView?.canvas;

	if (!canvas) {
		new Notice("No active canvas found. Please open a canvas view.");
		return;
	}

	await canvas.requestFrame();

	// Get source node
	let node: CanvasNode;
	if (!sourceNode) {
		const selection = canvas.selection;
		if (selection?.size !== 1) {
			new Notice("Please select exactly one note to generate group from.");
			return;
		}
		const values = Array.from(selection.values());
		node = values[0];
	} else {
		node = sourceNode;
	}

	if (!node) {
		return;
	}

	// Save any pending changes
	await canvas.requestSave();
	await sleep(200);

	try {
		// Build context from node and ancestors
		const { buildMessages } = noteGenerator(app, settings, node);

		// Prepare prompt
		let finalPrompt = userQuestion || "Please generate a comprehensive breakdown of this topic.";

		// If source is a group, read its content
		if (isGroup(node)) {
			const groupContent = await buildGroupContext(node);
			if (groupContent) {
				finalPrompt = `Based on the following content:\n\n${groupContent}\n\n${finalPrompt}`;
			}
		}

		// Use XML format (PRD v2.0)
		const systemPrompt = SYSTEM_PROMPT_SMART_EXPAND_XML ;

		const { messages, tokenCount } = await buildMessages(node, {
			systemPrompt: systemPrompt,
			prompt: finalPrompt,
		});

		// Calculate group position using spatial analysis
		const preferences = getLayoutPreferences(settings);
		const directionScores = analyzeBestDirection(canvas, node, preferences);
		const bestDirection = directionScores[0];

		const groupWidth = 400; // Initial width
		const groupHeight = 300; // Initial height
		const spacing = userQuestion ? preferences.minNodeSpacing + 50 : preferences.minNodeSpacing;

		const groupPos = calculatePositionInDirection(
			node,
			bestDirection.direction,
			{ width: groupWidth, height: groupHeight },
			spacing
		);

		// Create empty group node immediately
		const groupId = randomHexString(16);
		const groupNodeData = {
			id: groupId,
			type: "group",
			label: "New Group", // Temporary placeholder
			x: groupPos.x,
			y: groupPos.y,
			width: groupWidth,
			height: groupHeight,
			// No color specified = default gray for pre-created group
		};

		const canvasData = canvas.getData();
		canvas.importData({
			nodes: [...canvasData.nodes, groupNodeData],
			edges: canvasData.edges,
		});
		await canvas.requestFrame();

		const groupNode = canvas.nodes.get(groupId);
		if (!groupNode) {
			new Notice("Failed to create group node");
			return;
		}

		// Determine edge sides based on node positions
		const fromCenterX = node.x + node.width / 2;
		const fromCenterY = node.y + node.height / 2;
		const toCenterX = groupNode.x + groupNode.width / 2;
		const toCenterY = groupNode.y + groupNode.height / 2;

		const deltaX = toCenterX - fromCenterX;
		const deltaY = toCenterY - fromCenterY;

		let fromSide: string, toSide: string;
		if (Math.abs(deltaX) > Math.abs(deltaY)) {
			// Horizontal connection
			if (deltaX > 0) {
				fromSide = "right";
				toSide = "left";
			} else {
				fromSide = "left";
				toSide = "right";
			}
		} else {
			// Vertical connection
			if (deltaY > 0) {
				fromSide = "bottom";
				toSide = "top";
			} else {
				fromSide = "top";
				toSide = "bottom";
			}
		}

		// Create edge from source node to group with user question as label
		const mainEdgeId = randomHexString(16);
		addEdge(
			canvas,
			mainEdgeId,
			{
				fromOrTo: "from",
				side: fromSide,
				node: node,
			},
			{
				fromOrTo: "to",
				side: toSide,
				node: groupNode,
			},
			userQuestion || "", // User question as edge label
			{
				isGenerated: true,
			}
		);
		await canvas.requestFrame();

		new Notice(
			`Sending ${messages.length} notes with ${tokenCount} tokens to generate group...`
		);

		// Initialize incremental parsers and node creator
		const xmlParser = new IncrementalXMLParser();
		const mdParser = new IncrementalMarkdownParser();
		const nodeCreator = new StreamingNodeCreator(canvas, node, settings);

		// Set pre-created group information
		// Use a semantic ID for the group (will be matched when AI generates <group id="...">)
		// Pass edge direction for safe zone calculation (Requirements: 7.1, 7.2, 7.3)
		const preCreatedGroupSemanticId = "g1"; // Default semantic ID for the first group
		const edgeDirection: EdgeDirection = toSide as EdgeDirection; // Edge connects TO the group from this side
		nodeCreator.setPreCreatedGroup(groupNode, preCreatedGroupSemanticId, mainEdgeId, userQuestion || "", edgeDirection);

		let accumulatedResponse = "";
		let lastNodeUpdate = Date.now();
		let mdNodeIndex = 0;

		await streamResponse(
			settings.apiKey,
			messages,
			{
				model: settings.apiModel,
				max_tokens: settings.maxResponseTokens || undefined,
				temperature: settings.temperature,
			},
			async (chunk: string | null, error?: Error) => {
				if (error) {
					throw error;
				}

				if (!chunk) {
					// Stream completed - log full AI response
					console.log("[GenerateGroup] ========== AI Response Complete ==========");
					console.log("[GenerateGroup] User Question:", userQuestion || "(none)");
					console.log("[GenerateGroup] Response Length:", accumulatedResponse.length, "characters");
					console.log("[GenerateGroup] Full AI Response:");
					console.log(accumulatedResponse);
					console.log("[GenerateGroup] ===========================================");

					// Also log using logDebug for consistency
					logDebug("AI Full Response", {
						userQuestion: userQuestion || "(none)",
						responseLength: accumulatedResponse.length,
						fullResponse: accumulatedResponse,
					});
					return;
				}

				accumulatedResponse += chunk;

				// Incremental parsing and node creation
				const now = Date.now();
				if (xmlParser) {
					xmlParser.append(chunk);

					// IMPORTANT: Store edges first to build dependency graph
					// This allows nodes to know their dependencies when being created
					// and enables the "Connection-First" (连线优先) strategy.
					const completeEdges = xmlParser.detectCompleteEdges();
					completeEdges.forEach(edge => nodeCreator.storeEdge(edge));

					// Detect and create complete nodes (now with dependency awareness)
					const completeNodes = xmlParser.detectCompleteNodes();
					for (const nodeXML of completeNodes) {
						await nodeCreator.createNodeFromXML(nodeXML);
						await canvas.requestFrame();
					}

					// Real-time update for all nodes (including incomplete ones)
					// This fulfills the requirement for all nodes to show content immediately.
					// Throttled to 50ms for performance.
					if (now - lastNodeUpdate > 50) {
						// 1. Update partial groups (ensure they exist on canvas)
						const incompleteGroups = xmlParser.detectIncompleteGroups();
						for (const groupXML of incompleteGroups) {
							await nodeCreator.updatePartialGroup(groupXML);
						}

						// 2. Update partial nodes (create if new, update text if existing)
						const incompleteNodes = xmlParser.detectIncompleteNodes();
						for (const nodeXML of incompleteNodes) {
							await nodeCreator.updatePartialNode(nodeXML);
						}
						lastNodeUpdate = now;
					}

					// Detect and create groups
					const completeGroups = xmlParser.detectCompleteGroups();
					for (const groupXML of completeGroups) {
						await nodeCreator.createGroupFromXML(groupXML);
						await canvas.requestFrame();
					}

				} else if (mdParser) {
					mdParser.append(chunk);

					// Detect and create complete Markdown nodes
					const completeNodes = mdParser.detectCompleteNodes();
					for (const parsedNode of completeNodes) {
						await nodeCreator.createNodeFromParsed(parsedNode, mdNodeIndex++);
						await canvas.requestFrame();
					}
				}
			}
		);

		// Stream completed - handle remaining content
		await sleep(200);

		// Process any remaining content
		if (xmlParser) {
			// 1. Final update for all incomplete nodes/groups to ensure latest content is shown
			const finalIncompleteGroups = xmlParser.detectIncompleteGroups();
			for (const groupXML of finalIncompleteGroups) {
				await nodeCreator.updatePartialGroup(groupXML);
			}

			const finalIncompleteNodes = xmlParser.detectIncompleteNodes();
			for (const nodeXML of finalIncompleteNodes) {
				await nodeCreator.updatePartialNode(nodeXML);
			}

			// 2. Process any remaining edges that might have been parsed
			const remainingEdges = xmlParser.detectCompleteEdges();
			remainingEdges.forEach(edge => nodeCreator.storeEdge(edge));

			// 3. Process any remaining nodes that might have been parsed
			const remainingNodes = xmlParser.detectCompleteNodes();
			for (const nodeXML of remainingNodes) {
				await nodeCreator.createNodeFromXML(nodeXML);
				await canvas.requestFrame();
			}

			// 4. Create all pending nodes (nodes without connections)
			await nodeCreator.createAllPendingNodes();
			await canvas.requestFrame();

			// Check for unparsed content and notify if significant
			const remaining = xmlParser.getUnprocessedContent();
			if (remaining.trim()) {
				console.warn("[GenerateGroup] Unparsed XML content:", remaining);
				// If there's a lot of unparsed content, it might mean the LLM output invalid XML
				if (remaining.length > 50) {
					new Notice("部分内容解析失败，请检查输出格式是否正确。", 5000);
				}
			}
		} else if (mdParser) {
			// Process last node if any
			mdParser.append("\n---[NODE]---\n"); // Force final node detection
			const lastNodes = mdParser.detectCompleteNodes();
			for (const parsedNode of lastNodes) {
				await nodeCreator.createNodeFromParsed(parsedNode, mdNodeIndex++);
				await canvas.requestFrame();
			}
		}

		// Create all remaining pending edges (should be minimal since we create edges immediately when possible)
		const edgeCount = await nodeCreator.createAllEdges();
		await canvas.requestFrame();

		// Final update of group bounds to ensure all nodes are included
		if (groupNode) {
			// Force a final bounds update for the pre-created group
			const { getNodesInGroup } = await import("../../utils/groupUtils");
			const nodesInGroup = getNodesInGroup(groupNode, canvas);
			if (nodesInGroup.length > 0) {
				// Update bounds one more time to ensure everything fits
				const padding = settings.groupPadding || 60;
				let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
				nodesInGroup.forEach(node => {
					minX = Math.min(minX, node.x);
					minY = Math.min(minY, node.y);
					maxX = Math.max(maxX, node.x + node.width);
					maxY = Math.max(maxY, node.y + node.height);
				});
				groupNode.setData({
					x: minX - padding,
					y: minY - padding,
					width: maxX - minX + padding * 2,
					height: maxY - minY + padding * 2,
				});
				await canvas.requestFrame();
			}
		}

		// Success notification
		const totalNodes = nodeCreator.getCreatedNodeCount();
		const edgeMsg = edgeCount > 0 ? ` and ${edgeCount} connection${edgeCount > 1 ? "s" : ""}` : "";
		new Notice(`✓ Created ${totalNodes} node${totalNodes > 1 ? "s" : ""}${edgeMsg} with organic growth!`);

		await canvas.requestSave();

		return; // Exit early since we've handled everything with streaming

		// NOTE: The old fallback implementation code below has been removed
		// All parsing and node creation now happens incrementally during streaming
	} catch (error: any) {
		const errorMessage = error?.message || error?.toString() || "Unknown error";
		console.error("Group generation error:", error);
		new Notice(`Error generating group: ${errorMessage}`);
	}
}

/**
 * Add "Generate Group with AI" button to canvas menu
 */
export const addGenerateGroupButton = async (
	app: App,
	settings: AugmentedCanvasSettings,
	menuEl: HTMLElement
) => {
	const buttonEl = createEl("button", "clickable-icon gpt-menu-item");
	setTooltip(buttonEl, "AI 生成分组", {
		placement: "top",
	});
	setIcon(buttonEl, "lucide-layers");
	menuEl.appendChild(buttonEl);

	buttonEl.addEventListener("click", async (e) => {
		e.stopPropagation();

		// Import modal here to avoid circular dependency
		const { CustomQuestionModal } = await import("../../Modals/CustomQuestionModal");

		const modal = new CustomQuestionModal(app, async (question: string) => {
			try {
				await generateGroupWithAI(app, settings, undefined, question);
			} catch (error) {
				console.error("Error in Generate Group:", error);
				new Notice(`Error: ${error?.message || error}`);
			}
		});
		modal.open();
	});
};

// Helper sleep function
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

