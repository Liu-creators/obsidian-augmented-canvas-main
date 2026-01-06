# Requirements Document

## Introduction

This document specifies the requirements for fixing the "regenerate" feature when the target of an edge is a Group node instead of a simple text Node. Currently, clicking the regenerate button on an edge pointing to a Group throws a `TypeError: p.setText is not a function` because Groups don't have a `setText()` method. The fix requires making the `generateNote` function polymorphic to handle both Node and Group targets appropriately.

## Glossary

- **Canvas**: The Obsidian canvas view where nodes and edges are displayed
- **Node**: A single text or file element on the canvas that has a `setText()` method
- **Group**: A container element on the canvas that holds multiple child nodes; does not have a `setText()` method
- **Edge**: A connection between two canvas elements (nodes or groups) with an optional label
- **Regenerate**: The action of using an edge's label as a prompt to regenerate the content of the target element
- **Target**: The element (Node or Group) that an edge points to
- **Child_Node**: A Node that is spatially contained within a Group's boundaries
- **Streaming_Response**: The incremental AI response that arrives in chunks during generation

## Requirements

### Requirement 1: Target Type Detection

**User Story:** As a user, I want the regenerate feature to correctly identify whether the target is a Node or a Group, so that the appropriate regeneration logic is applied.

#### Acceptance Criteria

1. WHEN the regenerate action is triggered, THE System SHALL determine if the target element is a Group by checking its type property
2. WHEN the target type is "group", THE System SHALL route to Group regeneration logic
3. WHEN the target type is not "group", THE System SHALL route to Node regeneration logic (existing behavior)

### Requirement 2: Node Regeneration (Existing Behavior)

**User Story:** As a user, I want to regenerate a single Node's content using the edge label as a prompt, so that I can refine individual notes.

#### Acceptance Criteria

1. WHEN the target is a Node, THE System SHALL call the `setText()` method to update the node's content
2. WHEN streaming response chunks arrive for a Node target, THE System SHALL append each chunk to the node's text
3. WHEN the AI response completes for a Node target, THE System SHALL resize the node to fit the final content

### Requirement 3: Group Regeneration

**User Story:** As a user, I want to regenerate a Group's contents using the edge label as a prompt, so that I can regenerate entire concept clusters.

#### Acceptance Criteria

1. WHEN the target is a Group, THE System SHALL NOT call `setText()` on the Group
2. WHEN regenerating a Group, THE System SHALL delete all existing child nodes inside the Group
3. WHEN regenerating a Group, THE System SHALL preserve the Group container's position and dimensions
4. WHEN regenerating a Group, THE System SHALL use the edge label as the AI prompt
5. WHEN the AI streaming response arrives for a Group, THE System SHALL parse the response into multiple nodes using the existing markdown parser
6. WHEN new nodes are parsed from the response, THE System SHALL create them as child nodes inside the existing Group container
7. WHEN connections are specified in the AI response, THE System SHALL create edges between the new child nodes

### Requirement 4: Error Handling

**User Story:** As a user, I want clear feedback when regeneration fails, so that I can understand and resolve issues.

#### Acceptance Criteria

1. IF the regenerate action fails due to missing API key, THEN THE System SHALL display an appropriate notice
2. IF the AI streaming response fails, THEN THE System SHALL display an error notice and preserve the original Group contents
3. IF the target element cannot be determined, THEN THE System SHALL display an error notice without crashing

### Requirement 5: Edge Label as Prompt

**User Story:** As a user, I want the edge label to be used as the regeneration prompt, so that I can control what content is generated.

#### Acceptance Criteria

1. WHEN regenerating any target, THE System SHALL extract the prompt from the edge's label property
2. WHEN the edge has no label, THE System SHALL use the source node's content as context for generation
3. WHEN building messages for AI, THE System SHALL include the edge label as the user prompt
