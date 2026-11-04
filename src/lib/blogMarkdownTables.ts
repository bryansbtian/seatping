import { Fragment, type Node, type Schema } from "@tiptap/pm/model";

type TableReplacement = { from: number; to: number; table: Node };

function cells(node: Node): Fragment[] | null {
  if (node.type.name !== "paragraph") {
    return null;
  }
  for (let index = 0; index < node.childCount; index += 1) {
    if (!node.child(index).isText) {
      return null;
    }
  }
  const text = node.textContent;
  const separators: number[] = [];
  let escaped = false;
  let code = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "`") {
      let end = index + 1;
      while (text[end] === "`") {
        end += 1;
      }
      const delimiter = text.slice(index, end);
      if (!code) {
        code = delimiter;
      } else if (code === delimiter) {
        code = "";
      }
      index = end - 1;
      continue;
    }
    if (
      character === "|" &&
      !code &&
      !node.nodeAt(index)?.marks.some((mark) => mark.type.name === "code")
    ) {
      separators.push(index);
    }
  }
  if (!separators.length) {
    return null;
  }
  const boundaries = [-1, ...separators, text.length];
  const result: Fragment[] = [];
  for (let index = 1; index < boundaries.length; index += 1) {
    const start = boundaries[index - 1] + 1;
    const end = boundaries[index];
    const raw = text.slice(start, end);
    if (!raw.trim() && (index === 1 || index === boundaries.length - 1)) {
      continue;
    }
    const leading = raw.length - raw.trimStart().length;
    const trailing = raw.length - raw.trimEnd().length;
    result.push(node.content.cut(start + leading, Math.max(start + leading, end - trailing)));
  }
  if (result.length < 2) {
    return null;
  }
  return result;
}

export function markdownTableReplacements(content: Fragment, schema: Schema): TableReplacement[] {
  const blocks: { node: Node; from: number; to: number }[] = [];
  content.forEach((node, offset) =>
    blocks.push({ node, from: offset, to: offset + node.nodeSize }),
  );
  const replacements: TableReplacement[] = [];
  function nextNonempty(index: number): number {
    while (
      index < blocks.length &&
      blocks[index].node.type.name === "paragraph" &&
      !blocks[index].node.content.size
    ) {
      index += 1;
    }
    return index;
  }
  for (let index = 0; index < blocks.length; index += 1) {
    const header = cells(blocks[index].node);
    if (!header) {
      continue;
    }
    const dividerIndex = nextNonempty(index + 1);
    const divider = blocks[dividerIndex] && cells(blocks[dividerIndex].node);
    if (
      !divider ||
      divider.length !== header.length ||
      !divider.every((cell) => /^:?-{3,}:?$/.test(cell.textBetween(0, cell.size)))
    ) {
      continue;
    }
    const alignments = divider.map((cell) => {
      const text = cell.textBetween(0, cell.size);
      if (text.startsWith(":") && text.endsWith(":")) {
        return "center";
      }
      if (text.endsWith(":")) {
        return "right";
      }
      if (text.startsWith(":")) {
        return "left";
      }
      return null;
    });
    function row(values: Fragment[], type: "tableHeader" | "tableCell"): Node {
      return schema.nodes.tableRow.create(
        null,
        values.map((value, column) => {
          const inline: Node[] = [];
          value.forEach((node) => {
            if (node.text) {
              inline.push(schema.text(node.text.replace(/\\([\\|])/g, "$1"), node.marks));
            }
          });
          const paragraph = schema.nodes.paragraph.create(
            { textAlign: alignments[column] },
            inline,
          );
          return schema.nodes[type].create(null, paragraph);
        }),
      );
    }
    const rows = [row(header, "tableHeader")];
    let last = dividerIndex;
    let next = nextNonempty(last + 1);
    while (next < blocks.length) {
      const values = cells(blocks[next].node);
      if (!values || values.length !== header.length) {
        break;
      }
      rows.push(row(values, "tableCell"));
      last = next;
      next = nextNonempty(last + 1);
    }
    replacements.push({
      from: blocks[index].from,
      to: blocks[last].to,
      table: schema.nodes.table.create(null, rows),
    });
    index = last;
  }
  return replacements;
}
