/**
 * XML Schema Type Definitions for AI Canvas v2.0
 * Based on PRD v2.0 Section 2
 */

import { NodeType } from "../utils/typeMapping";

/**
 * Node XML element
 * Represents a single canvas node with content
 */
export interface NodeXML {
	/** Semantic ID (e.g., "sem_id", "n1") */
	id: string;
	
	/** Node type for color mapping */
	type: NodeType;
	
	/** Optional title (displayed as header) */
	title?: string;
	
	/** Grid row position (relative to parent) */
	row: number;
	
	/** Grid column position (relative to parent) */
	col: number;
	
	/** Markdown content */
	content: string;

	/** Optional: Group ID if this node belongs to a group */
	groupId?: string;
}

/**
 * Group XML element
 * Container that wraps multiple nodes
 */
export interface GroupXML {
	/** Group ID */
	id: string;
	
	/** Group title/label */
	title: string;
	
	/** Grid row position (relative to source) */
	row: number;
	
	/** Grid column position (relative to source) */
	col: number;
	
	/** Child nodes inside group */
	nodes: NodeXML[];
}

/**
 * Member XML element (for Smart Grouping)
 * References an existing node to include in a group
 */
export interface MemberXML {
	/** ID of existing node to include */
	id: string;
}

/**
 * Group with members (Smart Grouping output)
 * Used when wrapping existing nodes
 */
export interface GroupWithMembersXML {
	/** Group ID */
	id: string;
	
	/** Group title/label */
	title: string;
	
	/** Member node IDs */
	members: string[];
}

/**
 * Edge XML element
 * Represents a connection between two nodes
 */
export interface EdgeXML {
	/** Source node ID */
	from: string;
	
	/** Target node ID */
	to: string;
	
	/** Direction: forward (→), bi (↔), none (—) */
	dir: "forward" | "bi" | "none";
	
	/** Optional edge label */
	label?: string;
}

/**
 * Complete parsed AI response
 * Can contain nodes, groups, and edges
 */
export interface ParsedAIResponse {
	/** Flat list of nodes (not wrapped in groups) */
	nodes: NodeXML[];
	
	/** Groups with nested nodes */
	groups: GroupXML[];
	
	/** Groups with member references (for Smart Grouping) */
	groupsWithMembers: GroupWithMembersXML[];
	
	/** Edges/connections */
	edges: EdgeXML[];
}

/**
 * XML parsing options
 */
export interface XMLParseOptions {
	/** Validate IDs are unique */
	validateUniqueIds?: boolean;
	
	/** Strict type checking */
	strictTypes?: boolean;
	
	/** Default node type if missing */
	defaultType?: NodeType;
	
	/** Maximum nesting depth for groups */
	maxDepth?: number;
}

/**
 * XML parsing result with metadata
 */
export interface XMLParseResult {
	/** Successfully parsed response */
	response: ParsedAIResponse;
	
	/** Parsing warnings (non-fatal) */
	warnings: string[];
	
	/** Parsing errors (fatal) */
	errors: string[];
	
	/** Whether parsing was successful */
	success: boolean;
}








