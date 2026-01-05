# Changelog

All notable changes to the Obsidian Augmented Canvas plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added - Smart Layout System (v2.3)

- **🧠 Spatial-Aware Node Positioning**: Intelligent node placement based on canvas space analysis
  - **Space Analysis Engine**: Multi-factor direction scoring algorithm
    - Distance factor (30%): Considers distance to nearest nodes
    - Density factor (40%): Analyzes region crowding
    - User preference factor (20%): Respects direction priority settings
    - Boundary factor (10%): Avoids canvas edges
  - **4-Direction Analysis**: Evaluates right, down, left, up directions
  - **Smart Collision Avoidance**: Enhanced rectangle collision detection with buffer zones
  - **Visual Density Calculation**: Measures node crowding in specific regions
  - New file: `src/utils/spatialAnalyzer.ts` - Complete spatial analysis module (422 lines)
  - Modified: `src/obsidian/canvas-patches.ts` - Integrated smart positioning into `createNode()`
  - Modified: `src/utils/streamingNodeCreator.ts` - Enhanced with spatial analysis fusion

- **🎯 Layout Preferences System**: Comprehensive user-configurable layout settings
  - **Layout Modes**: Smart adaptive, horizontal, vertical, radial
  - **Direction Priority**: Customizable direction order (default: right → down → left → up)
  - **Spacing Control**: Minimum node spacing (default: 120px, increased from 60px)
  - **Overlap Avoidance**: Configurable collision avoidance strength (0-100)
  - **AI Coordinate Respect**: Toggle to prioritize AI suggestions vs spatial analysis
  - Settings UI: Complete layout preferences panel in Settings Tab
  - Modified: `src/settings/AugmentedCanvasSettings.ts` - Added `LayoutPreferences` interface
  - Modified: `src/settings/SettingsTab.ts` - Added layout preferences UI controls

- **📍 Enhanced Node Positioning**:
  - **Ask AI (Single Node)**: No longer fixed to bottom - intelligently chooses best direction
  - **Generate Group (Multi-Node)**: Fusion of AI coordinate suggestions with spatial analysis
  - **Relationship-Driven + Space-Aware**: Combines semantic relationships with actual canvas space
  - **Real-time Optimization**: Positions adjust dynamically during streaming
  - Modified: `src/actions/canvasNodeMenuActions/noteGenerator.ts` - Passes settings for smart positioning
  - Enhanced: `src/actions/canvas/generateGroup.ts` - Improved system prompt with semantic positioning guidelines

- **🔗 Smart Edge Connection**: Dynamic edge side determination based on node positions
  - **Automatic Edge Sides**: Calculates optimal connection points (right/left/top/bottom)
  - **Position-Based Routing**: Edges connect from nearest sides automatically
  - **Main Edge Redirection**: Correctly updates edge sides when redirecting to first node
  - Prevents edge overlap and visual clutter
  - Modified: `src/obsidian/canvas-patches.ts` - Added `determineEdgeSides()` function
  - Enhanced: `src/utils/streamingNodeCreator.ts` - Updated `redirectMainEdge()` with smart edge routing

- **📏 Dynamic Node Height Adjustment**: Content-aware node sizing
  - **Initial Height Calculation**: Based on actual content instead of fixed minimum (400px)
  - **Final Height Optimization**: Auto-adjusts to fit content after streaming completes
  - **Reasonable Bounds**: Minimum 80px, maximum 1200px (3x original min)
  - **Smooth Resizing**: Only resizes when difference >20px to avoid jitter
  - Eliminates excessive whitespace for short content
  - Modified: `src/actions/canvasNodeMenuActions/noteGenerator.ts` - Enhanced streaming callback with height optimization

- **📐 Increased Default Spacing**: Better visual separation
  - **Default Spacing**: Increased from 60px to 120px (2x improvement)
  - **Edge Label Spacing**: Additional 50px when edge labels present (170px total)
  - **Minimum Guarantee**: Ensures at least 100px spacing even with custom settings
  - Prevents edge line overlap and visual crowding
  - Modified: `src/utils/spatialAnalyzer.ts` - Updated default preferences
  - Modified: `src/settings/AugmentedCanvasSettings.ts` - Increased default spacing

- **📚 Comprehensive Documentation**:
  - `docs/SMART_LAYOUT_TESTING_GUIDE.md` - Complete testing scenarios and validation
  - `docs/SMART_LAYOUT_IMPLEMENTATION_COMPLETE.md` - Full implementation summary
  - Performance metrics, algorithm details, debugging guide

### Added - Organic Growth Layout (v2.2)

- **🌱 Relationship-Driven Layout**: Dynamic node positioning based on edge relationships
  - Nodes positioned near their source nodes instead of fixed grid
  - 4-direction collision avoidance (right, down, left, up)
  - Natural, network-like expansion following relationships
  - Supports linear chains, branching, and complex networks
  - Modified: `src/utils/streamingNodeCreator.ts` - Added relationship tracking and dynamic positioning

- **🔗 Persistent Main Edge**: User question stays visible throughout generation
  - Main edge from source node to first generated node/group
  - Question displayed on edge label
  - Placeholder node automatically removed after first real node appears
  - Edge redirected seamlessly without interrupting generation
  - Modified: `src/actions/canvas/generateGroup.ts` - Main edge capture and redirection

- **⚡ Real-Time Edge Creation**: Connections appear immediately when both nodes exist
  - Edges created during streaming, not batch at end
  - Visual flow shows relationships forming
  - Duplicate edge prevention
  - Pending edges tracked until nodes available
  - Enhanced: `src/obsidian/canvas-patches.ts` - Edge ID tracking

- **🎯 Smart Positioning Algorithm**:
  - Analyzes incoming edges to determine optimal position
  - Tries 4 cardinal directions with priority order
  - Simple rectangle collision detection
  - Vertical offset fallback for complex layouts
  - Configurable node dimensions and gaps

- **📚 Documentation**: `docs/ORGANIC_GROWTH_LAYOUT_COMPLETE.md`
  - Implementation details
  - Flow diagrams
  - Test scenarios
  - Usage guide
  - Performance analysis

### Added - Streaming Display Feature (v2.1)

- **🎬 Real-time Node Creation**: Streaming display for Smart Expand (group generation)
  - Nodes appear incrementally as AI response streams in
  - Typewriter effect preview in placeholder node
  - 5-10x faster perceived performance
  - Immediate visual feedback during generation
  - New file: `src/utils/incrementalXMLParser.ts` - Incremental XML parser
  - New file: `src/utils/streamingNodeCreator.ts` - Streaming node creation manager
  - New class: `IncrementalMarkdownParser` in `src/utils/groupGenerator.ts`
  - Modified: `src/actions/canvas/generateGroup.ts` - Updated streaming callback

- **📊 Progressive Parsing**: 
  - XML format: Detects complete `<node>`, `<group>`, `<edge>` tags as they close
  - Markdown format: Detects complete nodes at `---[NODE]---` separators
  - Nodes created immediately when parsing completes
  - Preview throttled to 100ms for optimal performance
  - Shows last 500 characters of accumulated response

- **🎨 Streaming Enhancements**:
  - Grid-based positioning applied in real-time
  - Type-based coloring applied as nodes are created
  - Groups with nested nodes created progressively
  - Edges stored during streaming, created after all nodes complete
  - Canvas frame synchronization for smooth visual updates

- **📚 Documentation**: `docs/STREAMING_DISPLAY_IMPLEMENTATION.md`
  - Complete technical guide
  - Architecture diagrams
  - Performance metrics
  - Debugging guide
  - Usage examples

### Added - PRD v2.0 Implementation

- **🎯 XML Protocol Support**: New XML-based communication protocol for AI responses
  - Support for `<node>`, `<group>`, `<edge>`, `<member>` XML elements
  - Automatic format detection (XML vs Markdown)
  - Full backward compatibility with existing Markdown format
  - XML parser with comprehensive error handling (`src/utils/xmlParser.ts`)
  - Type definitions for XML schema (`src/types/xml.d.ts`)

- **🎨 Type-Based Coloring System**: Semantic node types with automatic color mapping
  - 7 node types: default, concept, step, resource, warning, insight, question
  - Color mapping to Obsidian Canvas color codes (red, orange, yellow, green, blue, purple, gray)
  - Type validation and fallback handling (`src/utils/typeMapping.ts`)
  - AI-driven type selection based on content meaning

- **📐 Grid Coordinate System**: Relative positioning using row/column coordinates
  - Grid-to-pixel coordinate conversion
  - Relative positioning to source nodes (0,0 = source)
  - Support for negative coordinates
  - Configurable node width, height, and gap
  - Bounding box calculations (`src/utils/coordinateSystem.ts`)

- **✨ Smart Expand (Enhanced)**: Updated group generation with XML support
  - XML-based system prompt following PRD v2.0 specifications
  - Dual format support (XML and Markdown)
  - Grid-based node placement with type coloring
  - Support for both scattered nodes and grouped layouts
  - AI decides structure based on user instruction
  - Full backward compatibility maintained

- **🔗 Smart Connect**: AI-driven connection creation between existing nodes
  - Select 2+ nodes and provide instruction for connection logic
  - AI analyzes relationships and creates appropriate edges
  - Supports forward, bidirectional, and non-directional connections
  - Edge labels generated based on relationship type
  - Examples: "按时间顺序连线", "Connect by causal relationships"
  - New file: `src/actions/canvas/smartConnect.ts`

- **🗂️ Smart Grouping**: AI-driven grouping of existing scattered nodes
  - Select 2+ nodes and provide categorization instruction
  - AI organizes nodes into logical groups
  - Automatic bounding box calculation to wrap nodes
  - Support for multiple groups in single operation
  - Examples: "按技术栈分类", "Group by priority"
  - New file: `src/actions/canvas/smartGrouping.ts`

- **⚙️ Enhanced Configuration**:
  - `useXMLFormat`: Toggle between XML and Markdown protocols (default: true)
  - `gridNodeWidth`: Node width for grid system (default: 360px)
  - `gridNodeHeight`: Node height for grid system (default: 200px)
  - `gridGap`: Gap between nodes in grid (default: 40px)
  - All existing settings preserved

- **🎛️ Enhanced Menu System**:
  - Multi-node selection support in canvas menu
  - Smart Connect button (appears when 2+ nodes selected)
  - Smart Grouping button (appears when 2+ nodes selected)
  - Context-aware menu display based on selection
  - Updated `src/actions/menuPatches/canvasMenuPatch.ts`

- **💬 Enhanced Modal**:
  - Added `setPlaceholder()` method to `CustomQuestionModal`
  - Custom placeholders for different contexts
  - Better user guidance for each feature

- **📚 Comprehensive Documentation**:
  - `docs/PRD_V2_IMPLEMENTATION.md`: Complete implementation summary
  - API documentation for new modules
  - Usage examples and troubleshooting guide
  - Migration guide for existing users

### Changed - Smart Layout System Updates (v2.3)

- **Enhanced System Prompt**: Improved coordinate guidelines for better AI positioning
  - Added semantic positioning rules (cause-effect, sequential, parallel concepts)
  - Visual balance recommendations for node distribution
  - Smart spacing suggestions for 2-3 nodes vs 4+ nodes
  - Modified: `src/actions/canvas/generateGroup.ts` - Enhanced `SYSTEM_PROMPT_SMART_EXPAND_XML`

- **Increased Default Spacing**: Better visual separation between nodes
  - Default `minNodeSpacing` increased from 60px to 120px
  - Edge label spacing: additional 50px (170px total with labels)
  - Minimum spacing guarantee: 100px floor to prevent overcrowding
  - Modified: `src/utils/spatialAnalyzer.ts`, `src/settings/AugmentedCanvasSettings.ts`

### Fixed - Smart Layout System (v2.3)

- **Edge Connection Issues**: Fixed hardcoded edge sides causing incorrect connections
  - Previously: Always connected bottom → top regardless of node position
  - Now: Dynamically determines connection sides based on actual node positions
  - Supports all 4 directions: right → left, bottom → top, left → right, top → bottom
  - Fixed: `src/obsidian/canvas-patches.ts` - Added `determineEdgeSides()` function
  - Fixed: `src/utils/streamingNodeCreator.ts` - Updated `redirectMainEdge()` to use smart edge routing

- **Excessive Node Height**: Fixed nodes with too much whitespace for short content
  - Previously: Fixed 400px minimum height regardless of content
  - Now: Dynamic height based on actual content (min 80px, max 1200px)
  - Auto-adjusts after streaming completes to optimal size
  - Only resizes when difference >20px to avoid visual jitter
  - Fixed: `src/actions/canvasNodeMenuActions/noteGenerator.ts` - Enhanced height calculation

- **Node Spacing Too Close**: Fixed connection lines overlapping due to insufficient spacing
  - Increased default spacing to prevent edge overlap
  - Added extra spacing for labeled edges
  - Ensures minimum comfortable spacing between nodes

### Changed - PRD v2.0 Updates

- **Smart Expand (generateGroup.ts)**: Enhanced with XML protocol support
  - Added XML system prompt (`SYSTEM_PROMPT_SMART_EXPAND_XML`)
  - Implemented dual format handler (XML and Markdown)
  - Added `handleXMLResponse()` for XML processing with grid coordinates
  - Added `handleMarkdownResponse()` for backward compatibility
  - Type-based coloring applied automatically in XML mode
  
- **Menu System (canvasMenuPatch.ts)**: Multi-node selection support
  - Enhanced to handle 2+ node selections
  - Added `addMultiNodeMenuItems()` function
  - Context-aware menu rendering based on selection size
  
- **Settings**: Extended configuration options
  - Added XML format toggle
  - Added grid coordinate system parameters
  - Maintained full backward compatibility

- **Modal System**: Enhanced user interaction
  - Added `setPlaceholder()` method for custom placeholders
  - Better context-specific guidance

### Added - Previous Features (v0.1.16)

- **Generate Group with AI**: New feature to generate Groups containing multiple nodes in one operation
  - AI generates 3-6 related nodes based on context and user question
  - Smart layout algorithm automatically arranges nodes (horizontal, grid, etc.)
  - Support for two Markdown formats: `###` headers and `---` separators
  - Configurable Group color, node spacing, and padding
  - Single-node fallback when AI generates only one node
  - Full documentation in `docs/GROUP_GENERATION.md`
- New utility module `src/utils/groupGenerator.ts` with core functions:
  - `parseNodesFromMarkdown()`: Parse AI response into multiple nodes
  - `calculateSmartLayout()`: Calculate optimal node positions based on count
  - `createGroupWithNodes()`: Create Group and internal nodes on canvas
- New action module `src/actions/canvas/generateGroup.ts`:
  - `generateGroupWithAI()`: Main function for Group generation workflow
  - `addGenerateGroupButton()`: Add menu button to canvas
  - Custom system prompt for multi-node generation
- Settings for Group generation:
  - `groupGenerationEnabled`: Enable/disable feature (default: true)
  - `defaultGroupColor`: Default Group color (default: "4" green)
  - `groupNodeSpacing`: Spacing between nodes (default: 40px)
  - `groupPadding`: Padding around nodes (default: 60px)
- Test suite in `src/utils/__tests__/groupGenerator.test.ts`
  - Console-based tests for parsing and layout functions
  - Can be run in browser developer console
- **Group (分组) Support**: Added comprehensive support for Group nodes with intelligent content aggregation
  - Automatic detection of Group nodes
  - Coordinate-based algorithm to determine which nodes are within a Group
  - Smart sorting of nodes within Groups (top to bottom, left to right)
  - Nested Groups support with recursive processing
  - Context building that combines all node content within a Group
- New utility module `src/utils/groupUtils.ts` with Group handling functions:
  - `isGroup()`: Check if a node is a Group
  - `isNodeInGroup()`: Check if a node is within a Group's coordinate boundaries
  - `getNodesInGroup()`: Get all nodes within a Group
  - `readGroupContent()`: Read all content from nodes within a Group
  - `getGroupLabel()`: Get the label of a Group
  - `buildGroupContext()`: Build AI-friendly context from Group content
- Documentation: `docs/GROUP_HANDLING.md` explaining the Group handling algorithm

### Changed
- Updated `askQuestion.ts` to handle Group nodes specially
  - Group content is read and included as context for AI
  - Only the user's question is displayed on the edge label (not the full context)
- Modified `noteGenerator.ts` to accept separate `edgeLabel` parameter
  - Allows displaying a short label on the connection line while sending full context to AI
- Updated Canvas type definitions in `canvas-internal.d.ts`
  - Changed `nodes` from array to `Map<string, CanvasNode>` to match actual implementation
  - Added `menu` property
- Fixed import paths to use correct casing for `Modals` folder
- Updated README with Group support information in both English and Chinese

### Fixed
- Fixed "Ask question with AI" feature that was not responding
  - Changed `onClickEvent` to `addEventListener("click")` in modal submit buttons
  - Added `this.inputEl = inputEl` in `InputModal.ts`
  - Fixed parameter passing in `handleCallGPT_Question`
- Fixed canvas.nodes type error by using `Map.values()` iterator
- Fixed file name casing inconsistencies (Modals vs modals)

### Removed
- Image generation feature (not supported by DeepSeek API)
- YouTube captions feature
- Website content scraping feature
- Removed unused dependencies and lock files (pnpm-lock.yaml, yarn.lock)

## [0.1.16] - Previous Release

Initial release with core features:
- Ask AI for specific cards
- Ask questions with AI
- AI generated questions
- Create flashcards
- System prompt management
- DeepSeek API integration
