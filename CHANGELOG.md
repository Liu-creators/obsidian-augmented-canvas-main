# Changelog

All notable changes to the Obsidian Augmented Canvas plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
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
