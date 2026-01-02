# Changelog

All notable changes to the Obsidian Augmented Canvas plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
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
