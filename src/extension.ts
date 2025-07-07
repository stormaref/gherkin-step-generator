import * as vscode from "vscode";
import * as path from "path";

const outputChannel = vscode.window.createOutputChannel(
  "Gherkin Step Generator"
);

export function activate(context: vscode.ExtensionContext) {
  vscode.workspace.onDidSaveTextDocument(async (document) => {
    if (!document.fileName.endsWith(".feature")) {
      return;
    }

    const featurePath = document.uri.fsPath;
    const featureName = path.basename(featurePath, ".feature");
    const outputDir = path.dirname(path.dirname(featurePath)); // ../
    const testFileName = `${featureName}_feature_test.go`;
    const testFilePath = path.join(outputDir, testFileName);
    const testUri = vscode.Uri.file(testFilePath);

    // Extract scenarios
    const text = document.getText();
    const scenarios = extractScenarios(text);
    if (scenarios.length === 0) {
      outputChannel.appendLine(
        `⚠️ No scenarios found in ${featureName}.feature`
      );
      outputChannel.show(true);
      return;
    }

    // Create or rewrite test file
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(testUri);
    } catch {
      // File doesn't exist: generate full test file with all scenarios
      const pkgName = `${featureName}_feature_test`;
      const testFunc = `Test${capitalize(featureName)}Feature`;
      const initFunc = "InitializeScenario";
      const content =
        buildTestFile(pkgName, testFunc, initFunc, featureName) +
        "\n" +
        buildScenarioFunc(initFunc, scenarios);
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(testUri, { overwrite: false });
      edit.insert(testUri, new vscode.Position(0, 0), content);
      await vscode.workspace.applyEdit(edit);
      doc = await vscode.workspace.openTextDocument(testUri);
      await vscode.window.showTextDocument(testUri, { preview: false });
      outputChannel.appendLine(`✅ Created ${testFileName}`);
      outputChannel.show(true);
      return;
    }

    // File exists: rewrite InitializeScenario with all scenarios
    await rewriteInitializeScenario(testUri, scenarios);
    outputChannel.appendLine(
      `✅ Updated InitializeScenario in ${testFileName}`
    );
    outputChannel.show(true);
  });
}

async function rewriteInitializeScenario(
  testUri: vscode.Uri,
  scenarios: Scenario[]
) {
  const doc = await vscode.workspace.openTextDocument(testUri);
  const full = doc.getText();

  // Build new InitializeScenario function including scenario comments
  const newFunc = buildScenarioFunc("InitializeScenario", scenarios);

  const edit = new vscode.WorkspaceEdit();
  const startIdx = full.indexOf("func InitializeScenario");

  if (startIdx === -1) {
    edit.insert(
      testUri,
      new vscode.Position(doc.lineCount, 0),
      "\n" + newFunc + "\n"
    );
  } else {
    // find end of existing function
    let brace = 0;
    let i = full.indexOf("{", startIdx) + 1;
    brace = 1;
    while (i < full.length && brace > 0) {
      if (full[i] === "{") {
        brace++;
      } else if (full[i] === "}") {
        brace--;
      }
      i++;
    }
    const endIdx = i;
    const startPos = doc.positionAt(startIdx);
    const endPos = doc.positionAt(endIdx);
    edit.replace(testUri, new vscode.Range(startPos, endPos), newFunc);
  }
  await vscode.workspace.applyEdit(edit);
  const editor = await vscode.window.showTextDocument(testUri, {
    preview: false,
  });
  await editor.document.save();
}

function buildTestFile(
  pkg: string,
  testFunc: string,
  initFunc: string,
  featureName: string
): string {
  return `package ${pkg}

import (
	"testing"

	"github.com/cucumber/godog"
)

func ${testFunc}(t *testing.T) {
	suite := godog.TestSuite{
		ScenarioInitializer: ${initFunc},
		Options: &godog.Options{
			TestingT: t,
			Paths:    []string{"features/${featureName}.feature"},
			Format:   "pretty",
			Strict:   true,
		},
	}

	if suite.Run() != 0 {
		t.Fatal("non-zero status returned, failed to run feature tests")
	}
}

type TestContext struct {
	// Add any necessary fields here
}

func InitializeVariables() *TestContext {
	return &TestContext{
		// Initialize any necessary fields here
	}
}
`;
}

interface Scenario {
  name: string; // "Background" or scenario name
  steps: string[];
  isBackground?: boolean; // true if it's background
}

function extractScenarios(text: string): Scenario[] {
  const lines = text.split(/\r?\n/);
  const scenarios: Scenario[] = [];
  let current: Scenario | null = null;
  let background: Scenario | null = null;

  const stepRegex = /^\s*(Given|When|Then|And|But)\s+(.+?)\s*$/i;
  const scenarioRegex = /^\s*Scenario:\s*(.+)$/i;
  const backgroundRegex = /^\s*Background:\s*$/i;

  for (const line of lines) {
    if (backgroundRegex.test(line)) {
      if (current) {
        scenarios.push(current);
      }
      background = { name: "Background", steps: [], isBackground: true };
      current = background;
    } else {
      const sm = line.match(scenarioRegex);
      if (sm) {
        if (current) {
          scenarios.push(current);
        }
        current = { name: sm[1].trim(), steps: [] };
      } else if (current) {
        const m = line.match(stepRegex);
        if (m) {
          current.steps.push(m[2].trim());
        }
      }
    }
  }
  if (current) {
    scenarios.push(current);
  }
  return scenarios;
}
function buildScenarioFunc(initFunc: string, scenarios: Scenario[]): string {
  const lines: string[] = [];
  const registeredSteps = new Set<string>();

  lines.push(`// Registered steps from all scenarios and background:`);

  for (const { name, steps, isBackground } of scenarios) {
    for (const step of steps) {
      const pattern = buildStepPattern(step);
      if (registeredSteps.has(pattern)) {
        continue;
      }
      registeredSteps.add(pattern);

      const handler = toHandlerName(step);
      lines.push(`// From: ${isBackground ? "Background" : name}`);
      lines.push(`ctx.Step(\`${pattern}\`, tctx.${handler})`);
    }
  }

  return `
func ${initFunc}(ctx *godog.ScenarioContext) {
	tctx := InitializeVariables()
${lines.map((line) => "\t" + line).join("\n")}
}
`;
}

function buildStepPattern(step: string): string {
  // Escape all regex meta-characters
  let escaped = step.replace(/([.*+?^${}()|\[\]\\])/g, "\\$1");

  // Replace $placeholders (e.g. $username) with capture groups
  // escaped = escaped.replace(/\$\w+/g, '"([^"]+)"');

  // Replace quoted strings with capture groups
  escaped = escaped.replace(/"[^"]*"/g, '"([^"]+)"');

  return `^${escaped}$`;
}

function toHandlerName(step: string): string {
  // Strip out $placeholders and punctuation, then split into words
  const words = step
    .replace(/"[^"]*"/g, "")
    // .replace(/\$\w+/g, "")
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length);
  // Convert to PascalCase (first letter uppercase)
  var built = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
  return built.replaceAll("Id", "ID");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function deactivate() {}
