import subprocess
import os

repo_dir = r"c:\Users\LENOVO\Desktop\Duke\Projects\Duke-Capstone\Duke_Capstone"
file_path = "frontend/src/pages/ProjectDisplay.jsx"

# Execute git show
result = subprocess.run(["git", "show", f"HEAD:{file_path}"], cwd=repo_dir, capture_output=True, text=True)

if result.returncode == 0:
    original_code = result.stdout
    with open(os.path.join(repo_dir, file_path), "w", encoding="utf-8") as f:
        f.write(original_code)
    print("ProjectDisplay restored to HEAD.")
else:
    print(f"Git failed: {result.stderr}")
