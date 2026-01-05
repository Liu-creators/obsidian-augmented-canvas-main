/**
 * Smart Grouping Feature - AI Canvas v2.0
 * Creates intelligent groups that wrap existing nodes based on user instructions
 * Based on PRD v2.0 Section 3.3
 */

import { App, ItemView, Notice } from "obsidian";
import { AugmentedCanvasSettings } from "../../settings/AugmentedCanvasSettings";
import { CanvasNode, Canvas } from "../../obsidian/canvas-internal";
import { CanvasView } from "../../obsidian/canvas-patches";
import { readNodeContent } from "../../obsidian/fileUtil";
import { streamResponse } from "../../utils/chatgpt";
import { parseXML, isXMLFormat } from "../../utils/xmlParser";
import { GroupWithMembersXML } from "../../types/xml.d";
import { randomHexString } from "../../utils";

/**
 * System prompt for Smart Grouping
 * Per PRD v2.0 Section 3.3
 */
const SYSTEM_PROMPT_SMART_GROUPING = `
You are an intelligent canvas assistant specialized in organizing and categorizing content.

Task: Organize existing nodes into logical groups based on User Instruction.

OUTPUT FORMAT (XML):
- Use <group> elements with <member> child elements
- Format: <group id="new_group_id" title="Group Title"><member id="existing_node_id" /></group>
- Do NOT create new content or <node> elements
- Do NOT modify existing node content
- Only reference existing node IDs using <member> tags

GROUPING RULES:
- Each node can belong to ONLY ONE group
- Group titles should be clear and descriptive (2-6 words)
- Create 2-5 groups based on the instruction
- Aim for balanced group sizes when possible
- If a node doesn't fit any group, you may omit it

GROUP ID FORMAT:
- Use semantic IDs like "g_frontend", "g_backend", "g_priority_high"
- Keep IDs short and meaningful

Example Output:
<group id="g_frontend" title="Frontend Stack">
    <member id="node_abc123" />
    <member id="node_def456" />
</group>
<group id="g_backend" title="Backend Services">
    <member id="node_ghi789" />
    <member id="node_jkl012" />
</group>

VERIFICATION:
- Ensure all member IDs exactly match Input Node IDs
- Do not create overlapping group memberships
- Group titles should reflect the instruction criteria
`.trim();

/**
 * Smart Grouping: Create AI-driven groups for existing nodes
 * 
 * @param app - Obsidian app instance
 * @param settings - Plugin settings
 * @param selectedNodes - Array of selected canvas nodes to group
 * @param userInstruction - User's instruction for grouping criteria
 */
export async function smartGroupExistingNodes(
	app: App,
	settings: AugmentedCanvasSettings,
	selectedNodes: CanvasNode[],
	userInstruction: string
): Promise<void> {
	// Validate API key
	if (!settings.apiKey) {
		new Notice("Please set your DeepSeek API key in the plugin settings");
		return;
	}
	
	// Validate selection
	if (!selectedNodes || selectedNodes.length < 2) {
		new Notice("Please select at least 2 nodes to create groups");
		return;
	}
	
	if (selectedNodes.length > 30) {
		new Notice("Too many nodes selected (max 30). Please select fewer nodes.");
		return;
	}
	
	// Get active canvas
	const maybeCanvasView = app.workspace.getActiveViewOfType(ItemView) as CanvasView | null;
	const canvas = maybeCanvasView?.canvas;
	
	if (!canvas) {
		new Notice("No active canvas found. Please open a canvas view.");
		return;
	}
	
	try {
		// Build nodes list for AI
		const nodesList = await buildNodesListForAI(selectedNodes);
		
		// Build prompt
		const prompt = `User Instruction: "${userInstruction}"

Input Nodes:
${nodesList}

Organize these nodes into logical groups using <group> and <member> tags.`;
		
		const messages: any[] = [
			{
				role: "system",
				content: SYSTEM_PROMPT_SMART_GROUPING,
			},
			{
				role: "user",
				content: prompt,
			},
		];
		
		new Notice(`Analyzing ${selectedNodes.length} nodes to create groups...`);
		
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
			console.error("[SmartGrouping] Non-XML response:", accumulatedResponse);
			return;
		}
		
		const parseResult = parseXML(accumulatedResponse);
		
		if (!parseResult.success) {
			new Notice(`Failed to parse AI response: ${parseResult.errors.join(", ")}`);
			console.error("[SmartGrouping] Parse errors:", parseResult.errors);
			return;
		}
		
		const { groupsWithMembers } = parseResult.response;
		
		// Show warnings if any
		if (parseResult.warnings.length > 0) {
			console.warn("[SmartGrouping] Parse warnings:", parseResult.warnings);
		}
		
		if (groupsWithMembers.length === 0) {
			new Notice("AI did not generate any groups. Try rephrasing your instruction.");
			return;
		}
		
		// Validate and create groups
		const createdCount = await createGroupsOnCanvas(
			canvas,
			groupsWithMembers,
			selectedNodes,
			settings
		);
		
		if (createdCount > 0) {
			new Notice(`✓ Successfully created ${createdCount} group${createdCount > 1 ? 's' : ''}!`);
		} else {
			new Notice("Failed to create groups. Please try again.");
		}
		
		await canvas.requestSave();
		
	} catch (error: any) {
		const errorMessage = error?.message || error?.toString() || "Unknown error";
		console.error("[SmartGrouping] Error:", error);
		new Notice(`Error creating groups: ${errorMessage}`);
	}
}

/**
 * Build formatted nodes list for AI prompt
 */
async function buildNodesListForAI(nodes: CanvasNode[]): Promise<string> {
	const nodeDescriptions: string[] = [];
	
	for (const node of nodes) {
		const content = await readNodeContent(node);
		const nodeData = node.getData();
		
		// Truncate long content
		const truncatedContent = content && content.length > 150
			? content.substring(0, 150) + "..."
			: content || "(empty)";
		
		const description = `- ID: ${node.id}
  Position: (${Math.round(node.x)}, ${Math.round(node.y)})
  Type: ${nodeData.type || "text"}
  Content: ${truncatedContent}`;
		
		nodeDescriptions.push(description);
	}
	
	return nodeDescriptions.join("\n\n");
}

/**
 * Create groups on canvas from parsed XML
 */
async function createGroupsOnCanvas(
	canvas: Canvas,
	groups: GroupWithMembersXML[],
	selectedNodes: CanvasNode[],
	settings: AugmentedCanvasSettings
): Promise<number> {
	// Build ID to node map
	const nodeMap = new Map<string, CanvasNode>();
	selectedNodes.forEach(node => nodeMap.set(node.id, node));
	
	let createdCount = 0;
	const data = canvas.getData();
	
	for (const group of groups) {
		// Validate members exist
		const memberNodes: CanvasNode[] = [];
		
		for (const memberId of group.members) {
			const node = nodeMap.get(memberId);
			if (node) {
				memberNodes.push(node);
			} else {
				console.warn(`[SmartGrouping] Member node not found: ${memberId}`);
			}
		}
		
		if (memberNodes.length === 0) {
			console.warn(`[SmartGrouping] Group "${group.title}" has no valid members, skipping`);
			continue;
		}
		
		// Calculate bounding box for the group
		const bbox = calculateBoundingBox(memberNodes, settings.groupPadding || 60);
		
		// Create group node
		const groupId = randomHexString(16);
		const groupNodeData = {
			id: groupId,
			type: "group",
			label: group.title,
			x: bbox.x,
			y: bbox.y,
			width: bbox.width,
			height: bbox.height,
			color: settings.defaultGroupColor || "4",
		};
		
		try {
			// Import group using canvas.importData()
			canvas.importData({
				nodes: [...data.nodes, groupNodeData],
				edges: data.edges,
			});
			
			await canvas.requestFrame();
			
			createdCount++;
			
			console.log(
				`[SmartGrouping] Created group "${group.title}" with ${memberNodes.length} members`
			);
			
		} catch (error) {
			console.error(`[SmartGrouping] Failed to create group "${group.title}":`, error);
		}
	}
	
	return createdCount;
}

/**
 * Calculate bounding box that wraps a set of nodes
 * Per PRD v2.0 Section 3.3
 */
function calculateBoundingBox(
	nodes: CanvasNode[],
	padding: number
): {
	x: number;
	y: number;
	width: number;
	height: number;
} {
	if (nodes.length === 0) {
		return { x: 0, y: 0, width: 0, height: 0 };
	}
	
	// Find min/max coordinates
	const minX = Math.min(...nodes.map(n => n.x));
	const minY = Math.min(...nodes.map(n => n.y));
	const maxX = Math.max(...nodes.map(n => n.x + n.width));
	const maxY = Math.max(...nodes.map(n => n.y + n.height));
	
	return {
		x: minX - padding,
		y: minY - padding,
		width: maxX - minX + padding * 2,
		height: maxY - minY + padding * 2,
	};
}

