import { App, ItemView, Notice, setIcon, setTooltip } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { CanvasNode } from "../../obsidian/canvas-internal";
import { CanvasView, createNode } from "../../obsidian/canvas-patches";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";
import { streamResponse } from "../../utils/chatgpt";
import { parseNodesFromMarkdown, createGroupWithNodes, IncrementalMarkdownParser } from "../../utils/groupGenerator";
import { isGroup, readGroupContent, buildGroupContext } from "../../utils/groupUtils";
import { parseXML, isXMLFormat } from "../../utils/xmlParser";
import { getColorForType } from "../../utils/typeMapping";
import { gridToPixel, DEFAULT_GRID_OPTIONS } from "../../utils/coordinateSystem";
import { randomHexString } from "../../utils";
import { addEdge } from "../../obsidian/canvas-patches";
import { IncrementalXMLParser } from "../../utils/incrementalXMLParser";
import { StreamingNodeCreator } from "../../utils/streamingNodeCreator";

/**
 * System prompt for Smart Expand - XML Format (PRD v2.0)
 * Enhanced with semantic positioning guidelines
 * Based on PRD v2.0 Section 3.1
 */
const SYSTEM_PROMPT_SMART_EXPAND_XML = `
You are an intelligent canvas assistant.
Goal: Expand on the user's input node based on their instruction.

OUTPUT FORMAT (XML):
1. Use <node id="..." type="..." title="..." row="Int" col="Int">Markdown</node>
2. If the user asks for a specific module/plan, wrap nodes in <group id="..." title="..." row="Int" col="Int">...</group>.
3. Coordinates (row, col) are relative to the source node (0,0).
   - Place response to the Right (col=1) or Bottom (row=1).
   - Use negative row/col to place content above/left if needed.

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
  * Cause → Effect: Place effect to the RIGHT (row=0, col=1)
  * Sequential steps: Place below in vertical flow (row+1, col=0)
  * Parallel concepts: Place to the right (row=0, col+1) for horizontal layout
  * Details/elaboration: Place to RIGHT or BOTTOM-RIGHT (row=1, col=1)
  * Summary/conclusion: Consider placing ABOVE or to the LEFT (negative row/col)
  * Branching alternatives: Distribute around source (right, down, down-right)

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

Example Output (Scattered Nodes with Semantic Positioning):
<node id="n1" type="concept" title="Core Idea" row="0" col="1">
The fundamental concept is **modularity**.
- Separation of concerns
- Reusable components
</node>

<node id="n2" type="step" title="Implementation" row="1" col="1">
1. Define interfaces
2. Implement modules
3. Test integration
</node>

<node id="n3" type="warning" title="Pitfalls" row="1" col="0">
⚠️ Avoid tight coupling between modules.
</node>

Example Output (Grouped Nodes):
<group id="g1" title="Technical Implementation" row="0" col="1">
    <node id="n1" type="step" title="Setup" row="0" col="0">
    Initial configuration steps...
    </node>
    
    <node id="n2" type="step" title="Execution" row="1" col="0">
    Main execution flow...
    </node>
</group>

OPTIONAL: Add connections between nodes:
<edge from="n1" to="n2" dir="forward" label="leads to" />
<edge from="n2" to="n3" dir="forward" label="must avoid" />

Remember: The positioning system will also use spatial analysis to avoid overlaps, 
but your coordinate suggestions help establish the logical flow and relationships.
`.trim();

/**
 * System prompt for group generation - Markdown Format (Legacy)
 * Maintained for backward compatibility
 */
const SYSTEM_PROMPT_GROUP_MARKDOWN = `
You are helping to generate content for multiple connected nodes in a visual canvas.

IMPORTANT: Separate each node using this EXACT separator (on its own line, with blank lines before and after):
---[NODE]---

Each node can contain full Markdown syntax including:
- **Bold text** and *italic text*
- Lists (bulleted or numbered)
- Code blocks with \`backticks\`
- Headers like ### if needed
- Horizontal rules with ---
- Links and other Markdown features

Guidelines:
- Create 3-6 related nodes that comprehensively cover different aspects of the topic
- Each node should be focused and concise (2-5 paragraphs)
- Feel free to use Markdown formatting within each node to enhance readability
- Make sure each node adds unique value and different perspective
- Use the same language as the user's question

Example format:
First node content with **bold** and *italic* text.
- List item 1
- List item 2
- List item 3

Here's more content with \`code\` examples.

---[NODE]---

Second node content with more Markdown formatting.

### Subheading
- Another list
- With **formatted** items

---[NODE]---

Third node content...

OPTIONAL: After all nodes, you can specify connections between nodes using this format:
---[CONNECTIONS]---
1 -> 2: "depends on"
2 -> 3: "leads to"
1 -> 3: "relates to"

Connection guidelines:
- Use node numbers (1, 2, 3...) based on the order nodes appear
- Format: "from -> to: \"label\"" (label is optional)
- Only create connections that have meaningful relationships
- Not all nodes need to be connected
- Labels should be brief and describe the relationship (e.g., "depends on", "leads to", "relates to", "prerequisite for")
- Connections are one-way (unidirectional)
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
		
		// Use XML format (PRD v2.0) by default, fall back to Markdown if needed
		const useXMLFormat = settings.useXMLFormat !== false; // Default to true
		const systemPrompt = useXMLFormat ? SYSTEM_PROMPT_SMART_EXPAND_XML : SYSTEM_PROMPT_GROUP_MARKDOWN;
		
		const { messages, tokenCount } = await buildMessages(node, {
			systemPrompt: systemPrompt,
			prompt: finalPrompt,
		});

		// Create placeholder node
		const placeholderNode = createNode(
			canvas,
			{
				text: `\`\`\`Generating group with AI (${settings.apiModel})...\`\`\``,
				size: { height: 60 },
			},
			node,
			{
				color: "4", // Green for group generation
				chat_role: "assistant",
			},
			userQuestion
		);

		// Get the main edge ID (the edge just created from source node to placeholder)
		const canvasData = canvas.getData();
		const mainEdge = canvasData.edges[canvasData.edges.length - 1]; // Last edge
		const mainEdgeId = mainEdge?.id || randomHexString(16);

		new Notice(
			`Sending ${messages.length} notes with ${tokenCount} tokens to generate group...`
		);

		// Initialize incremental parsers and node creator
		const useXML = settings.useXMLFormat !== false;
		const xmlParser = useXML ? new IncrementalXMLParser() : null;
		const mdParser = !useXML ? new IncrementalMarkdownParser() : null;
		const nodeCreator = new StreamingNodeCreator(canvas, node, settings);
		
		// Set placeholder information for main edge redirection
		nodeCreator.setPlaceholder(placeholderNode, mainEdgeId, userQuestion || "");
		
		let accumulatedResponse = "";
		let lastPreviewUpdate = Date.now();
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
					// Stream completed
					return;
				}

				accumulatedResponse += chunk;
				
				// 1. Update placeholder preview (throttled to 100ms)
				const now = Date.now();
				if (now - lastPreviewUpdate > 100) {
					// Show last 500 characters as preview
					const preview = accumulatedResponse.length > 500 
						? "..." + accumulatedResponse.slice(-500) 
						: accumulatedResponse;
					placeholderNode.setText(preview);
					lastPreviewUpdate = now;
				}
				
				// 2. Incremental parsing and node creation
				if (xmlParser) {
					xmlParser.append(chunk);
					
					// Detect and create complete nodes
					const completeNodes = xmlParser.detectCompleteNodes();
					for (const nodeXML of completeNodes) {
						await nodeCreator.createNodeFromXML(nodeXML);
						await canvas.requestFrame();
					}
					
					// Detect and create groups
					const completeGroups = xmlParser.detectCompleteGroups();
					for (const groupXML of completeGroups) {
						await nodeCreator.createGroupFromXML(groupXML);
						await canvas.requestFrame();
					}
					
					// Store edges for later
					const completeEdges = xmlParser.detectCompleteEdges();
					completeEdges.forEach(edge => nodeCreator.storeEdge(edge));
					
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
		placeholderNode.setText("```Finalizing nodes and connections...```");
		await sleep(200);
		
		// Process any remaining content
		if (xmlParser) {
			// Check for unparsed content
			const remaining = xmlParser.getUnprocessedContent();
			if (remaining.trim()) {
				console.warn("[GenerateGroup] Unparsed XML content:", remaining.substring(0, 100));
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
		
		// Create all pending edges
		const edgeCount = await nodeCreator.createAllEdges();
		await canvas.requestFrame();
		
		// Note: Placeholder is removed in redirectMainEdge() when first node is created
		
		// Success notification
		const totalNodes = nodeCreator.getCreatedNodeCount();
		const edgeMsg = edgeCount > 0 ? ` and ${edgeCount} connection${edgeCount > 1 ? 's' : ''}` : '';
		new Notice(`✓ Created ${totalNodes} node${totalNodes > 1 ? 's' : ''}${edgeMsg} with organic growth!`);
		
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
 * Handle XML format response (PRD v2.0)
 */
async function handleXMLResponse(
	xmlResponse: string,
	canvas: any,
	sourceNode: CanvasNode,
	placeholderNode: CanvasNode,
	userQuestion: string | undefined,
	settings: AugmentedCanvasSettings
): Promise<void> {
	const parseResult = parseXML(xmlResponse);
	
	if (!parseResult.success) {
		new Notice(`Failed to parse XML response: ${parseResult.errors.join(", ")}`);
		console.error("[GenerateGroup] XML parse errors:", parseResult.errors);
		placeholderNode.setText(`Parse Error:\n${parseResult.errors.join("\n")}`);
		return;
	}
	
	const { nodes, groups, edges } = parseResult.response;
	
	// Show warnings if any
	if (parseResult.warnings.length > 0) {
		console.warn("[GenerateGroup] XML parse warnings:", parseResult.warnings);
	}
	
	// Create nodes using grid coordinate system
	const createdNodes: CanvasNode[] = [];
	const nodeIdMap = new Map<string, CanvasNode>();
	
	// Create flat nodes (not in groups)
	for (const nodeXML of nodes) {
		try {
			const pixelPos = gridToPixel(
				{ row: nodeXML.row, col: nodeXML.col },
				sourceNode,
				DEFAULT_GRID_OPTIONS
			);
			
			const color = getColorForType(nodeXML.type);
			
			const newNode = canvas.createTextNode({
				pos: { x: pixelPos.x, y: pixelPos.y },
				position: "left",
				size: { width: 360, height: 200 },
				text: nodeXML.content,
				focus: false,
			});
			
			if (color) {
				newNode.setData({ color });
			}
			
			canvas.addNode(newNode);
			createdNodes.push(newNode);
			nodeIdMap.set(nodeXML.id, newNode);
			
			console.log(`[GenerateGroup] Created node ${nodeXML.id} at (${nodeXML.row}, ${nodeXML.col})`);
		} catch (error) {
			console.error(`[GenerateGroup] Failed to create node ${nodeXML.id}:`, error);
		}
	}
	
	// Create groups with nested nodes
	for (const groupXML of groups) {
		try {
			// Calculate group position
			const groupPixelPos = gridToPixel(
				{ row: groupXML.row, col: groupXML.col },
				sourceNode,
				DEFAULT_GRID_OPTIONS
			);
			
			const groupPadding = settings.groupPadding || 60;
			const groupId = randomHexString(16);
			
			// Create nodes inside group
			const groupNodes: any[] = [];
			for (const nodeXML of groupXML.nodes) {
				const nodePixelPos = gridToPixel(
					{ row: nodeXML.row, col: nodeXML.col },
					{ x: groupPixelPos.x + groupPadding, y: groupPixelPos.y + groupPadding } as any,
					DEFAULT_GRID_OPTIONS
				);
				
				const color = getColorForType(nodeXML.type);
				
				groupNodes.push({
					id: randomHexString(16),
					type: "text",
					text: nodeXML.content,
					x: nodePixelPos.x,
					y: nodePixelPos.y,
					width: 360,
					height: 200,
					color: color || undefined,
				});
				
				nodeIdMap.set(nodeXML.id, { id: groupNodes[groupNodes.length - 1].id } as any);
			}
			
			// Calculate group bounds
			if (groupNodes.length > 0) {
				const minX = Math.min(...groupNodes.map(n => n.x));
				const minY = Math.min(...groupNodes.map(n => n.y));
				const maxX = Math.max(...groupNodes.map(n => n.x + n.width));
				const maxY = Math.max(...groupNodes.map(n => n.y + n.height));
				
				const groupNodeData = {
					id: groupId,
					type: "group",
					label: groupXML.title,
					x: minX - groupPadding,
					y: minY - groupPadding,
					width: maxX - minX + groupPadding * 2,
					height: maxY - minY + groupPadding * 2,
					color: settings.defaultGroupColor || "4",
				};
				
				// Import group and nodes
				const data = canvas.getData();
				canvas.importData({
					nodes: [...data.nodes, groupNodeData, ...groupNodes],
					edges: data.edges,
				});
				
				await canvas.requestFrame();
				
				console.log(`[GenerateGroup] Created group ${groupXML.id} with ${groupXML.nodes.length} nodes`);
			}
		} catch (error) {
			console.error(`[GenerateGroup] Failed to create group ${groupXML.id}:`, error);
		}
	}
	
	// Create edges
	let createdEdges = 0;
	for (const edge of edges) {
		const fromNode = nodeIdMap.get(edge.from);
		const toNode = nodeIdMap.get(edge.to);
		
		if (fromNode && toNode) {
			try {
				addEdge(
					canvas,
					randomHexString(16),
					{
						fromOrTo: "from",
						side: "right",
						node: fromNode,
					},
					{
						fromOrTo: "to",
						side: "left",
						node: toNode,
					},
					edge.label,
					{ isGenerated: true }
				);
				createdEdges++;
			} catch (error) {
				console.error(`[GenerateGroup] Failed to create edge ${edge.from} -> ${edge.to}:`, error);
			}
		}
	}
	
	// Remove placeholder
	canvas.removeNode(placeholderNode);
	
	// Show success message
	const totalNodes = nodes.length + groups.reduce((sum, g) => sum + g.nodes.length, 0);
	const edgeMsg = createdEdges > 0 ? ` and ${createdEdges} connection${createdEdges > 1 ? 's' : ''}` : '';
	new Notice(`✓ Created ${totalNodes} node${totalNodes > 1 ? 's' : ''}${edgeMsg}!`);
	
	await canvas.requestSave();
}

/**
 * Handle Markdown format response (Legacy)
 */
async function handleMarkdownResponse(
	markdownResponse: string,
	canvas: any,
	sourceNode: CanvasNode,
	placeholderNode: CanvasNode,
	userQuestion: string | undefined,
	settings: AugmentedCanvasSettings
): Promise<void> {
	const { nodes: parsedNodes, connections } = parseNodesFromMarkdown(markdownResponse);

		if (parsedNodes.length === 0) {
			// No nodes parsed, show error
			new Notice("Failed to parse any nodes from AI response. Creating single node instead.");
		placeholderNode.setText(markdownResponse);
			placeholderNode.moveAndResize({
				height: 400,
				width: placeholderNode.width,
				x: placeholderNode.x,
				y: placeholderNode.y,
			});
			return;
		}

		if (parsedNodes.length === 1) {
			// Only one node, don't create group
			new Notice("AI generated single node. Creating as regular note.");
			placeholderNode.setText(parsedNodes[0].content);
			placeholderNode.moveAndResize({
				height: 400,
				width: placeholderNode.width,
				x: placeholderNode.x,
				y: placeholderNode.y,
			});
			return;
		}

		// Extract group label from question or use default
		const groupLabel = extractGroupLabel(userQuestion, parsedNodes.length);

		// Create group with nodes and connections
		const groupNode = await createGroupWithNodes(canvas, parsedNodes, {
			groupLabel,
			groupColor: settings.defaultGroupColor || "4",
			nodeSpacing: settings.groupNodeSpacing || 40,
			groupPadding: settings.groupPadding || 60,
		parentNode: sourceNode,
			edgeLabel: userQuestion,
			connections,
		});

		// Remove placeholder
		canvas.removeNode(placeholderNode);

		if (groupNode) {
			const connectionCount = connections.length;
			const connectionMsg = connectionCount > 0 
				? ` with ${connectionCount} connection${connectionCount > 1 ? 's' : ''}` 
				: '';
			new Notice(`✓ Successfully created group with ${parsedNodes.length} nodes${connectionMsg}!`);
		} else {
			new Notice("Group creation completed but node reference not available.");
		}

		await canvas.requestSave();
}

/**
 * Extract a meaningful group label from user question
 */
function extractGroupLabel(question: string | undefined, nodeCount: number): string {
	if (!question) {
		return `AI Generated Group (${nodeCount} nodes)`;
	}

	// Remove common question words
	const cleaned = question
		.replace(/^(please|create|generate|make|give me|show me|can you|could you|explain|describe|tell me about)\s+/i, "")
		.replace(/\?+$/, "")
		.trim();

	// Capitalize first letter
	const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

	// Limit length
	const label = capitalized.length > 50 
		? capitalized.substring(0, 47) + "..." 
		: capitalized;

	return label || `AI Generated Group (${nodeCount} nodes)`;
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
	setTooltip(buttonEl, "Generate Group with AI", {
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

