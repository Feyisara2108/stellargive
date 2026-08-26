import os

for step in [7, 8, 9]:
    filepath = f".github/workflows/workflow-step-{step}.yml"
    with open(filepath, "r") as f:
        content = f.read()
    
    # Add actionlint_flags if not exists
    if "actionlint_flags" not in content:
        content = content.replace("level: warning\n          reporter: github-pr-check", f"level: warning\n          reporter: github-pr-check\n          actionlint_flags: .github/workflows/workflow-step-{step}.yml")
        
    with open(filepath, "w") as f:
        f.write(content)

