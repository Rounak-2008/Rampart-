# Example 01: Good Pull Request (Feature with Tests)

## Overview
This example demonstrates a high-quality pull request submitted by an established contributor (`charlie-sec`, trust score `75.0`). The PR introduces a token bucket rate-limiting middleware in FastAPI with complete unit test coverage.

## Pull Request Details
- **Title**: `feat(auth): Add token bucket rate-limiting middleware with tests`
- **Author**: `charlie-sec`
- **Contributor Trust Status**: `ESTABLISHED` (Trust Score: `75.0`)
- **Files Changed**:
  - `backend/app/middleware/rate_limit.py` (+48 / -0)
  - `backend/tests/test_rate_limit.py` (+32 / -0)

## Diff Preview
```patch
diff --git a/backend/app/middleware/rate_limit.py b/backend/app/middleware/rate_limit.py
new file mode 100644
--- /dev/null
+++ b/backend/app/middleware/rate_limit.py
@@ -0,0 +1,48 @@
+import time
+from collections import defaultdict
+
+class TokenBucketRateLimiter:
+    """Thread-safe token bucket rate limiter for FastAPI routes."""
+...
diff --git a/backend/tests/test_rate_limit.py b/backend/tests/test_rate_limit.py
new file mode 100644
--- /dev/null
+++ b/backend/tests/test_rate_limit.py
@@ -0,0 +1,32 @@
+import unittest
+import time
+from app.middleware.rate_limit import TokenBucketRateLimiter
+...
+```

## RAMPART Evaluation Pipeline

### Expected vs. Actual Classification
| Metric | Expected | Actual | Status |
| :--- | :--- | :--- | :--- |
| **Quality Category** | `GOOD` | `GOOD` | ✅ Matched |
| **Risk Level** | `LOW` | `LOW` | ✅ Matched |
| **Priority Decision** | `PRIORITY REVIEW` | `PRIORITY REVIEW` | ✅ Matched |
| **AI Recommendation** | `APPROVE` | `APPROVE` | ✅ Matched |

### Why RAMPART Recommended Approval
1. **Established Trust**: The author has a high trust score (`75.0`), qualifying for expedited review.
2. **High Code Quality**: The PR implements clean modular logic and includes 32 lines of comprehensive unit tests.
3. **Low Risk**: No architectural anti-patterns or insecure database queries detected.

## Inspection
Inspect the generated evaluation payload in [actual_output.json](actual_output.json).
