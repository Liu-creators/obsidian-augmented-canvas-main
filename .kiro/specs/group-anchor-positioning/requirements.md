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
- **Actual_Height**: The rendered height of a node based on its content (may exceed default height)
- **Actual_Width**: The rendered width of a node based on its content (may exceed default width)
- **VERTICAL_GAP**: The minimum vertical spacing between nodes in the same column (default: 40px)
- **HORIZONTAL_GAP**: The minimum horizontal spacing between adjacent columns (default: 40px)
- **EDGE_LABEL_SAFE_ZONE**: Additional margin to prevent group content from overlapping edge labels (default: 40px)
- **Column_Track**: A data structure tracking all nodes in a specific column and their cumulative heights
- **Row_Track**: A data structure tracking all nodes in a specific row and their cumulative widths
- **Reflow**: The process of recalculating and updating node positions when content changes cause height/width changes
- **Height_Delta**: The difference between a node's previous height and its new height after content growth
- **Animation_Frame**: A single rendering cycle (typically 16.67ms at 60fps) used to batch visual updates

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

### Requirement 6: Dynamic Vertical Stack Layout

**User Story:** As a user, I want nodes in the same column to stack vertically without overlapping, so that all content remains readable as text expands during streaming.

#### Acceptance Criteria

1. WHEN calculating the Y-position of a node at row N, THE StreamingNodeCreator SHALL use the formula: `Node[N].y = Node[N-1].y + Node[N-1].actualHeight + VERTICAL_GAP` instead of a fixed grid height
2. WHEN a node's content grows during streaming, THE StreamingNodeCreator SHALL recalculate and reposition all nodes below it in the same column
3. WHEN multiple nodes exist in the same column, THE StreamingNodeCreator SHALL maintain a minimum vertical gap (VERTICAL_GAP) between each node's bottom edge and the next node's top edge
4. THE StreamingNodeCreator SHALL track the actual rendered height of each node for position calculations

### Requirement 7: Edge Label Safe Zone

**User Story:** As a user, I want the edge label connecting the source node to the group to remain visible and readable, so that I can see my question/instruction clearly.

#### Acceptance Criteria

1. WHEN positioning the first row of nodes inside a group, THE StreamingNodeCreator SHALL add an additional top margin (EDGE_LABEL_SAFE_ZONE) to prevent overlap with the incoming edge label
2. WHEN the main edge connects from the left side of the group, THE StreamingNodeCreator SHALL add a left margin safe zone for the edge label
3. WHEN the main edge connects from the top side of the group, THE StreamingNodeCreator SHALL add a top margin safe zone for the edge label
4. THE EDGE_LABEL_SAFE_ZONE SHALL be at least 40 pixels to accommodate typical edge label text

### Requirement 8: Horizontal Column Spacing

**User Story:** As a user, I want nodes in adjacent columns to have sufficient horizontal spacing, so that wide content doesn't cause columns to overlap.

#### Acceptance Criteria

1. WHEN calculating the X-position of a node at column N, THE StreamingNodeCreator SHALL use the formula: `Node[col=N].x = max(Node[col=N-1].x + Node[col=N-1].actualWidth) + HORIZONTAL_GAP` for all nodes in column N-1
2. WHEN a node's content causes it to exceed its default width, THE StreamingNodeCreator SHALL track the actual width for column spacing calculations
3. WHEN multiple nodes exist in the same column, THE StreamingNodeCreator SHALL use the maximum width of all nodes in that column for spacing calculations
4. THE StreamingNodeCreator SHALL maintain a minimum horizontal gap (HORIZONTAL_GAP) between the rightmost edge of column N-1 and the leftmost edge of column N

### Requirement 9: Anchor Stabilization During Streaming

**User Story:** As a user, I want the group to remain visually stable during streaming, so that I can follow the AI's response without visual distraction from jittering or jumping.

#### Acceptance Criteria

1. WHEN the Group is created, THE StreamingNodeCreator SHALL lock the Group's top-left coordinate (Anchor_Point) and NOT modify it during streaming
2. WHILE text is streaming into nodes, THE StreamingNodeCreator SHALL NOT attempt to re-center or re-align the Group with the Parent Node
3. WHEN a node's content grows, THE Group SHALL expand downward and/or rightward only, preserving the Anchor_Point
4. THE StreamingNodeCreator SHALL NOT recalculate the Group's x or y position based on content changes during streaming
5. WHEN streaming completes, THE StreamingNodeCreator MAY optionally perform a final alignment adjustment if configured

### Requirement 10: Real-Time Reflow on Content Growth

**User Story:** As a user, I want nodes to automatically reposition when content above them grows, so that text remains readable without manual intervention.

#### Acceptance Criteria

1. WHEN a node's text content grows during streaming, THE StreamingNodeCreator SHALL immediately recalculate the actual rendered height of that node
2. WHEN a node's height increases, THE StreamingNodeCreator SHALL immediately push down all nodes below it in the same column by the height delta
3. THE StreamingNodeCreator SHALL NOT use fixed grid coordinates for Y-positioning; instead it SHALL accumulate actual heights
4. WHEN repositioning nodes, THE StreamingNodeCreator SHALL update positions within a single animation frame to prevent visual stuttering
5. THE StreamingNodeCreator SHALL batch multiple height changes within the same frame to minimize reflow operations

### Requirement 11: Node Visual Clarity

**User Story:** As a user, I want nodes to have solid backgrounds and clear boundaries, so that even if nodes are close together, the text remains readable.

#### Acceptance Criteria

1. THE StreamingNodeCreator SHALL ensure all created nodes have a solid background color
2. WHEN nodes are positioned, THE StreamingNodeCreator SHALL maintain the minimum VERTICAL_GAP (40px) between nodes to ensure readability
3. IF nodes would overlap due to calculation errors, THE StreamingNodeCreator SHALL detect and correct the overlap before rendering
