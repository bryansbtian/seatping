import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function componentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return componentFiles(path);
    }
    if (entry.name.endsWith(".tsx")) {
      return [path];
    }
    return [];
  });
}

function isAccessibleLabel(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isJsxAttribute(parent)) {
    const attribute = parent.name.getText();
    if (attribute === "aria-label") {
      return true;
    }
    if (attribute === "label") {
      const element = parent.parent.parent;
      if (ts.isJsxSelfClosingElement(element) || ts.isJsxOpeningElement(element)) {
        return /Skeleton$|^RouteLoading$/.test(element.tagName.getText());
      }
    }
  }
  if (ts.isJsxElement(parent)) {
    return parent.openingElement.attributes.properties.some((property) => {
      if (ts.isJsxAttribute(property) && property.name.getText() === "className") {
        const value = property.initializer;
        return Boolean(value && ts.isStringLiteral(value) && /\bsr-only\b/.test(value.text));
      }
      return false;
    });
  }
  return false;
}

describe("loading presentation", () => {
  it("keeps Loading messages in accessible labels instead of visible page copy", () => {
    const findings: string[] = [];
    for (const file of [...componentFiles("src/pages"), ...componentFiles("src/components")]) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node): void {
        if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) {
          if (/^\s*Loading(?:\s|[.…]|$)/i.test(node.text) && !isAccessibleLabel(node)) {
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            findings.push(`${file}:${line}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(findings).toEqual([]);
  });
});
