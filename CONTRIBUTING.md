# Contributing to Obsidian Augmented Canvas | 贡献指南

[English](#english) | [中文](#chinese)

---

<a id="english"></a>

## English

Thank you for your interest in contributing to Obsidian Augmented Canvas! We welcome contributions from the community.

### How to Contribute

#### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yourusername/obsidian-augmented-canvas/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Obsidian version and plugin version
   - Screenshots if applicable

#### Suggesting Features

1. Check existing feature requests
2. Create a new issue with the `enhancement` label
3. Clearly describe the feature and its use case

#### Pull Requests

1. **Fork the repository**

2. **Clone your fork**
   ```bash
   git clone https://github.com/yourusername/obsidian-augmented-canvas.git
   cd obsidian-augmented-canvas
   ```

3. **Create a branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Make your changes**
   - Follow the existing code style
   - Add comments for complex logic
   - Update documentation if needed

6. **Test your changes**
   ```bash
   npm run build
   # Test in Obsidian
   ```

7. **Run linter**
   ```bash
   npm run lint
   npm run lint:fix  # Auto-fix issues
   ```

8. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation
   - `refactor:` for code refactoring
   - `test:` for tests
   - `chore:` for maintenance

9. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then create a Pull Request on GitHub.

### Development Guidelines

#### Code Style

- Use **tabs** for indentation
- Use **double quotes** for strings
- Add semicolons at the end of statements
- Follow existing naming conventions
- Maximum line length: 120 characters

#### TypeScript

- Use strict type checking
- Avoid `any` when possible
- Use `@ts-expect-error` with descriptive comments (minimum 10 characters)

#### Project Structure

```
src/
├── actions/          # Action handlers
│   ├── canvas/       # Canvas operations
│   ├── commands/     # Command palette
│   ├── contextMenu/  # Right-click menu
│   └── menuPatches/  # Menu modifications
├── modals/           # UI dialogs
├── obsidian/         # Obsidian API utilities
├── settings/         # Plugin settings
├── types/            # Type definitions
└── utils/            # Helper functions
```

#### Testing

- Test all features manually in Obsidian
- Test with different Obsidian themes
- Test on different operating systems if possible

#### Documentation

- Update README.md for new features
- Add JSDoc comments for public functions
- Update CHANGELOG.md

### Code Review Process

1. Maintainers will review your PR
2. Address any feedback
3. Once approved, your PR will be merged
4. Your contribution will be credited in the release notes

### Questions?

Feel free to ask questions in:
- GitHub Issues
- GitHub Discussions

Thank you for contributing! 🎉

---

<a id="chinese"></a>

## 中文

感谢您对 Obsidian Augmented Canvas 的贡献！我们欢迎社区的贡献。

### 如何贡献

#### 报告 Bug

1. 在 [Issues](https://github.com/yourusername/obsidian-augmented-canvas/issues) 中检查是否已有相同的 bug 报告
2. 如果没有，创建新 issue 并包含：
   - 清晰的标题和描述
   - 复现步骤
   - 预期行为 vs 实际行为
   - Obsidian 版本和插件版本
   - 截图（如适用）

#### 功能建议

1. 检查现有的功能请求
2. 创建带有 `enhancement` 标签的新 issue
3. 清楚描述功能及其使用场景

#### Pull Request

1. **Fork 仓库**

2. **克隆您的 fork**
   ```bash
   git clone https://github.com/yourusername/obsidian-augmented-canvas.git
   cd obsidian-augmented-canvas
   ```

3. **创建分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **安装依赖**
   ```bash
   npm install
   ```

5. **进行修改**
   - 遵循现有代码风格
   - 为复杂逻辑添加注释
   - 必要时更新文档

6. **测试您的修改**
   ```bash
   npm run build
   # 在 Obsidian 中测试
   ```

7. **运行代码检查**
   ```bash
   npm run lint
   npm run lint:fix  # 自动修复问题
   ```

8. **提交更改**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```

   遵循 [Conventional Commits](https://www.conventionalcommits.org/)：
   - `feat:` 新功能
   - `fix:` Bug 修复
   - `docs:` 文档更新
   - `refactor:` 代码重构
   - `test:` 测试
   - `chore:` 维护

9. **推送并创建 PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   然后在 GitHub 上创建 Pull Request。

### 开发指南

#### 代码风格

- 使用 **tab** 缩进
- 字符串使用 **双引号**
- 语句末尾添加分号
- 遵循现有命名规范
- 最大行长度：120 字符

#### TypeScript

- 使用严格类型检查
- 尽可能避免使用 `any`
- 使用 `@ts-expect-error` 时添加描述性注释（至少 10 个字符）

#### 项目结构

```
src/
├── actions/          # 操作处理器
│   ├── canvas/       # 画布操作
│   ├── commands/     # 命令面板
│   ├── contextMenu/  # 右键菜单
│   └── menuPatches/  # 菜单修改
├── modals/           # UI 对话框
├── obsidian/         # Obsidian API 工具
├── settings/         # 插件设置
├── types/            # 类型定义
└── utils/            # 辅助函数
```

#### 测试

- 在 Obsidian 中手动测试所有功能
- 在不同的 Obsidian 主题下测试
- 如可能，在不同操作系统上测试

#### 文档

- 为新功能更新 README.md
- 为公共函数添加 JSDoc 注释
- 更新 CHANGELOG.md

### 代码审查流程

1. 维护者将审查您的 PR
2. 处理反馈意见
3. 通过审核后，您的 PR 将被合并
4. 您的贡献将在发布说明中获得致谢

### 有问题？

欢迎在以下位置提问：
- GitHub Issues
- GitHub Discussions

感谢您的贡献！🎉

