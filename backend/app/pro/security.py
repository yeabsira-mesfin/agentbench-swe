"""Bounded, conservative source heuristics. Not a comprehensive security audit."""
import ast
import re


def scan(source, language):
    findings = []
    status = "limited_static_scan" if language == "Python" else "unsupported"
    if language == "Python":
        try:
            tree = ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    name = node.func.id if isinstance(node.func, ast.Name) else getattr(node.func, "attr", "")
                    if name in {"eval", "exec", "system", "popen"}:
                        findings.append({"rule": "dynamic-execution", "severity": "critical", "line": node.lineno, "message": "Dynamic execution primitive requires security review."})
        except (SyntaxError, ValueError, RecursionError):
            return {"status": "parse_error", "findings": [], "limitation": "Source could not be parsed. No security clearance."}
    for number, line in enumerate(source.splitlines(), 1):
        if re.search(r"\bexecute\s*\(\s*f[\"']", line):
            findings.append({"rule": "sql-interpolation", "severity": "high", "line": number, "message": "Interpolated SQL requires parameterization."})
    return {"status": status, "findings": findings[:50], "limitation": "Heuristic findings only. No findings does not establish safety; aliases and data flow are not analyzed."}
