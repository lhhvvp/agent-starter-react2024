# Claude MD Review Workflow Documentation

## Overview

The `claude-md-review.yml` workflow provides automated, comprehensive analysis of your codebase to generate and maintain an accurate `CLAUDE.md` file. This workflow uses Claude Code to perform deep codebase analysis and ensure the guidance file remains current with your project's architecture.

## Purpose

- **Automated Accuracy**: Keeps CLAUDE.md synchronized with actual codebase state
- **Comprehensive Analysis**: Reviews all project components, dependencies, and configurations
- **Quality Assurance**: Validates generated content for accuracy and completeness
- **Maintenance Automation**: Reduces manual effort in maintaining project documentation

## Workflow Features

### Manual Trigger with Options
- **Branch Name**: Customize the branch for changes (default: `update-claude-md`)
- **PR Creation**: Choose whether to create a pull request automatically
- **Analysis Depth**: Select from `basic`, `comprehensive`, or `deep` analysis levels
- **Section Preservation**: Option to preserve accurate existing sections

### Comprehensive Analysis Process
1. **Project Structure**: Complete directory and file organization analysis
2. **Component Architecture**: React component hierarchy and data flow mapping
3. **API Integration**: Backend routes and external service documentation
4. **Configuration Review**: All config files and environment requirements
5. **Dependency Analysis**: Complete package.json and library usage review
6. **Development Workflow**: Scripts, commands, and tooling documentation

### Safety Features
- **Backup Creation**: Automatic backup of existing CLAUDE.md
- **Change Validation**: Content verification and quality checks
- **Diff Comparison**: Detailed analysis of what changed
- **Rollback Capability**: Easy restoration if needed

## Usage Instructions

### Quick Start

1. Navigate to your repository's Actions tab
2. Find "CLAUDE.md Review and Update" workflow
3. Click "Run workflow"
4. Choose your options or use defaults
5. Click "Run workflow" to start

### Manual Trigger Options

```yaml
# Default usage (recommended)
Analysis Depth: comprehensive
Branch Name: update-claude-md  
Create PR: true
Preserve Sections: true
```

### Analysis Depth Levels

#### Basic
- Core project structure
- Main components and configuration
- Essential dependencies and scripts
- Suitable for: Quick updates, minor changes

#### Comprehensive (Recommended)
- Complete project architecture analysis
- All components and their relationships
- Full dependency and configuration review
- Development workflow documentation
- Suitable for: Regular maintenance, major updates

#### Deep
- Maximum detail analysis
- Performance patterns and optimizations
- Advanced configuration options
- Complex integration documentation
- Suitable for: Complete rewrites, major architectural changes

## Prerequisites

### Required Secrets
Your repository must have the following secret configured:

```
CLAUDE_CODE_OAUTH_TOKEN
```

This token provides authentication for the Claude Code action. You can obtain it from your Claude Code settings.

### Required Permissions
The workflow requires these GitHub permissions:
- `contents: write` - To create/modify files
- `pull-requests: write` - To create pull requests  
- `actions: read` - To access workflow information
- `id-token: write` - For secure authentication

## Workflow Outputs

### Generated Files
- **CLAUDE.md**: Updated project documentation file
- **Change Summary**: Detailed comparison with previous version (if available)

### Branch Management
- Creates/updates specified branch with changes
- Force-pushes with lease protection to prevent conflicts
- Maintains clean git history

### Pull Request Creation
Automatically creates/updates PR with:
- Descriptive title and comprehensive body
- Analysis details and validation checklist
- Change overview and verification steps
- Links to specific sections that were updated

## Validation and Quality Assurance

### Content Validation
- ✅ File existence and minimum content requirements
- ✅ Essential section presence verification
- ✅ File path and command accuracy checks
- ✅ Dependency and configuration validation

### Change Analysis
- Line count comparisons
- Detailed diff generation
- Section-by-section change tracking
- Accuracy verification against actual codebase

## Error Handling and Recovery

### Automatic Recovery
- Backup restoration on failure
- Branch cleanup on error
- Detailed error logging and reporting

### Manual Recovery
If the workflow fails:

1. **Check the workflow logs** for specific error details
2. **Verify the token** has correct permissions
3. **Manually run validation** using the generated prompt
4. **Restore from backup** if needed: `cp CLAUDE.md.backup CLAUDE.md`

## Customization

### Custom Analysis Prompts
The workflow generates a comprehensive analysis prompt automatically, but you can customize it by:

1. Modifying the prompt generation step
2. Adding specific instructions for your project type
3. Including additional validation requirements

### Integration with CI/CD
Consider integrating this workflow with:
- **Scheduled runs**: Monthly or quarterly updates
- **Release triggers**: Update documentation before releases  
- **Dependency updates**: Refresh when dependencies change

## Best Practices

### When to Run
- **After major feature additions** or architectural changes
- **Before important releases** to ensure documentation accuracy
- **When onboarding new team members** to verify setup instructions
- **Periodically** (monthly/quarterly) for maintenance

### Review Process
1. **Always review the generated PR** before merging
2. **Validate key sections** match your understanding
3. **Test documented commands** to ensure they work
4. **Check file paths** mentioned in the documentation

### Maintenance Tips
- Run with `comprehensive` analysis level for best results
- Use `preserve_sections: true` to maintain custom additions
- Create custom branch names for specific update types
- Review and merge PRs promptly to keep documentation current

## Troubleshooting

### Common Issues

#### Token Authentication
```
Error: Authentication failed
```
**Solution**: Verify `CLAUDE_CODE_OAUTH_TOKEN` secret is set correctly

#### Analysis Timeout
```
Error: Workflow timed out
```
**Solution**: Use `basic` analysis depth for large codebases

#### Missing Sections
```
Warning: Missing essential sections
```
**Solution**: Re-run with `deep` analysis or manually add missing sections

#### Permission Errors
```
Error: Permission denied
```
**Solution**: Check repository permissions and workflow permissions settings

## Support and Feedback

For issues with the workflow:
1. Check the Actions tab for detailed logs
2. Review this documentation for configuration options
3. Test with different analysis depth levels
4. Verify all prerequisites are met

The workflow is designed to be robust and self-recovering, with extensive logging to help diagnose any issues that arise.