# Example 02: Average Pull Request (Code Refactor Without Tests)

## Overview
This example demonstrates an average pull request submitted by a beginner contributor (`dev-contributor-2`, trust score `50.0`). The PR modifies core database connection and batch execution logic in `backend/app/database.py` without supplying accompanying unit tests.

## Pull Request Details
- **Title**: `refactor(db): Reorganize connection pool queries`
- **Author**: `dev-contributor-2`
- **Contributor Trust Status**: `BEGINNER` (Trust Score: `50.0`)
- **Files Changed**:
  - `backend/app/database.py` (+35 / -12)

## Diff Preview
```patch
diff --git a/backend/app/database.py b/backend/app/database.py
--- a/backend/app/database.py
+++ b/backend/app/database.py
@@ -42,12 +42,35 @@ def get_db_pool():
-    return sqlite3.connect("rampart.db")
+    # Connect without timeout or retry handling
+    conn = sqlite3.connect("rampart.db", timeout=60.0)
+    conn.execute("PRAGMA journal_mode=WAL;")
+    return conn
+
+def execute_raw_batch(statements):
+    conn = get_db_pool()
+    cursor = conn.cursor()
+    for stmt in statements:
+        cursor.execute(stmt)
+    conn.commit()
```

## RAMPART Evaluation Pipeline

### Expected vs. Actual Classification
| Metric | Expected | Actual | Status |
| :--- | :--- | :--- | :--- |
| **Quality Category** | `AVERAGE` | `AVERAGE` | ✅ Matched |
| **Risk Level** | `MEDIUM` | `MEDIUM` | ✅ Matched |
| **Priority Decision** | `NORMAL REVIEW` | `NORMAL REVIEW` | ✅ Matched |
| **AI Recommendation** | `NEEDS HUMAN REVIEW` | `NEEDS HUMAN REVIEW` | ✅ Matched |

### Why RAMPART Flagged for Human Review
1. **Unverified Contributor**: The author is a `BEGINNER` (first contribution), requiring human maintainer oversight.
2. **Missing Test Evidence**: Core database querying and batch execution methods were introduced without unit tests (`NOT_EXECUTED`).
3. **Medium Architectural Risk**: Batch execution without transaction rollbacks or explicit parameterization warrants careful maintainer inspection.

## Inspection
Inspect the generated evaluation payload in [actual_output.json](actual_output.json).
