import { lexer, parse, type SyntaxParseError, walk } from "css-tree";

export interface CssProblem {
  from: number;
  to: number;
  // an error is css that doesn't parse, so the rules around it are lost; a
  // warning is a rule a browser keeps but may not understand
  severity: "error" | "warning";
  message: string;
}

function firstLine(message: string): string {
  const [line] = message.split("\n");
  return line ?? message;
}

export function cssProblems(text: string): CssProblem[] {
  const problems: CssProblem[] = [];
  const within = (offset: number): number =>
    Math.max(0, Math.min(offset, text.length));
  const ast = parse(text, {
    positions: true,
    onParseError: (error: SyntaxParseError) => {
      problems.push({
        from: within(error.offset),
        to: within(error.offset + 1),
        severity: "error",
        message: firstLine(error.message),
      });
    },
  });
  walk(ast, {
    visit: "Declaration",
    enter: (node) => {
      if (!node.property.startsWith("--")) {
        const { error } = lexer.matchDeclaration(node);
        if (error) {
          const start = node.loc?.start.offset ?? 0;
          problems.push({
            from: within(start),
            to: within(node.loc?.end.offset ?? start + 1),
            severity: "warning",
            message: firstLine(
              "rawMessage" in error ? `${error.rawMessage}` : error.message,
            ),
          });
        }
      }
    },
  });
  return problems.sort((left, right) => left.from - right.from);
}

export function malformed(problems: readonly CssProblem[]): boolean {
  return problems.some(({ severity }) => severity === "error");
}
