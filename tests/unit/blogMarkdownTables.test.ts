import { getSchema } from "@tiptap/core";
import { Fragment, type Node } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { blogExtensions } from "../../shared/blogEditorExtensions.js";
import { blogContentSchema } from "../../shared/blog.js";
import { markdownTableReplacements } from "../../src/lib/blogMarkdownTables.js";

const schema = getSchema(blogExtensions());
function paragraph(text: string): Node {
  const content: Node[] = [];
  if (text) {
    content.push(schema.text(text));
  }
  return schema.nodes.paragraph.create(null, content);
}
function convert(lines: string[]) {
  return markdownTableReplacements(Fragment.from(lines.map(paragraph)), schema);
}

describe("Markdown Tables", () => {
  it("converts spaced comparison rows without consuming surrounding article content", () => {
    const lines = [
      "Before the table.",
      "| Feature | Paper | SeatPing |",
      "",
      "|---|---|---|",
      "",
      "| Check-in | Staff-assisted | Self-check-in |",
      "",
      "| Notifications | Verbal | Digital |",
      "",
      "After the table.",
    ];
    const [replacement] = convert(lines);
    expect(replacement.from).toBe(paragraph(lines[0]).nodeSize);
    expect(replacement.to).toBe(
      lines
        .slice(0, 8)
        .map(paragraph)
        .reduce((size, node) => size + node.nodeSize, 0),
    );
    expect(replacement.table.childCount).toBe(3);
    expect(replacement.table.child(0).child(0).type.name).toBe("tableHeader");
    expect(replacement.table.child(1).child(0).type.name).toBe("tableCell");
    expect(replacement.table.child(1).child(2).textContent).toBe("Self-check-in");
    expect(
      blogContentSchema.safeParse({ type: "doc", content: [replacement.table.toJSON()] }).success,
    ).toBe(true);
  });

  it("preserves rich inline formatting and links inside table cells", () => {
    const body = schema.nodes.paragraph.create(null, [
      schema.text("| "),
      schema.text("Guest", [schema.marks.bold.create()]),
      schema.text(" | "),
      schema.text("Guide", [schema.marks.link.create({ href: "https://example.test/guide" })]),
      schema.text(" |"),
    ]);
    const [replacement] = markdownTableReplacements(
      Fragment.from([paragraph("| Name | Link |"), paragraph("|---|---|"), body]),
      schema,
    );
    expect(replacement.table.child(1).child(0).child(0).child(0).marks[0].type.name).toBe("bold");
    expect(replacement.table.child(1).child(1).child(0).child(0).marks[0].attrs.href).toBe(
      "https://example.test/guide",
    );
  });

  it("supports omitted outer pipes, empty cells, and column alignments", () => {
    const [replacement] = convert([
      "Left | Center | Right | Default",
      ":--- | :---: | ---: | ---",
      "a | | c | d",
    ]);
    expect(replacement.table.child(1).childCount).toBe(4);
    expect(replacement.table.child(1).child(1).child(0).content.size).toBe(0);
    expect(
      [0, 1, 2, 3].map((index) => replacement.table.child(0).child(index).child(0).attrs.textAlign),
    ).toEqual(["left", "center", "right", null]);
  });

  it("does not split escaped pipes or inline code spans", () => {
    const [replacement] = convert([
      "| Format | Description |",
      "|---|---|",
      "| A\\|B | `A|B` and ``C`|D`` |",
      "| C\\\\D | Empty |",
    ]);
    expect(replacement.table.childCount).toBe(3);
    expect(replacement.table.child(1).child(0).textContent).toBe("A|B");
    expect(replacement.table.child(1).child(1).textContent).toBe("`A|B` and ``C`|D``");
    expect(replacement.table.child(2).child(0).textContent).toBe("C\\D");
  });

  it("preserves pipes already formatted as code", () => {
    const body = schema.nodes.paragraph.create(null, [
      schema.text("| "),
      schema.text("A|B", [schema.marks.code.create()]),
      schema.text(" | Example |"),
    ]);
    const [replacement] = markdownTableReplacements(
      Fragment.from([paragraph("| Value | Meaning |"), paragraph("|---|---|"), body]),
      schema,
    );
    expect(replacement.table.child(1).child(0).textContent).toBe("A|B");
    expect(replacement.table.child(1).child(0).child(0).child(0).marks[0].type.name).toBe("code");
  });

  it.each([
    ["Ordinary prose"],
    ["| Single |", "|---|"],
    ["| A | B |"],
    ["| A | B |", "|--|---|", "| C | D |"],
    ["| A | B |", "|---|---|---|", "| C | D |"],
    ["A\\|B", "---\\|---"],
  ])("leaves non-tables and invalid separators unchanged: %j", (...lines) => {
    expect(convert(lines)).toEqual([]);
  });

  it("leaves code blocks and paragraphs with hard breaks unchanged", () => {
    const code = schema.nodes.codeBlock.create(
      null,
      schema.text("| A | B |\n|---|---|\n| C | D |"),
    );
    const broken = schema.nodes.paragraph.create(null, [
      schema.text("| A | B |"),
      schema.nodes.hardBreak.create(),
      schema.text("|---|---|"),
    ]);
    expect(markdownTableReplacements(Fragment.from([code, broken]), schema)).toEqual([]);
  });

  it("finds multiple tables and leaves inconsistent trailing rows intact", () => {
    const result = convert([
      "| A | B |",
      "|---|---|",
      "| C | D | E |",
      "Between.",
      "| X | Y |",
      "|---|---|",
      "| Z | W |",
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].table.childCount).toBe(1);
    expect(result[1].table.childCount).toBe(2);
    expect(result[1].from).toBeGreaterThan(result[0].to);
  });
});
