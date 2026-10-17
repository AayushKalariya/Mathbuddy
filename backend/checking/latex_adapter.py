"""Translate a deliberately small OCR-LaTeX subset into the bounded grammar.

This bridges recognized text to the checker. It does not load an OCR model,
accept images, execute TeX, or claim support for arbitrary LaTeX.
"""

import re

from .parser import MAX_DEPTH, MathInputError


def latex_to_text(source: str) -> str:
    if len(source) > 256:
        raise MathInputError("Keep each LaTeX line within 256 characters.", "unsupported", "complexity_limit")
    source = source.strip()
    for opening, closing in (("$$", "$$"), ("$", "$"), (r"\(", r"\)"), (r"\[", r"\]")):
        if source.startswith(opening) and source.endswith(closing) and len(source) >= len(opening) + len(closing):
            source = source[len(opening):-len(closing)]
            break
    # Raw whitespace is ignored in LaTeX math: OCR's "1 5" renders as 15.
    # Do this before reading commands so explicit spacing commands stay distinct.
    source = re.sub(r"(?<=\d)\s+(?=\d)", "", source)
    reader = LatexReader(source)
    converted = reader.read(0)
    if len(converted) > 256:
        raise MathInputError("The translated expression is too large.", "unsupported", "complexity_limit")
    return converted


class LatexReader:
    def __init__(self, source: str) -> None:
        self.source = source
        self.index = 0

    def skip_spaces(self) -> None:
        while self.index < len(self.source) and self.source[self.index].isspace():
            self.index += 1

    def group(self, depth: int) -> str:
        self.skip_spaces()
        if self.index == len(self.source):
            raise MathInputError("Finish the LaTeX fraction or group.", "incomplete", "unfinished_input")
        if self.source[self.index] != "{":
            raise MathInputError("Use braces around both parts of a LaTeX fraction.",
                                 "unsupported", "unsupported_notation")
        self.index += 1
        return self.read(depth + 1, closing=True)

    def read(self, depth: int, closing: bool = False) -> str:
        if depth > MAX_DEPTH:
            raise MathInputError("LaTeX groups are nested too deeply.", "unsupported", "complexity_limit")
        pieces: list[str] = []
        while self.index < len(self.source):
            character = self.source[self.index]
            if character == "}":
                if not closing:
                    raise MathInputError("Check the LaTeX braces.")
                self.index += 1
                return "".join(pieces)
            if character == "{":
                pieces.append("(" + self.group(depth) + ")")
                continue
            if character == "\\":
                self.index += 1
                if self.index == len(self.source):
                    raise MathInputError("Finish the LaTeX command.", "incomplete", "unfinished_input")
                match = re.match(r"[a-zA-Z]+", self.source[self.index:])
                if match is None:
                    if self.source[self.index] in ",;! ":
                        self.index += 1
                        pieces.append(" ")
                        continue
                    raise MathInputError("This LaTeX command is not supported yet.", "unsupported", "unsupported_notation")
                command = match.group()
                self.index += len(command)
                if command in ("frac", "dfrac", "tfrac"):
                    top = self.group(depth)
                    bottom = self.group(depth)
                    pieces.append(f"(({top})/({bottom}))")
                elif command in ("left", "right", "displaystyle"):
                    pass
                elif command in ("cdot", "times"):
                    pieces.append("*")
                elif command == "div":
                    pieces.append("/")
                elif command in ("quad", "qquad"):
                    pieces.append(" ")
                elif command in ("mathrm", "mathit", "mathbf"):
                    atom = self.group(depth).strip()
                    if not re.fullmatch(r"[a-zA-Z]|[0-9]+(?:\.[0-9]+)?", atom):
                        raise MathInputError("Only a single letter or number is supported inside a font command.",
                                             "unsupported", "unsupported_notation")
                    pieces.append(atom)
                else:
                    raise MathInputError(f"LaTeX command \\{command} is not supported by this checker yet.",
                                         "unsupported", "unsupported_notation")
                continue
            if character in "%#&_~$":
                raise MathInputError("This LaTeX notation is not supported yet.", "unsupported", "unsupported_notation")
            pieces.append({"[": "(", "]": ")"}.get(character, character))
            self.index += 1
        if closing:
            raise MathInputError("Close the LaTeX braces before checking.", "incomplete", "unfinished_input")
        return "".join(pieces)
