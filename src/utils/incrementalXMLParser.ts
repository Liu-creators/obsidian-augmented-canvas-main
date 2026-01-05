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
		
		// Detect flat nodes (not inside groups)
		// Use a regex that matches <node...>...</node> but not inside <group>
		const detected = this.detectCompleteElements(
			/<node\s+[^>]*>[\s\S]*?<\/node>/g
		);
		
		for (const elem of detected) {
			// Check if this node is inside a group by looking backwards
			const beforeNode = this.buffer.substring(0, elem.start);
			const openGroupCount = (beforeNode.match(/<group\s+[^>]*>/g) || []).length;
			const closeGroupCount = (beforeNode.match(/<\/group>/g) || []).length;
			
			// If we're inside a group, skip this node (it will be parsed with the group)
			if (openGroupCount > closeGroupCount) {
				continue;
			}
			
			try {
				const node = this.parseNodeElement(elem.xml);
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


