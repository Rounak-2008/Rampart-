# Example 04: Spam Pull Request (Trivial Whitespace & Churn)

## Overview
This example demonstrates a spam/churn pull request submitted by an untrusted or flagged account (`spam-bot-01`, trust score `20.0`). The PR modifies `README.md` by introducing only trailing spaces and empty blank lines with zero semantic or functional utility.

## Pull Request Details
- **Title**: `chore: formatting and trivial spacing`
- **Author**: `spam-bot-01`
- **Contributor Trust Status**: `FLAGGED` (Trust Score: `20.0`)
- **Files Changed**:
  - `README.md` (+2 / -1)

## Diff Preview
```patch
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,4 +1,5 @@
-# RAMPART
+# RAMPART  
+ 
 Security Platform
```

## RAMPART Evaluation Pipeline

### Expected vs. Actual Classification
| Metric | Expected | Actual | Status |
| :--- | :--- | :--- | :--- |
| **Quality Category** | `SPAM` | `SPAM` | ✅ Matched |
| **Risk Level** | `LOW` | `LOW` | ✅ Matched |
| **Priority Decision** | `SPAM` | `SPAM` | ✅ Matched |
| **AI Recommendation** | `REQUEST CHANGES` | `REQUEST CHANGES` | ✅ Matched |

### Why RAMPART Classified This as Spam
1. **Zero Meaningful Content**: The patch introduces only non-functional whitespace characters to a markdown file.
2. **Untrusted Author**: The submitter has a flagged status and low trust score (`20.0`).
3. **Automated Triage**: Classifying as `SPAM` protects open-source maintainers from notification fatigue and review burnout by filtering out trivial churn.

## Inspection
Inspect the generated evaluation payload in [actual_output.json](actual_output.json).
