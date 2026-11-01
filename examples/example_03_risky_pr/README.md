# Example 03: Risky Pull Request (Security Vulnerability / SQL Injection)

## Overview
This example demonstrates a high-risk pull request submitted by an unverified contributor (`guest-coder-99`, trust score `40.0`). The PR introduces a new search route in `backend/app/routes/search.py` containing an unparameterized SQL query vulnerable to SQL Injection.

## Pull Request Details
- **Title**: `fix(query): Add dynamic user search filtering endpoint`
- **Author**: `guest-coder-99`
- **Contributor Trust Status**: `NEUTRAL` (Trust Score: `40.0`)
- **Files Changed**:
  - `backend/app/routes/search.py` (+22 / -0)

## Diff Preview
```patch
diff --git a/backend/app/routes/search.py b/backend/app/routes/search.py
new file mode 100644
--- /dev/null
+++ b/backend/app/routes/search.py
@@ -0,0 +1,22 @@
+from fastapi import APIRouter
+import sqlite3
+
+router = APIRouter()
+
+@router.get("/api/search")
+def search_users(term: str):
+    conn = sqlite3.connect("rampart.db")
+    cursor = conn.cursor()
+    # DANGEROUS: Unparameterized SQL format interpolation
+    query = f"SELECT id, username FROM contributors WHERE username = '{term}'"
+    cursor.execute(query)
+    return cursor.fetchall()
```

## RAMPART Evaluation Pipeline

### Expected vs. Actual Classification
| Metric | Expected | Actual | Status |
| :--- | :--- | :--- | :--- |
| **Quality Category** | `FLAGGED` | `FLAGGED` | ✅ Matched |
| **Risk Level** | `HIGH` | `HIGH` | ✅ Matched |
| **Priority Decision** | `HIGH-RISK FLAG` | `HIGH-RISK FLAG` | ✅ Matched |
| **AI Recommendation** | `REQUEST CHANGES` | `REQUEST CHANGES` | ✅ Matched |

### Why RAMPART Flagged This Pull Request
1. **Critical Vulnerability Detected**: RAMPART's AST pattern analysis and Gemma AI analysis flagged raw f-string SQL query formatting (`SELECT ... WHERE username = '{term}'`).
2. **Deterministic Risk Escalation**: High-risk findings instantly downgrade quality to `FLAGGED` and elevate triage priority to `HIGH-RISK FLAG`.
3. **Actionable Remediation Provided**: RAMPART advises replacing formatted SQL strings with parameterized queries (`cursor.execute(query, (term,))`).

## Inspection
Inspect the generated evaluation payload in [actual_output.json](actual_output.json).
