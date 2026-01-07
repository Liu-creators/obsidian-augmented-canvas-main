/**
 * Smart Connect Feature - AI Canvas v2.0
 * Creates intelligent connections between existing nodes based on user instructions
 * Based on PRD v2.0 Section 3.2
 */

import { App, ItemView, Notice } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { CanvasNode } from "../../obsidian/canvas-internal";
import { CanvasView, addEdge } from "../../obsidian/canvas-patches";
import { readNodeContent } from "../../obsidian/fileUtil";
import { streamResponse } from "../../utils/chatgpt";
import { parseXML, validateEdges, isXMLFormat } from "../../utils/xmlParser";
import { EdgeXML } from "../../types/xml.d";
import { randomHexString } from "../../utils";

/**
 * System prompt for Smart Connect
 * Per PRD v2.0 Section 3.2
 */
const SYSTEM_PROMPT_SMART_CONNECT = `
You are an intelligent canvas assistant specialized in analyzing relationships between nodes.

Task: Generate connections between existing nodes based on User Instruction.

OUTPUT FORMAT (XML):
- Output ONLY <edge> tags
- Do NOT create new <node> or <group> elements
- Format: <edge from="node_id" to="node_id" dir="forward|bi|none" label="relationship" />

DIRECTION RULES:
- "forward": Directional relationship (A → B), e.g., "causes", "leads to", "depends on"
- "bi": Bidirectional relationship (A ↔ B), e.g., "relates to", "connected with"
- "none": Non-directional association (A — B), e.g., "similar to", "contrasts with"

LABEL GUIDELINES:
- Keep labels brief (2-4 words)
- Use verbs for forward direction: "causes", "implements", "requires"
- Use neutral phrases for bi/none: "relates to", "similar to"
- Labels should describe the relationship clearly

VERIFICATION:
- Ensure 'from' and 'to' IDs exactly match the Input Node IDs
- Only create meaningful connections based on the instruction
- Do not connect every node to every other node

Example Output:
<edge from="node1" to="node2" dir="forward" label="depends on" />
<edge from="node2" to="node3" dir="forward" label="leads to" />
<edge from="node1" to="node3" dir="bi" label="relates to" />
`.trim();

/**
 * Smart Connect: Create AI-driven connections between selected nodes
 *
 * @param app - Obsidian app instance
 * @param settings - Plugin settings
 * @param selectedNodes - Array of selected canvas nodes
 * @param userInstruction - User's instruction for connection logic
 */
export async function smartConnectNodes(
	app: App,
	settings: AugmentedCanvasSettings,
	selectedNodes: CanvasNode[],
	userInstruction: string
): Promise<void> {
	// Validate API key
	if (!settings.apiKey) {
		new Notice("请在插件设置中设置 DeepSeek API 密钥");
		return;
	}

	// Validate selection
	if (!selectedNodes || selectedNodes.length < 2) {
		new Notice("请选择至少 2 个节点以创建连线");
		return;
	}

	if (selectedNodes.length > 20) {
		new Notice("选择的节点过多（最多 20 个）。请选择较少的节点。");
		return;
	}

	// Get active canvas
	const maybeCanvasView = app.workspace.getActiveViewOfType(ItemView) as CanvasView | null;
	const canvas = maybeCanvasView?.canvas;

	if (!canvas) {
		new Notice("未找到活动的画布。请打开一个画布视图。");
		return;
	}

	try {
		// Build nodes list for AI
		const nodesList = await buildNodesListForAI(selectedNodes);

		// Build prompt
		const prompt = `User Instruction: "${userInstruction}"

Input Nodes:
${nodesList}

Generate <edge> tags to connect these nodes based on the instruction.`;

		const messages: any[] = [
			{
				role: "system",
				content: SYSTEM_PROMPT_SMART_CONNECT,
			},
			{
				role: "user",
				content: prompt,
			},
		];

		new Notice(`Analyzing ${selectedNodes.length} nodes to create connections...`);

		// Stream AI response
		let accumulatedResponse = "";

		await streamResponse(
			settings.apiKey,
			messages,
			{
				model: settings.apiModel,
				max_tokens: settings.maxResponseTokens || 2000,
				temperature: settings.temperature,
			},
			(chunk: string | null, error?: Error) => {
				if (error) {
					throw error;
				}

				if (chunk) {
					accumulatedResponse += chunk;
				}
			}
		);

		// Parse XML response
		if (!isXMLFormat(accumulatedResponse)) {
			new Notice("AI response is not in XML format. Please try again.");
			console.error("[SmartConnect] Non-XML response:", accumulatedResponse);
			return;
		}

		const parseResult = parseXML(accumulatedResponse);

		if (!parseResult.success) {
			new Notice(`Failed to parse AI response: ${parseResult.errors.join(", ")}`);
			console.error("[SmartConnect] Parse errors:", parseResult.errors);
			return;
		}

		const { edges } = parseResult.response;

		// Show warnings if any
		if (parseResult.warnings.length > 0) {
			console.warn("[SmartConnect] Parse warnings:", parseResult.warnings);
		}

		// Validate edges against selected node IDs
		const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
		const validEdges = validateEdges(edges, selectedNodeIds);

		if (validEdges.length === 0) {
			new Notice("AI did not generate any valid connections. Try rephrasing your instruction.");
			return;
		}

		// Create edges on canvas
		const createdCount = await createEdgesOnCanvas(canvas, validEdges, selectedNodes);

		if (createdCount > 0) {
			new Notice(`✓ Successfully created ${createdCount} connection${createdCount > 1 ? "s" : ""}!`);
		} else {
			new Notice("Failed to create connections. Please try again.");
		}

		await canvas.requestSave();

	} catch (error: any) {
		const errorMessage = error?.message || error?.toString() || "Unknown error";
		console.error("[SmartConnect] Error:", error);
		new Notice(`Error creating connections: ${errorMessage}`);
	}
}

/**
 * Build formatted nodes list for AI prompt
 */
async function buildNodesListForAI(nodes: CanvasNode[]): Promise<string> {
	const nodeDescriptions: string[] = [];

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const content = await readNodeContent(node);
		const nodeData = node.getData();

		// Truncate long content
		const truncatedContent = content && content.length > 200
			? content.substring(0, 200) + "..."
			: content || "(empty)";

		const description = `- ID: ${node.id}
  Type: ${nodeData.type || "text"}
  Content: ${truncatedContent}`;

		nodeDescriptions.push(description);
	}

	return nodeDescriptions.join("\n\n");
}

/**
 * Create edges on canvas from parsed XML
 */
async function createEdgesOnCanvas(
	canvas: any,
	edges: EdgeXML[],
	selectedNodes: CanvasNode[]
): Promise<number> {
	// Build ID to node map
	const nodeMap = new Map<string, CanvasNode>();
	selectedNodes.forEach(node => nodeMap.set(node.id, node));

	let createdCount = 0;

	for (const edge of edges) {
		const fromNode = nodeMap.get(edge.from);
		const toNode = nodeMap.get(edge.to);

		if (!fromNode || !toNode) {
			console.warn(`[SmartConnect] Skipping edge: ${edge.from} -> ${edge.to} (nodes not found)`);
			continue;
		}

		try {
			// Determine edge sides based on node positions
			const { fromSide, toSide } = determineEdgeSides(fromNode, toNode);

			// Create edge
			addEdge(
				canvas,
				randomHexString(16),
				{
					fromOrTo: "from",
					side: fromSide,
					node: fromNode,
				},
				{
					fromOrTo: "to",
					side: toSide,
					node: toNode,
				},
				edge.label,
				{
					isGenerated: true,
				}
			);

			createdCount++;

			console.log(`[SmartConnect] Created edge: ${edge.from} -> ${edge.to} (${edge.label || "no label"})`);

		} catch (error) {
			console.error(`[SmartConnect] Failed to create edge ${edge.from} -> ${edge.to}:`, error);
		}
	}

	return createdCount;
}

/**
 * Determine optimal edge connection sides based on node positions
 */
function determineEdgeSides(
	fromNode: CanvasNode,
	toNode: CanvasNode
): { fromSide: string; toSide: string } {
	const fromCenterX = fromNode.x + fromNode.width / 2;
	const fromCenterY = fromNode.y + fromNode.height / 2;
	const toCenterX = toNode.x + toNode.width / 2;
	const toCenterY = toNode.y + toNode.height / 2;

	const deltaX = toCenterX - fromCenterX;
	const deltaY = toCenterY - fromCenterY;

	// Determine primary direction
	if (Math.abs(deltaX) > Math.abs(deltaY)) {
		// Horizontal connection
		if (deltaX > 0) {
			return { fromSide: "right", toSide: "left" };
		} else {
			return { fromSide: "left", toSide: "right" };
		}
	} else {
		// Vertical connection
		if (deltaY > 0) {
			return { fromSide: "bottom", toSide: "top" };
		} else {
			return { fromSide: "top", toSide: "bottom" };
		}
	}
}

