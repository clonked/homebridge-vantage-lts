# Contributing to Homebridge Vantage Controls

Thank you for your interest in contributing to the Homebridge Vantage Controls plugin! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn
- TypeScript knowledge
- Homebridge installation for testing

### Local Development
1. Build the project: `npm run build`
2. Link for development: `npm run dev`
3. Start Homebridge with your config
4. Test your changes

### Code Style
- Use TypeScript for all new code
- Follow ESLint rules: `npm run lint`
- Use meaningful variable and function names
- Add JSDoc comments for public methods
- Keep functions small and focused

## Testing

### Manual Testing
1. Configure your Vantage InFusion controller
2. Update your Homebridge config.json
3. Test device discovery and control
4. Verify real-time updates work
5. Test error conditions

### Automated Testing
- Run linter: `npm run lint`
- Build project: `npm run build`
- Check for TypeScript errors

## Pull Request Process

1. **Update Documentation**: Update README.md if needed
2. **Add Tests**: Include tests for new functionality
3. **Update CHANGELOG**: Add entry for your changes
4. **Submit PR**: Create pull request with clear description

### PR Guidelines
- Use descriptive commit messages
- Include context about why changes were made
- Reference any related issues
- Ensure all CI checks pass
- Test on multiple Node.js versions

## Code Review

All contributions require review before merging. Reviewers will check:
- Code quality and style
- Functionality and edge cases
- Documentation updates
- Test coverage
- Performance impact

## Reporting Issues

When reporting issues, please include:
- Homebridge version
- Plugin version
- Node.js version
- Vantage controller model/firmware
- Error logs
- Steps to reproduce
- Expected vs actual behavior

## Feature Requests

For feature requests:
- Describe the use case
- Explain the benefit
- Provide examples if possible
- Consider implementation complexity

## Release Process

1. Update version in package.json
2. Update CHANGELOG.md
3. Create release tag
4. Publish to npm
5. Update GitHub release notes

## Questions?

If you have questions about contributing:
- Check existing issues and discussions
- Create a new issue for questions
- Join the Homebridge community

Thank you for contributing to making this plugin better! 