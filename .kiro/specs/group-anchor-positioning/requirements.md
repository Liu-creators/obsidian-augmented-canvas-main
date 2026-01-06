# Requirements Document

## Introduction

This document specifies the requirements for fixing the "layout jumping" issue in the streaming canvas mind map application. When AI generates nodes with `row`/`col` grid coordinates, the layout engine incorrectly treats these as absolute positions instead of relative to the pre-created placeholder group, causing a visual "teleport" effect where the entire group jumps from its placeholder location to a calculated grid origin.

## Glossary

- **Canvas**: The visual workspace where nodes and groups are displayed
- **Node**: A text element on the canvas containing content
- **Group**: A container element that visually groups multiple nodes together
- **Placeholder_Group**: The initial empty group created at the user's click location before AI streaming begins
- **Grid_Coordinate**: A logical position using `row` and `col` attributes (relative layout)
- **Pixel_Coordinate**: An absolute position using `x` and `y` values on the canvas
- **Anchor_Point**: The fixed reference position (top-left of the Placeholder_Group) used for all relative calculations
- **StreamingNodeCreator**: The component responsible for creating nodes during AI response streaming
- **Cell_Width**: The width of a single grid cell (node width + gap)
- **Cell_Height**: The height of a single grid cell (node height + gap)

## Requirements

### Requirement 1: Anchor Point Preservation

**User Story:** As a user, I want the generated group to remain at the location where I initiated the generation, so that the visual layout is predictable and stable.

#### Acceptance Criteria

1. WHEN a Placeholder_Group is created at position (X, Y), THE StreamingNodeCreator SHALL preserve this position as the Anchor_Point throughout the entire streaming process
2. WHEN AI response streaming begins, THE StreamingNodeCreator SHALL NOT modify the Placeholder_Group's x or y coordinates based on incoming Grid_Coordinates
3. WHEN the streaming completes, THE Placeholder_Group SHALL remain at its original (X, Y) position (within a tolerance of 2 pixels for bounds adjustment)

### Requirement 2: Relative Node Positioning Within Group

**User Story:** As a user, I want nodes generated inside a group to be positioned relative to the group's location, so that the internal layout is consistent regardless of where the group is placed.

#### Acceptance Criteria

1. WHEN a node with Grid_Coordinate (row, col) is created inside a pre-created group, THE StreamingNodeCreator SHALL calculate its Pixel_Coordinate as: `Node.X = Anchor_Point.X + Padding + (col * Cell_Width)` and `Node.Y = Anchor_Point.Y + Padding + (row * Cell_Height)`
2. WHEN a node has negative Grid_Coordinates (e.g., row=-1, col=-1), THE StreamingNodeCreator SHALL position it above/left of the group's padded origin
3. WHEN multiple nodes stream in sequentially, THE StreamingNodeCreator SHALL position each node relative to the same Anchor_Point without shifting previously created nodes

### Requirement 3: Group Bounds Dynamic Expansion

**User Story:** As a user, I want the group container to automatically expand to fit all generated nodes, so that no content is clipped or hidden.

#### Acceptance Criteria

1. WHEN a new node is added that extends beyond the current group bounds, THE StreamingNodeCreator SHALL expand the group dimensions to include the node plus padding
2. WHEN expanding group bounds, THE StreamingNodeCreator SHALL only modify width and height, NOT the anchor position (x, y) unless nodes have negative coordinates
3. IF nodes have negative Grid_Coordinates, THEN THE StreamingNodeCreator SHALL expand the group upward/leftward while maintaining the relative positions of all existing nodes

### Requirement 4: Edge Connection Stability

**User Story:** As a user, I want the connection edge from the source node to the group to remain stable during streaming, so that the visual relationship is clear and doesn't stretch or jump.

#### Acceptance Criteria

1. WHEN the main edge connects source node to Placeholder_Group, THE edge endpoint on the group side SHALL remain attached to the group's boundary
2. WHEN the group bounds expand, THE edge connection point SHALL adjust smoothly to the new boundary position
3. THE edge SHALL NOT exhibit visual "stretching" or "teleporting" during the streaming process

### Requirement 5: Streaming Performance

**User Story:** As a user, I want nodes to appear smoothly during streaming without visual glitches, so that I can follow the AI's response in real-time.

#### Acceptance Criteria

1. WHEN nodes stream in, THE StreamingNodeCreator SHALL render each node at its calculated position within 50ms of receiving the complete node data
2. WHEN updating partial node content, THE StreamingNodeCreator SHALL NOT recalculate or change the node's position
3. WHEN the group bounds update, THE canvas SHALL re-render within one animation frame (requestFrame)
