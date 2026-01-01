# Changelog | 更新日志

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.16] - 2025-01-02

### Changed | 变更

- **[BREAKING]** Migrated from OpenAI to DeepSeek API
  - 从 OpenAI 迁移到 DeepSeek API
- Removed image generation feature (DeepSeek does not support it)
  - 移除图像生成功能（DeepSeek 不支持）
- Removed YouTube captions feature
  - 移除 YouTube 字幕功能
- Removed website content scraping feature
  - 移除网站内容抓取功能

### Improved | 改进

- Restructured project directories for better organization
  - 重构项目目录结构，更好的组织方式
- Split actions into separate modules (canvas, commands, contextMenu)
  - 将 actions 拆分为独立模块（canvas、commands、contextMenu）
- Improved TypeScript type definitions
  - 改进 TypeScript 类型定义
- Added ESLint configuration for code quality
  - 添加 ESLint 配置以提升代码质量
- Optimized build configuration
  - 优化构建配置
- Cleaned up commented and unused code
  - 清理注释和未使用的代码
- Removed duplicate lock files (yarn, pnpm), standardized on npm
  - 移除重复的锁文件（yarn、pnpm），统一使用 npm

### Added | 新增

- Bilingual README (English and Chinese)
  - 双语 README（英文和中文）
- Contributing guidelines
  - 贡献指南
- Enhanced documentation and code comments
  - 增强的文档和代码注释
- JSDoc comments for better code understanding
  - JSDoc 注释以更好理解代码

### Fixed | 修复

- Improved error handling in AI interactions
  - 改进 AI 交互中的错误处理
- Fixed type safety issues
  - 修复类型安全问题

## [0.1.15] - Previous versions

See git history for previous changes.
查看 git 历史以了解之前的更改。

---

## Legend | 图例

- `Added` | `新增` - New features
- `Changed` | `变更` - Changes in existing functionality
- `Deprecated` | `弃用` - Soon-to-be removed features
- `Removed` | `移除` - Removed features
- `Fixed` | `修复` - Bug fixes
- `Security` | `安全` - Security fixes

