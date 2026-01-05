/**
 * XML Parser for AI Canvas v2.0
 * Parses XML responses from AI according to PRD v2.0 protocol
 */

import {
	NodeXML,
	GroupXML,
	GroupWithMembersXML,
	EdgeXML,
	ParsedAIResponse,
	XMLParseOptions,
	XMLParseResult,
} from "../types/xml.d";
import { NodeType, isValidNodeType } from "./typeMapping";

/**
 * Parse XML string to AI response structure
 * 
 * @param xmlString - Raw XML string from AI
 * @param options - Parsing options
 * @returns Parsed result with nodes, groups, edges
 */
export function parseXML(
	xmlString: string,
	options: XMLParseOptions = {}
): XMLParseResult {
	const {
		validateUniqueIds = true,
		strictTypes = false,
		defaultType = "default",
		maxDepth = 3,
	} = options;
	
	const warnings: string[] = [];
	const errors: string[] = [];
	const seenIds = new Set<string>();
	
	// Wrap XML in root element if not already wrapped
	const wrappedXML = wrapXMLIfNeeded(xmlString);
	
	// Parse XML using DOMParser
	const parser = new DOMParser();
	const xmlDoc = parser.parseFromString(wrappedXML, "text/xml");
	
	// Check for parsing errors
	const parserError = xmlDoc.querySelector("parsererror");
	if (parserError) {
		errors.push(`XML parsing error: ${parserError.textContent}`);
		return {
			response: {
				nodes: [],
				groups: [],
				groupsWithMembers: [],
				edges: [],
			},
			warnings,
			errors,
			success: false,
		};
	}
	
	const response: ParsedAIResponse = {
		nodes: [],
		groups: [],
		groupsWithMembers: [],
		edges: [],
	};
	
	const root = xmlDoc.documentElement;
	
	// Parse top-level nodes
	const nodeElements = root.querySelectorAll(":scope > node");
	nodeElements.forEach((element) => {
		try {
			const node = parseNodeElement(element, defaultType, strictTypes);
			
			// Validate unique ID
			if (validateUniqueIds && seenIds.has(node.id)) {
				warnings.push(`Duplicate node ID: ${node.id}`);
			}
			seenIds.add(node.id);
			
			response.nodes.push(node);
		} catch (error: any) {
			warnings.push(`Failed to parse node: ${error.message}`);
		}
	});
	
	// Parse groups
	const groupElements = root.querySelectorAll(":scope > group");
	groupElements.forEach((element) => {
		try {
			const hasMembers = element.querySelector(":scope > member") !== null;
			
			if (hasMembers) {
				// Smart Grouping format: <group><member/></group>
				const group = parseGroupWithMembersElement(element);
				response.groupsWithMembers.push(group);
			} else {
				// Smart Expand format: <group><node/></group>
				const group = parseGroupElement(element, defaultType, strictTypes, maxDepth);
				
				// Validate unique IDs
				if (validateUniqueIds) {
					if (seenIds.has(group.id)) {
						warnings.push(`Duplicate group ID: ${group.id}`);
					}
					seenIds.add(group.id);
					
					group.nodes.forEach(node => {
						if (seenIds.has(node.id)) {
							warnings.push(`Duplicate node ID in group: ${node.id}`);
						}
						seenIds.add(node.id);
					});
				}
				
				response.groups.push(group);
			}
		} catch (error: any) {
			warnings.push(`Failed to parse group: ${error.message}`);
		}
	});
	
	// Parse edges
	const edgeElements = root.querySelectorAll(":scope > edge");
	edgeElements.forEach((element) => {
		try {
			const edge = parseEdgeElement(element);
			response.edges.push(edge);
		} catch (error: any) {
			warnings.push(`Failed to parse edge: ${error.message}`);
		}
	});
	
	return {
		response,
		warnings,
		errors,
		success: errors.length === 0,
	};
}

/**
 * Wrap XML string in root element if needed
 */
function wrapXMLIfNeeded(xmlString: string): string {
	const trimmed = xmlString.trim();
	
	// Check if already has root element
	if (trimmed.startsWith("<root>") || trimmed.startsWith("<response>")) {
		return trimmed;
	}
	
	// Wrap in root element
	return `<root>${trimmed}</root>`;
}

/**
 * Parse a <node> element
 */
function parseNodeElement(
	element: Element,
	defaultType: NodeType,
	strictTypes: boolean
): NodeXML {
	// Extract attributes
	const id = element.getAttribute("id");
	if (!id) {
		throw new Error("Node missing required 'id' attribute");
	}
	
	const typeStr = element.getAttribute("type") || defaultType;
	const type = parseNodeType(typeStr, strictTypes, defaultType);
	
	const title = element.getAttribute("title") || undefined;
	
	const rowStr = element.getAttribute("row");
	const colStr = element.getAttribute("col");
	
	if (rowStr === null || colStr === null) {
		throw new Error(`Node ${id} missing 'row' or 'col' attribute`);
	}
	
	const row = parseInt(rowStr, 10);
	const col = parseInt(colStr, 10);
	
	if (isNaN(row) || isNaN(col)) {
		throw new Error(`Node ${id} has invalid row/col values`);
	}
	
	// Extract content (text content of the element)
	const content = element.textContent?.trim() || "";
	
	return {
		id,
		type,
		title,
		row,
		col,
		content,
	};
}

/**
 * Parse a <group> element with nested <node> elements
 */
function parseGroupElement(
	element: Element,
	defaultType: NodeType,
	strictTypes: boolean,
	maxDepth: number
): GroupXML {
	const id = element.getAttribute("id");
	if (!id) {
		throw new Error("Group missing required 'id' attribute");
	}
	
	const title = element.getAttribute("title") || "Untitled Group";
	
	const rowStr = element.getAttribute("row");
	const colStr = element.getAttribute("col");
	
	if (rowStr === null || colStr === null) {
		throw new Error(`Group ${id} missing 'row' or 'col' attribute`);
	}
	
	const row = parseInt(rowStr, 10);
	const col = parseInt(colStr, 10);
	
	if (isNaN(row) || isNaN(col)) {
		throw new Error(`Group ${id} has invalid row/col values`);
	}
	
	// Parse child nodes
	const nodes: NodeXML[] = [];
	const nodeElements = element.querySelectorAll(":scope > node");
	
	nodeElements.forEach((nodeElement) => {
		const node = parseNodeElement(nodeElement, defaultType, strictTypes);
		nodes.push(node);
	});
	
	if (nodes.length === 0) {
		console.warn(`[XMLParser] Group ${id} has no nodes`);
	}
	
	return {
		id,
		title,
		row,
		col,
		nodes,
	};
}

/**
 * Parse a <group> element with <member> elements (Smart Grouping)
 */
function parseGroupWithMembersElement(element: Element): GroupWithMembersXML {
	const id = element.getAttribute("id");
	if (!id) {
		throw new Error("Group missing required 'id' attribute");
	}
	
	const title = element.getAttribute("title") || "Untitled Group";
	
	// Parse member elements
	const members: string[] = [];
	const memberElements = element.querySelectorAll(":scope > member");
	
	memberElements.forEach((memberElement) => {
		const memberId = memberElement.getAttribute("id");
		if (memberId) {
			members.push(memberId);
		} else {
			console.warn(`[XMLParser] Member element missing 'id' attribute in group ${id}`);
		}
	});
	
	return {
		id,
		title,
		members,
	};
}

/**
 * Parse an <edge> element
 */
function parseEdgeElement(element: Element): EdgeXML {
	const from = element.getAttribute("from");
	const to = element.getAttribute("to");
	
	if (!from || !to) {
		throw new Error("Edge missing required 'from' or 'to' attribute");
	}
	
	const dirStr = element.getAttribute("dir") || "forward";
	const dir = parseEdgeDirection(dirStr);
	
	const label = element.getAttribute("label") || undefined;
	
	return {
		from,
		to,
		dir,
		label,
	};
}

/**
 * Parse and validate node type
 */
function parseNodeType(
	typeStr: string,
	strict: boolean,
	defaultType: NodeType
): NodeType {
	const normalized = typeStr.toLowerCase();
	
	if (isValidNodeType(normalized)) {
		return normalized as NodeType;
	}
	
	if (strict) {
		throw new Error(`Invalid node type: ${typeStr}`);
	}
	
	console.warn(`[XMLParser] Invalid node type "${typeStr}", using default "${defaultType}"`);
	return defaultType;
}

/**
 * Parse and validate edge direction
 */
function parseEdgeDirection(dirStr: string): "forward" | "bi" | "none" {
	const normalized = dirStr.toLowerCase();
	
	if (normalized === "forward" || normalized === "bi" || normalized === "none") {
		return normalized;
	}
	
	console.warn(`[XMLParser] Invalid edge direction "${dirStr}", using "forward"`);
	return "forward";
}

/**
 * Detect if a string contains XML format
 * Quick heuristic to determine if we should use XML parser
 * 
 * @param content - String to check
 * @returns True if likely XML
 */
export function isXMLFormat(content: string): boolean {
	const trimmed = content.trim();
	
	// Check for XML-like opening tags
	return (
		trimmed.startsWith("<node") ||
		trimmed.startsWith("<group") ||
		trimmed.startsWith("<edge") ||
		trimmed.startsWith("<root>") ||
		trimmed.startsWith("<response>")
	);
}

/**
 * Validate that all edge references exist in the parsed nodes/groups
 * Per PRD Section 4.2: Silently drop invalid edges
 * 
 * @param edges - Array of edges to validate
 * @param existingIds - Set of valid node/group IDs
 * @returns Filtered array of valid edges
 */
export function validateEdges(
	edges: EdgeXML[],
	existingIds: Set<string>
): EdgeXML[] {
	return edges.filter((edge) => {
		const fromValid = existingIds.has(edge.from);
		const toValid = existingIds.has(edge.to);
		
		if (!fromValid || !toValid) {
			console.warn(
				`[XMLParser] Dropping invalid edge: ${edge.from} -> ${edge.to} ` +
				`(from: ${fromValid}, to: ${toValid})`
			);
			return false;
		}
		
		return true;
	});
}

/**
 * Extract all node IDs from parsed response
 * 
 * @param response - Parsed AI response
 * @returns Set of all node IDs
 */
export function extractAllNodeIds(response: ParsedAIResponse): Set<string> {
	const ids = new Set<string>();
	
	// Add flat nodes
	response.nodes.forEach(node => ids.add(node.id));
	
	// Add groups and their children
	response.groups.forEach(group => {
		ids.add(group.id);
		group.nodes.forEach(node => ids.add(node.id));
	});
	
	// Add groups with members (just the group IDs)
	response.groupsWithMembers.forEach(group => {
		ids.add(group.id);
	});
	
	return ids;
}

