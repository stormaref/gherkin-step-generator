# Gherkin Step Generator

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/ArefAzizian.gherkin-step-generator.svg)](https://marketplace.visualstudio.com/items?itemName=ArefAzizian.gherkin-step-generator)

Generate Go [godog](https://github.com/cucumber/godog) step bindings automatically from Gherkin `.feature` files. This extension streamlines the process of creating Go test files with step definitions from your Cucumber/Gherkin feature files.

## Features

- **Automatic Test File Generation**: Automatically generates Go test files with godog step bindings when you save `.feature` files
- **Smart Step Pattern Matching**: Converts Gherkin steps into Go regex patterns with parameter placeholders
- **Handler Function Naming**: Automatically converts step descriptions into camelCase handler function names
- **Live Updates**: Updates existing test files when feature files change, preserving your custom code
- **File Organization**: Creates test files following Go naming conventions (`*_feature_test.go`)

### What it does:

1. **Watches for `.feature` file saves** and automatically processes them
2. **Extracts scenarios and steps** from your Gherkin feature files
3. **Generates Go test files** with:
   - Proper package structure
   - godog test suite setup
   - Step binding patterns with parameter capture groups
   - Handler function placeholders
4. **Updates existing files** by regenerating the `InitializeScenario` function while preserving your implementation code

### Example

Given a feature file `features/login.feature`:

```gherkin
Feature: User Login
  Scenario: Successful login
    Given I am on the login page
    When I enter username "$username" and password "$password"
    Then I should see the dashboard
```

The extension generates `login_feature_test.go`:

```go
package login_feature_test

import (
	"testing"
	"github.com/cucumber/godog"
)

func TestLoginFeature(t *testing.T) {
	suite := godog.TestSuite{
		ScenarioInitializer: InitializeScenario,
		Options: &godog.Options{
			TestingT: t,
			Paths:    []string{"features/login.feature"},
			Format:   "pretty",
			Strict:   true,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("non-zero status returned, failed to run feature tests")
	}
}

func InitializeScenario(ctx *godog.ScenarioContext) {
	tctx := InitializeVariables()
	// Scenario: Successful login
	ctx.Step(`^I am on the login page$`, tctx.IAmOnTheLoginPage)
	ctx.Step(`^I enter username "([^"]+)" and password "([^"]+)"$`, tctx.IEnterUsernameAndPassword)
	ctx.Step(`^I should see the dashboard$`, tctx.IShouldSeeTheDashboard)
}
```

## Requirements

- **VS Code**: Version 1.101.0 or higher
- **Go**: For running the generated test files
- **godog**: The Go BDD framework
  ```bash
  go get github.com/cucumber/godog/cmd/godog
  ```

## Usage

1. **Create or open** a `.feature` file in your workspace
2. **Write your Gherkin scenarios** using standard Given/When/Then syntax
3. **Save the file** (Ctrl+S / Cmd+S)
4. The extension will automatically:
   - Create a corresponding `*_feature_test.go` file in the parent directory
   - Generate step bindings for all scenarios
   - Show progress in the "Gherkin Step Generator" output channel

### File Structure

The extension expects and creates the following structure:

```
your-project/
├── features/
│   └── login.feature
├── login_feature_test.go  # Generated automatically
└── other-files...
```

### Parameter Placeholders

Use `$variableName` in your steps for parameters:

```gherkin
When I enter "$username" and "$password"
```

This generates:
```go
ctx.Step(`^I enter "([^"]+)" and "([^"]+)"$`, tctx.IEnterAndPassword)
```

## Extension Settings

This extension doesn't contribute any VS Code settings at this time. It works automatically when you save `.feature` files.

## Output Channel

Monitor the extension's activity in the **"Gherkin Step Generator"** output channel:
- File creation confirmations
- Update notifications
- Error messages and warnings

## Tips

- **Implement the handler functions**: After generation, implement the `tctx.*` handler functions in your test context
- **Preserve custom code**: The extension only updates the `InitializeScenario` function, leaving your implementations intact
- **Use descriptive step names**: Clear step descriptions result in better handler function names

## Known Issues

- The extension assumes a specific project structure (features in subdirectory)
- Parameter placeholders must use the `$variableName` format
- Complex Gherkin features with tables or doc strings require manual step pattern adjustments

## Contributing

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/stormaref/gherkin-step-generator).

**Enjoy streamlined BDD development with Go and godog!** 🥒