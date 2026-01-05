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

CRITICAL OUTPUT ORDER (MUST FOLLOW):
- **DO NOT output all nodes first, then all edges**
- **Output in this progressive pattern: node -> edge -> node -> edge**
- When a node connects to another node, output them together:
  1. First node: <node id="n1">...</node>
  2. Edge connecting to next node: <edge from="n1" to="n2" ... />
  3. Second node (the connected node): <node id="n2">...</node>
  4. Edge from second node (if it connects to another): <edge from="n2" to="n3" ... />
  5. Continue: node -> edge -> node -> edge...
- This progressive output allows the canvas to render nodes with their connections immediately
- If a node has no connections, output it alone (no edge needed)
- **Example of WRONG order (DO NOT DO THIS):**
  <node id="n1">...</node>
  <node id="n2">...</node>
  <node id="n3">...</node>
  <edge from="n1" to="n2" />
  <edge from="n2" to="n3" />
- **Example of CORRECT order (DO THIS):**
  <node id="n1">...</node>
  <edge from="n1" to="n2" />
  <node id="n2">...</node>
  <edge from="n2" to="n3" />
  <node id="n3">...</node>

Example Output (Progressive Node-Edge Pattern):
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
		const xmlParser = new IncrementalXMLParser();
		const mdParser = new IncrementalMarkdownParser();
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
					
					// IMPORTANT: Store edges first to build dependency graph
					// This allows nodes to know their dependencies when being created
					const completeEdges = xmlParser.detectCompleteEdges();
					completeEdges.forEach(edge => nodeCreator.storeEdge(edge));
					
					// Detect and create complete nodes (now with dependency awareness)
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
			
			// Process any remaining edges that might have been parsed
			const remainingEdges = xmlParser.detectCompleteEdges();
			remainingEdges.forEach(edge => nodeCreator.storeEdge(edge));
			
			// Process any remaining nodes that might have been parsed
			const remainingNodes = xmlParser.detectCompleteNodes();
			for (const nodeXML of remainingNodes) {
				await nodeCreator.createNodeFromXML(nodeXML);
				await canvas.requestFrame();
			}
			
			// Create all pending nodes (nodes without connections)
			await nodeCreator.createAllPendingNodes();
			await canvas.requestFrame();
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

