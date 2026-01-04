import { App, ItemView, Notice, setIcon, setTooltip } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { CanvasNode } from "../../obsidian/canvas-internal";
import { CanvasView, createNode } from "../../obsidian/canvas-patches";
import { noteGenerator } from "../canvasNodeMenuActions/noteGenerator";
import { streamResponse } from "../../utils/chatgpt";
import { parseNodesFromMarkdown, createGroupWithNodes } from "../../utils/groupGenerator";
import { isGroup, readGroupContent, buildGroupContext } from "../../utils/groupUtils";

/**
 * System prompt for group generation
 * Instructs AI to create multiple nodes using the new separator format
 * Each node can contain full Markdown syntax (bold, italic, lists, code blocks, etc.)
 */
const SYSTEM_PROMPT_GROUP = `
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
		
		const { messages, tokenCount } = await buildMessages(node, {
			systemPrompt: SYSTEM_PROMPT_GROUP,
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

		new Notice(
			`Sending ${messages.length} notes with ${tokenCount} tokens to generate group...`
		);

		// Stream response and accumulate
		let accumulatedResponse = "";
		let firstDelta = true;

		await streamResponse(
			settings.apiKey,
			messages,
			{
				model: settings.apiModel,
				max_tokens: settings.maxResponseTokens || undefined,
				temperature: settings.temperature,
			},
			(chunk: string | null, error?: Error) => {
				if (error) {
					throw error;
				}

				if (!chunk) {
					// Stream completed
					return;
				}

				if (firstDelta) {
					placeholderNode.setText("```Receiving AI response...```");
					firstDelta = false;
				}

				accumulatedResponse += chunk;
				
				// Update placeholder with progress
				// Count nodes using the new separator format: ---[NODE]---
				const newNodeSeparator = /---\s*\[NODE\]\s*---/g;
				const nodeMatches = accumulatedResponse.match(newNodeSeparator) || [];
				const nodeCount = nodeMatches.length + 1; // +1 because separator count + 1 = node count
				
				placeholderNode.setText(
					`\`\`\`Generating nodes... (${nodeCount} found so far)\`\`\``
				);
			}
		);

		// Stream completed, parse response
		placeholderNode.setText("```Parsing nodes and creating group...```");
		await sleep(300);

		const { nodes: parsedNodes, connections } = parseNodesFromMarkdown(accumulatedResponse);

		if (parsedNodes.length === 0) {
			// No nodes parsed, show error
			new Notice("Failed to parse any nodes from AI response. Creating single node instead.");
			placeholderNode.setText(accumulatedResponse);
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
			parentNode: node,
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
	} catch (error: any) {
		const errorMessage = error?.message || error?.toString() || "Unknown error";
		console.error("Group generation error:", error);
		new Notice(`Error generating group: ${errorMessage}`);
	}
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

