/**
 * Incremental XML Parser for Streaming Display
 * Detects and extracts complete XML elements as they arrive in chunks
 */

import { NodeXML, GroupXML, EdgeXML } from "../types/xml.d";
import { NodeType, isValidNodeType } from "./typeMapping";

/**
 * Represents a detected complete XML element with its position
 */
interface DetectedElement {
	start: number;
	end: number;
	xml: string;
}

/**
 * Incremental XML Parser for streaming responses
 * Detects complete XML elements as they arrive and extracts them
 */
export class IncrementalXMLParser {
	private buffer: string = "";
	private processedLength: number = 0;
	
	/**
	 * Sanitize content by removing trailing partial XML tags
	 * 
	 * Handles these cases:
	 * - Trailing `<` (start of potential tag)
	 * - Trailing `</` (start of closing tag)
	 * - Trailing `</xxx` (partial closing tag name)
	 * - Trailing `<xxx` (partial opening tag name)
	 * 
	 * Edge cases preserved (not removed):
	 * - `< ` (less-than followed by space, e.g., "a < b")
	 * - `<5` (less-than followed by digit, e.g., "x<5")
	 * - Any `<` not at the very end of the string
	 * 
	 * @param content - Raw content that may contain partial tags
	 * @returns Sanitized content with trailing partial tags removed
	 */
	public sanitizeContent(content: string): string {
		// Remove trailing partial tags using regex
		// Pattern: < optionally followed by / optionally followed by letters at end of string
		return content.replace(/<\/?[a-zA-Z]*$/, '');
	}
	
	/**
	 * Append new chunk to buffer
	 */
	public append(chunk: string): void {
		this.buffer += chunk;
	}
	
	/**
	 * Get the unprocessed content (for preview display)
	 */
	public getUnprocessedContent(): string {
		return this.buffer.substring(this.processedLength);
	}
	
	/**
	 * Get full buffer content
	 */
	public getFullContent(): string {
		return this.buffer;
	}
	
	/**
	 * Detect and extract complete <node> elements
	 * Returns parsed NodeXML objects and updates processedLength
	 */
	public detectCompleteNodes(): NodeXML[] {
		const nodes: NodeXML[] = [];
		
		// Detect all nodes, including those inside groups
		const detected = this.detectCompleteElements(
			/<node\s+[^>]*>[\s\S]*?<\/node>/g
		);
		
		for (const elem of detected) {
			try {
				const node = this.parseNodeElement(elem.xml);
				
				// Check if we're inside a group to set groupId
				const beforeNode = this.buffer.substring(0, elem.start);
				const openGroupMatch = beforeNode.match(/<group\s+([^>]+)>/g);
				const openGroupCount = (openGroupMatch || []).length;
				const closeGroupCount = (beforeNode.match(/<\/group>/g) || []).length;

				if (openGroupCount > closeGroupCount) {
					const lastOpenGroup = openGroupMatch![openGroupMatch!.length - 1];
					const groupIdMatch = lastOpenGroup.match(/id="([^"]+)"/);
					if (groupIdMatch) {
						node.groupId = groupIdMatch[1];
					}
				}

				nodes.push(node);
				
				// Mark as processed
				if (elem.end > this.processedLength) {
					this.processedLength = elem.end;
				}
			} catch (error) {
				console.warn("[IncrementalXMLParser] Failed to parse node:", error);
			}
		}
		
		return nodes;
	}

	/**
	 * Detect and extract incomplete <node> elements (currently being streamed)
	 * Returns partial NodeXML objects without updating processedLength
	 */
	public detectIncompleteNodes(): NodeXML[] {
		const nodes: NodeXML[] = [];
		const unprocessed = this.getUnprocessedContent();
		
		// Match <node id="..." ...>
		const nodeStartRegex = /<node\s+([^>]+)>/g;
		let match: RegExpExecArray | null;
		
		while ((match = nodeStartRegex.exec(unprocessed)) !== null) {
			const tagContent = match[1];
			const startPos = match.index;
			const afterTag = unprocessed.substring(startPos + match[0].length);
			
			// If it's already complete in the unprocessed buffer, detectCompleteNodes will handle it
			// unless we are specifically looking for real-time updates for it
			const hasEndTag = afterTag.includes("</node>");
			
			try {
				// Extract attributes from the opening tag
				const idMatch = tagContent.match(/id="([^"]+)"/);
				if (!idMatch) continue;
				const id = idMatch[1];
				
				const typeMatch = tagContent.match(/type="([^"]+)"/);
				const type = this.parseNodeType(typeMatch ? typeMatch[1] : "default");
				
				const titleMatch = tagContent.match(/title="([^"]+)"/);
				const title = titleMatch ? titleMatch[1] : undefined;
				
				const rowMatch = tagContent.match(/row="([^"]+)"/);
				const colMatch = tagContent.match(/col="([^"]+)"/);
				const row = rowMatch ? parseInt(rowMatch[1], 10) : 0;
				const col = colMatch ? parseInt(colMatch[1], 10) : 0;
				
				// Content is everything from the end of the opening tag to the end of unprocessed
				// or until the next tag starts (opening or closing)
				const nextTagStart = afterTag.search(/<(node|edge|group|\/node|\/group)/);
				const rawContent = nextTagStart === -1 
					? afterTag.trim() 
					: afterTag.substring(0, nextTagStart).trim();
				
				// Apply sanitization to remove trailing partial tags (fixes tag leaking bug)
				const content = this.sanitizeContent(rawContent);
				
				const node: NodeXML = {
					id,
					type,
					title,
					row,
					col,
					content,
				};

				// Check if this node is inside a group
				const beforeNode = this.buffer.substring(0, this.processedLength + startPos);
				const openGroupMatch = beforeNode.match(/<group\s+([^>]+)>/g);
				const openGroupCount = (openGroupMatch || []).length;
				const closeGroupCount = (beforeNode.match(/<\/group>/g) || []).length;

				if (openGroupCount > closeGroupCount) {
					const lastOpenGroup = openGroupMatch![openGroupMatch!.length - 1];
					const groupIdMatch = lastOpenGroup.match(/id="([^"]+)"/);
					if (groupIdMatch) {
						node.groupId = groupIdMatch[1];
					}
				}
				
				nodes.push(node);
			} catch (error) {
				// Silently ignore partial parse errors
			}
		}
		
		return nodes;
	}
	
	/**
	 * Detect and extract complete <group> elements with nested nodes
	 */
	public detectCompleteGroups(): GroupXML[] {
		const groups: GroupXML[] = [];
		
		// Match <group...>...</group> including nested content
		const detected = this.detectCompleteElements(
			/<group\s+[^>]*>[\s\S]*?<\/group>/g
		);
		
		for (const elem of detected) {
			try {
				const group = this.parseGroupElement(elem.xml);
				groups.push(group);
				
				// Mark as processed
				if (elem.end > this.processedLength) {
					this.processedLength = elem.end;
				}
			} catch (error) {
				console.warn("[IncrementalXMLParser] Failed to parse group:", error);
			}
		}
		
		return groups;
	}

	/**
	 * Detect and extract incomplete <group> elements
	 */
	public detectIncompleteGroups(): GroupXML[] {
		const groups: GroupXML[] = [];
		const unprocessed = this.getUnprocessedContent();
		
		const groupStartRegex = /<group\s+([^>]+)>/g;
		let match: RegExpExecArray | null;
		
		while ((match = groupStartRegex.exec(unprocessed)) !== null) {
			const tagContent = match[1];
			const startPos = match.index;
			const afterTag = unprocessed.substring(startPos + match[0].length);
			
			if (afterTag.includes("</group>")) {
				continue;
			}
			
			try {
				const idMatch = tagContent.match(/id="([^"]+)"/);
				if (!idMatch) continue;
				const id = idMatch[1];
				
				const titleMatch = tagContent.match(/title="([^"]+)"/);
				const title = titleMatch ? titleMatch[1] : "Untitled Group";
				
				const rowMatch = tagContent.match(/row="([^"]+)"/);
				const colMatch = tagContent.match(/col="([^"]+)"/);
				const row = rowMatch ? parseInt(rowMatch[1], 10) : 0;
				const col = colMatch ? parseInt(colMatch[1], 10) : 0;
				
				groups.push({
					id,
					title,
					row,
					col,
					nodes: [], // Partial groups don't have nodes yet
				});
			} catch (error) {
				// Ignore
			}
		}
		
		return groups;
	}
	
	/**
	 * Detect and extract complete <edge> elements (self-closing or empty)
	 */
	public detectCompleteEdges(): EdgeXML[] {
		const edges: EdgeXML[] = [];
		
		// Match both self-closing and empty edge tags
		// <edge ... /> or <edge ...></edge>
		const detected = this.detectCompleteElements(
			/<edge\s+[^>]*(?:\/>|><\/edge>)/g
		);
		
		for (const elem of detected) {
			try {
				const edge = this.parseEdgeElement(elem.xml);
				edges.push(edge);
				
				// Mark as processed
				if (elem.end > this.processedLength) {
					this.processedLength = elem.end;
				}
			} catch (error) {
				console.warn("[IncrementalXMLParser] Failed to parse edge:", error);
			}
		}
		
		return edges;
	}
	
	/**
	 * Generic method to detect complete elements using regex
	 * Only returns elements that haven't been processed yet
	 */
	private detectCompleteElements(regex: RegExp): DetectedElement[] {
		const results: DetectedElement[] = [];
		
		// Start searching from processedLength
		regex.lastIndex = 0;
		
		let match: RegExpExecArray | null;
		while ((match = regex.exec(this.buffer)) !== null) {
			// Only include elements that start after processedLength
			if (match.index >= this.processedLength) {
				results.push({
					start: match.index,
					end: regex.lastIndex,
					xml: match[0]
				});
			}
		}
		
		return results;
	}
	
	/**
	 * Parse a <node> XML string into NodeXML object
	 */
	private parseNodeElement(xml: string): NodeXML {
		// Use DOMParser to parse the XML
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, "text/xml");
		
		const nodeElement = doc.querySelector("node");
		if (!nodeElement) {
			throw new Error("No node element found");
		}
		
		// Extract attributes
		const id = nodeElement.getAttribute("id");
		if (!id) {
			throw new Error("Node missing required 'id' attribute");
		}
		
		const typeStr = nodeElement.getAttribute("type") || "default";
		const type = this.parseNodeType(typeStr);
		
		const title = nodeElement.getAttribute("title") || undefined;
		
		const rowStr = nodeElement.getAttribute("row");
		const colStr = nodeElement.getAttribute("col");
		
		if (rowStr === null || colStr === null) {
			throw new Error(`Node ${id} missing 'row' or 'col' attribute`);
		}
		
		const row = parseInt(rowStr, 10);
		const col = parseInt(colStr, 10);
		
		if (isNaN(row) || isNaN(col)) {
			throw new Error(`Node ${id} has invalid row/col values`);
		}
		
		// Extract content
		const content = nodeElement.textContent?.trim() || "";
		
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
	 * Parse a <group> XML string into GroupXML object
	 */
	private parseGroupElement(xml: string): GroupXML {
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, "text/xml");
		
		const groupElement = doc.querySelector("group");
		if (!groupElement) {
			throw new Error("No group element found");
		}
		
		const id = groupElement.getAttribute("id");
		if (!id) {
			throw new Error("Group missing required 'id' attribute");
		}
		
		const title = groupElement.getAttribute("title") || "Untitled Group";
		
		const rowStr = groupElement.getAttribute("row");
		const colStr = groupElement.getAttribute("col");
		
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
		const nodeElements = groupElement.querySelectorAll(":scope > node");
		
		nodeElements.forEach((nodeElement) => {
			try {
				const nodeXML = this.parseNodeElementFromDOM(nodeElement as Element);
				nodes.push(nodeXML);
			} catch (error) {
				console.warn("[IncrementalXMLParser] Failed to parse nested node:", error);
			}
		});
		
		return {
			id,
			title,
			row,
			col,
			nodes,
		};
	}
	
	/**
	 * Parse a node element from DOM Element
	 */
	private parseNodeElementFromDOM(element: Element): NodeXML {
		const id = element.getAttribute("id");
		if (!id) {
			throw new Error("Node missing required 'id' attribute");
		}
		
		const typeStr = element.getAttribute("type") || "default";
		const type = this.parseNodeType(typeStr);
		
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
	 * Parse an <edge> XML string into EdgeXML object
	 */
	private parseEdgeElement(xml: string): EdgeXML {
		const parser = new DOMParser();
		const doc = parser.parseFromString(xml, "text/xml");
		
		const edgeElement = doc.querySelector("edge");
		if (!edgeElement) {
			throw new Error("No edge element found");
		}
		
		const from = edgeElement.getAttribute("from");
		const to = edgeElement.getAttribute("to");
		
		if (!from || !to) {
			throw new Error("Edge missing required 'from' or 'to' attribute");
		}
		
		const dirStr = edgeElement.getAttribute("dir") || "forward";
		const dir = this.parseEdgeDirection(dirStr);
		
		const label = edgeElement.getAttribute("label") || undefined;
		
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
	private parseNodeType(typeStr: string): NodeType {
		const normalized = typeStr.toLowerCase();
		
		if (isValidNodeType(normalized)) {
			return normalized as NodeType;
		}
		
		console.warn(`[IncrementalXMLParser] Invalid node type "${typeStr}", using "default"`);
		return "default";
	}
	
	/**
	 * Parse and validate edge direction
	 */
	private parseEdgeDirection(dirStr: string): "forward" | "bi" | "none" {
		const normalized = dirStr.toLowerCase();
		
		if (normalized === "forward" || normalized === "bi" || normalized === "none") {
			return normalized;
		}
		
		console.warn(`[IncrementalXMLParser] Invalid edge direction "${dirStr}", using "forward"`);
		return "forward";
	}
}


